use rusqlite::params;
use anyhow::Result;
use crate::vault::find_vault_root;
use super::models::{IndexSummary, SearchResult};
use super::schema::open_or_create_db;

/// Background indexing pass: scans vault/books/, parses paragraphs, and updates FTS5 table.
pub fn index_vault_blocking() -> Result<IndexSummary> {
    let start_time = std::time::Instant::now();
    let mut conn = open_or_create_db()?;
    let vault_root = find_vault_root()?;
    let books_dir = vault_root.join("books");

    let mut total_chapters = 0;
    let mut total_paragraphs = 0;

    if !books_dir.exists() {
        return Ok(IndexSummary {
            chapters_indexed: 0,
            paragraphs_indexed: 0,
            duration_ms: start_time.elapsed().as_millis(),
        });
    }

    let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;

    for book_entry in std::fs::read_dir(&books_dir)? {
        let book_entry = book_entry?;
        let book_path = book_entry.path();
        if !book_path.is_dir() {
            continue;
        }

        let book_id = book_path.file_name().unwrap_or_default().to_string_lossy().to_string();
        let meta_file = book_path.join("_meta.json");
        if !meta_file.exists() {
            continue;
        }

        // Read metadata
        let meta_str = std::fs::read_to_string(&meta_file)?;
        let meta_val: serde_json::Value = serde_json::from_str(&meta_str)?;
        let spine = meta_val["spine"].as_array();

        if let Some(chapters) = spine {
            for ch in chapters {
                let ch_id = ch["id"].as_str().unwrap_or("").to_string();
                let ch_title = ch["title"].as_str().unwrap_or("").to_string();
                let ch_file = ch["file_path"].as_str().unwrap_or("").to_string();

                if ch_id.is_empty() || ch_file.is_empty() {
                    continue;
                }

                let ch_path = book_path.join(&ch_file);
                if !ch_path.exists() {
                    continue;
                }

                let raw_content = std::fs::read_to_string(&ch_path)?;
                let content = raw_content.replace("\r\n", "\n");

                // Simple hash to detect updates
                let content_hash = format!("{:x}", md5_hash(&content));

                // Check if already indexed with same hash and has indexed rows
                let mut check_stmt = tx.prepare_cached(
                    "SELECT content_hash FROM indexed_chapters WHERE book_id = ? AND chapter_id = ?"
                )?;
                let existing_hash: Option<String> = check_stmt
                    .query_row(params![&book_id, &ch_id], |row| row.get(0))
                    .ok();

                let existing_count: i64 = tx.query_row(
                    "SELECT COUNT(*) FROM search_index WHERE book_id = ? AND chapter_id = ?",
                    params![&book_id, &ch_id],
                    |row| row.get(0),
                ).unwrap_or(0);

                if let Some(ref h) = existing_hash {
                    if h == &content_hash && existing_count > 0 {
                        // Already up to date
                        continue;
                    }
                }

                // Delete old FTS5 rows for this chapter if re-indexing
                tx.execute(
                    "DELETE FROM search_index WHERE book_id = ? AND chapter_id = ?",
                    params![&book_id, &ch_id]
                )?;

                // Parse paragraphs and anchors
                let blocks = content.split("\n\n");
                for block in blocks {
                    let trimmed = block.trim();
                    if trimmed.is_empty() || trimmed.starts_with('#') {
                        continue;
                    }

                    // Extract anchor: ^p-xxx
                    let mut anchor = String::new();
                    let mut para_text = trimmed.to_string();

                    if let Some(pos) = trimmed.rfind("^p-") {
                        anchor = trimmed[pos..].trim().to_string();
                        para_text = trimmed[..pos].trim().to_string();
                    }

                    if para_text.is_empty() {
                        continue;
                    }

                    // Insert into search_index
                    tx.execute(
                        "INSERT INTO search_index (book_id, chapter_id, chapter_title, chapter_file, anchor, content)
                         VALUES (?, ?, ?, ?, ?, ?)",
                        params![&book_id, &ch_id, &ch_title, &ch_file, &anchor, &para_text]
                    )?;
                    total_paragraphs += 1;
                }

                // Record indexed chapter
                tx.execute(
                    "INSERT INTO indexed_chapters (book_id, chapter_id, file_path, title, content_hash)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(book_id, chapter_id) DO UPDATE SET
                         title = excluded.title,
                         file_path = excluded.file_path,
                         content_hash = excluded.content_hash,
                         indexed_at = CURRENT_TIMESTAMP",
                    params![&book_id, &ch_id, &ch_file, &ch_title, &content_hash]
                )?;

                total_chapters += 1;
            }
        }
    }

    tx.commit()?;

    Ok(IndexSummary {
        chapters_indexed: total_chapters,
        paragraphs_indexed: total_paragraphs,
        duration_ms: start_time.elapsed().as_millis(),
    })
}

/// Executes an FTS5 search query returning snippets with <mark> tags.
pub fn search_vault_blocking(raw_query: &str) -> Result<Vec<SearchResult>> {
    let clean_query = sanitize_fts5_query(raw_query);
    if clean_query.is_empty() {
        return Ok(Vec::new());
    }

    let conn = open_or_create_db()?;

    let mut stmt = conn.prepare_cached(
        "SELECT
             book_id,
             chapter_id,
             chapter_title,
             chapter_file,
             anchor,
             snippet(search_index, 5, '<mark>', '</mark>', '...', 18) AS snippet_text,
             bm25(search_index) AS rank
         FROM search_index
         WHERE search_index MATCH ?
         ORDER BY rank
         LIMIT 30;"
    )?;

    let rows = stmt.query_map(params![clean_query], |row| {
        Ok(SearchResult {
            book_id: row.get(0)?,
            chapter_id: row.get(1)?,
            chapter_title: row.get(2)?,
            chapter_file: row.get(3)?,
            anchor: row.get(4)?,
            snippet: row.get(5)?,
            rank: row.get(6)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }

    Ok(results)
}

/// Formats raw search input into valid FTS5 prefix syntax
pub fn sanitize_fts5_query(query: &str) -> String {
    let tokens: Vec<String> = query
        .split_whitespace()
        .map(|w| {
            let cleaned: String = w.chars().filter(|c| c.is_alphanumeric()).collect();
            cleaned
        })
        .filter(|w| !w.is_empty())
        .map(|w| format!("{}*", w))
        .collect();

    tokens.join(" ")
}

pub fn md5_hash(text: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut hasher);
    hasher.finish()
}
