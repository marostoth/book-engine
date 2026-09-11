use std::path::PathBuf;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use anyhow::{Context, Result};
use crate::vault::find_vault_root;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub book_id: String,
    pub chapter_id: String,
    pub chapter_title: String,
    pub chapter_file: String,
    pub anchor: String,
    pub snippet: String,
    pub rank: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexSummary {
    pub chapters_indexed: usize,
    pub paragraphs_indexed: usize,
    pub duration_ms: u128,
}

/// Returns the OS AppData path for the ephemeral database: %APPDATA%\book-engine\app_cache\index.db
pub fn get_db_path() -> Result<PathBuf> {
    let base = if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("book-engine").join("app_cache")
    } else if let Ok(userprofile) = std::env::var("USERPROFILE") {
        PathBuf::from(userprofile).join(".book-engine").join("app_cache")
    } else {
        std::env::temp_dir().join("book-engine").join("app_cache")
    };

    std::fs::create_dir_all(&base)
        .with_context(|| format!("Failed to create cache directory: {}", base.display()))?;

    Ok(base.join("index.db"))
}

/// Initializes database connection and creates FTS5 tables
pub fn open_or_create_db() -> Result<Connection> {
    let db_path = get_db_path()?;
    let conn = Connection::open(&db_path)
        .with_context(|| format!("Failed to open SQLite database: {}", db_path.display()))?;

    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA temp_store = MEMORY;

         CREATE TABLE IF NOT EXISTS indexed_chapters (
             book_id TEXT NOT NULL,
             chapter_id TEXT NOT NULL,
             file_path TEXT NOT NULL,
             title TEXT NOT NULL,
             content_hash TEXT NOT NULL,
             indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
             PRIMARY KEY (book_id, chapter_id)
         );

         CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
             book_id UNINDEXED,
             chapter_id UNINDEXED,
             chapter_title UNINDEXED,
             chapter_file UNINDEXED,
             anchor UNINDEXED,
             content,
             tokenize = 'porter unicode61'
         );"
    ).context("Failed to initialize database tables")?;

    Ok(conn)
}

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

    let tx = conn.transaction()?;

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
fn sanitize_fts5_query(query: &str) -> String {
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

fn md5_hash(text: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut hasher);
    hasher.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_index_and_search() {
        let summary = index_vault_blocking().expect("Indexing vault failed");
        println!("[+] Indexed {} chapters, {} paragraphs in {} ms",
            summary.chapters_indexed, summary.paragraphs_indexed, summary.duration_ms);

        let results = search_vault_blocking("division of labour").expect("Search failed");
        println!("[+] Search 'division of labour' returned {} results", results.len());
        assert!(!results.is_empty(), "Expected search results for 'division of labour'");
    }
}

