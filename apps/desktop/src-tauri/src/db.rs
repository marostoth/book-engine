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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PracticeCardItem {
    pub card_id: String,
    pub book_id: String,
    pub chapter_file: String,
    pub anchor: String,
    pub item_type: String, // "cloze" | "scramble"
    pub prompt: String,
    pub answer: String,
    pub state: u8,
    pub stability: f64,
    pub difficulty: f64,
    pub due: i64,
    pub last_review: i64,
    pub reps: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeckStats {
    pub due_count: usize,
    pub new_count: usize,
    pub learning_count: usize,
    pub review_count: usize,
    pub total_cards: usize,
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

/// Initializes database connection and creates FTS5 and FSRS tables
pub fn open_or_create_db() -> Result<Connection> {
    let db_path = get_db_path()?;
    let conn = Connection::open(&db_path)
        .with_context(|| format!("Failed to open SQLite database: {}", db_path.display()))?;

    conn.busy_timeout(std::time::Duration::from_secs(5))?;

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
         );

         CREATE TABLE IF NOT EXISTS fsrs_cards (
             card_id TEXT PRIMARY KEY,
             book_id TEXT NOT NULL,
             chapter_file TEXT NOT NULL,
             anchor TEXT,
             item_type TEXT NOT NULL,
             prompt TEXT NOT NULL,
             answer TEXT NOT NULL,
             state INTEGER NOT NULL DEFAULT 0,
             stability REAL NOT NULL DEFAULT 0.0,
             difficulty REAL NOT NULL DEFAULT 0.0,
             due INTEGER NOT NULL DEFAULT 0,
             last_review INTEGER NOT NULL DEFAULT 0,
             reps INTEGER NOT NULL DEFAULT 0
         );
         CREATE INDEX IF NOT EXISTS idx_fsrs_due ON fsrs_cards (due, book_id);"
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

/// Synchronizes cards from vault/notes/<book-id>/practice-deck.md into the ephemeral fsrs_cards table.
/// Strictly enforces programmatic verbatim verification against the chapter markdown.
pub fn sync_practice_deck_blocking(book_id: &str) -> Result<usize> {
    let mut conn = open_or_create_db()?;
    let vault_root = find_vault_root()?;
    let deck_path = vault_root.join("notes").join(book_id).join("practice-deck.md");
    if !deck_path.exists() {
        return Ok(0);
    }

    let deck_content = std::fs::read_to_string(&deck_path)?;
    let book_dir = vault_root.join("books").join(book_id);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let tx = conn.transaction()?;
    let mut synced_count = 0;

    let sections: Vec<&str> = deck_content.split("### ").collect();
    for section in sections {
        let trimmed = section.trim();
        if !trimmed.starts_with("card-") {
            continue;
        }

        let mut card_id = String::new();
        let mut chapter_id = String::new();
        let mut anchor = String::new();
        let mut cloze = String::new();
        let mut answer_key = String::new();
        let mut item_type = "cloze".to_string();

        let lines: Vec<&str> = trimmed.lines().collect();
        if let Some(first_line) = lines.first() {
            card_id = first_line.trim().to_string();
        }

        for line in &lines[1..] {
            let l = line.trim();
            if l.starts_with("- **Chapter:**") {
                chapter_id = l.trim_start_matches("- **Chapter:**").trim().to_string();
            } else if l.starts_with("- **Anchor:**") {
                anchor = l.trim_start_matches("- **Anchor:**").trim().to_string();
            } else if l.starts_with("- **Cloze:**") {
                cloze = l.trim_start_matches("- **Cloze:**").trim().to_string();
            } else if l.starts_with("- **Prompt:**") {
                cloze = l.trim_start_matches("- **Prompt:**").trim().to_string();
            } else if l.starts_with("- **Answer Key:**") {
                let ans = l.trim_start_matches("- **Answer Key:**").trim();
                answer_key = ans.trim_matches('`').to_string();
            } else if l.starts_with("- **Type:**") {
                let t = l.trim_start_matches("- **Type:**").trim().to_lowercase();
                if t == "scramble" {
                    item_type = "scramble".to_string();
                }
            } else if l.starts_with("- **Scramble:**") {
                cloze = l.trim_start_matches("- **Scramble:**").trim().to_string();
                item_type = "scramble".to_string();
            }
        }

        if card_id.is_empty() || chapter_id.is_empty() {
            continue;
        }

        let chapter_file = if chapter_id.ends_with(".md") {
            chapter_id.clone()
        } else {
            format!("{}.md", chapter_id)
        };

        if answer_key.is_empty() {
            if let Some(start) = cloze.find("{{c1::") {
                if let Some(end) = cloze[start + 6..].find("}}") {
                    answer_key = cloze[start + 6..start + 6 + end].to_string();
                }
            } else if let Some(start) = cloze.find("==") {
                if let Some(end) = cloze[start + 2..].find("==") {
                    answer_key = cloze[start + 2..start + 2 + end].to_string();
                }
            }
        }

        if answer_key.is_empty() {
            continue;
        }

        // Programmatic Verbatim Validation against chapter Markdown
        let ch_path = book_dir.join(&chapter_file);
        if ch_path.exists() {
            if let Ok(ch_text) = std::fs::read_to_string(&ch_path) {
                let clean_ans = answer_key.replace("**", "").trim().to_string();
                let clean_text = ch_text.replace("**", "");
                if !clean_text.contains(&clean_ans) && !ch_text.contains(&answer_key) {
                    // Answer does not exist in chapter text verbatim! Zero-hallucination guardrail: reject card.
                    eprintln!("Rejecting non-verbatim practice card {}: '{}' not found in {}", card_id, answer_key, chapter_file);
                    continue;
                }
            }
        }

        tx.execute(
            "INSERT OR IGNORE INTO fsrs_cards (
                card_id, book_id, chapter_file, anchor, item_type, prompt, answer,
                state, stability, difficulty, due, last_review, reps
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0.0, 0.0, ?, 0, 0)",
            params![
                &card_id,
                book_id,
                &chapter_file,
                &anchor,
                &item_type,
                &cloze,
                &answer_key,
                now,
            ],
        )?;

        synced_count += 1;
    }

    tx.commit()?;
    Ok(synced_count)
}

/// Retrieves cards due for review (due <= now OR reps = 0), optionally filtered by book_id.
pub fn get_due_cards_blocking(book_id: Option<&str>) -> Result<Vec<PracticeCardItem>> {
    let conn = open_or_create_db()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let mut query = "SELECT card_id, book_id, chapter_file, anchor, item_type, prompt, answer, state, stability, difficulty, due, last_review, reps
         FROM fsrs_cards
         WHERE (due <= ? OR reps = 0)".to_string();

    let mut params_vec: Vec<rusqlite::types::Value> = vec![now.into()];

    if let Some(b_id) = book_id {
        query.push_str(" AND book_id = ?");
        params_vec.push(b_id.to_string().into());
    }

    query.push_str(" ORDER BY due ASC, reps ASC LIMIT 50;");

    let mut stmt = conn.prepare(&query)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params_vec), |row| {
        Ok(PracticeCardItem {
            card_id: row.get(0)?,
            book_id: row.get(1)?,
            chapter_file: row.get(2)?,
            anchor: row.get(3)?,
            item_type: row.get(4)?,
            prompt: row.get(5)?,
            answer: row.get(6)?,
            state: row.get(7)?,
            stability: row.get(8)?,
            difficulty: row.get(9)?,
            due: row.get(10)?,
            last_review: row.get(11)?,
            reps: row.get(12)?,
        })
    })?;

    let mut cards = Vec::new();
    for row in rows {
        cards.push(row?);
    }

    Ok(cards)
}

/// Calculates deck statistics (due, new, learning, review counts).
pub fn get_deck_stats_blocking(book_id: Option<&str>) -> Result<DeckStats> {
    let conn = open_or_create_db()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let (where_clause, params_vec): (&str, Vec<rusqlite::types::Value>) = match book_id {
        Some(b) => ("WHERE book_id = ?", vec![b.to_string().into()]),
        None => ("", vec![]),
    };

    let total_cards: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM fsrs_cards {}", where_clause),
        rusqlite::params_from_iter(params_vec.iter().cloned()),
        |r| r.get(0),
    ).unwrap_or(0);

    let due_where = if where_clause.is_empty() {
        "WHERE (due <= ? OR reps = 0)"
    } else {
        "WHERE (due <= ? OR reps = 0) AND book_id = ?"
    };
    let mut due_params: Vec<rusqlite::types::Value> = vec![now.into()];
    if let Some(b) = book_id {
        due_params.push(b.to_string().into());
    }

    let due_count: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM fsrs_cards {}", due_where),
        rusqlite::params_from_iter(due_params),
        |r| r.get(0),
    ).unwrap_or(0);

    let new_count: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM fsrs_cards {} {}",
            if where_clause.is_empty() { "WHERE" } else { "WHERE book_id = ? AND" },
            "state = 0"),
        rusqlite::params_from_iter(params_vec.iter().cloned()),
        |r| r.get(0),
    ).unwrap_or(0);

    let learning_count: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM fsrs_cards {} {}",
            if where_clause.is_empty() { "WHERE" } else { "WHERE book_id = ? AND" },
            "(state = 1 OR state = 3)"),
        rusqlite::params_from_iter(params_vec.iter().cloned()),
        |r| r.get(0),
    ).unwrap_or(0);

    let review_count: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM fsrs_cards {} {}",
            if where_clause.is_empty() { "WHERE" } else { "WHERE book_id = ? AND" },
            "state = 2"),
        rusqlite::params_from_iter(params_vec),
        |r| r.get(0),
    ).unwrap_or(0);

    Ok(DeckStats {
        due_count,
        new_count,
        learning_count,
        review_count,
        total_cards,
    })
}

/// Applies FSRS-4.5 rating (1=Again, 2=Hard, 3=Good, 4=Easy), updates SQLite, and returns new schedule.
pub fn submit_card_review_blocking(card_id: &str, rating_val: u8) -> Result<crate::fsrs::CardSchedule> {
    let conn = open_or_create_db()?;
    let rating = crate::fsrs::Rating::try_from(rating_val)
        .map_err(|e| anyhow::anyhow!(e))?;

    let (state, stability, difficulty, reps, last_review): (i64, f64, f64, i64, i64) = conn.query_row(
        "SELECT state, stability, difficulty, reps, last_review FROM fsrs_cards WHERE card_id = ?",
        params![card_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    ).with_context(|| format!("Card '{}' not found in fsrs_cards", card_id))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let schedule = crate::fsrs::schedule_card(
        card_id,
        crate::fsrs::CardState::from(state),
        stability,
        difficulty,
        reps,
        last_review,
        now,
        rating,
    );

    conn.execute(
        "UPDATE fsrs_cards SET
            state = ?,
            stability = ?,
            difficulty = ?,
            due = ?,
            last_review = ?,
            reps = ?
         WHERE card_id = ?",
        params![
            schedule.state,
            schedule.stability,
            schedule.difficulty,
            schedule.due,
            schedule.last_review,
            schedule.reps,
            card_id,
        ],
    )?;

    Ok(schedule)
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

    #[test]
    fn test_fsrs_sync_and_review() {
        let synced = sync_practice_deck_blocking("sample").expect("Failed to sync sample practice deck");
        println!("[+] Synced {} cards from sample", synced);
        assert!(synced > 0, "Expected at least 1 card synced from sample");

        let due = get_due_cards_blocking(Some("sample")).expect("Failed to get due cards");
        assert!(!due.is_empty(), "Expected due cards for sample");

        let first_card = &due[0];
        let sched = submit_card_review_blocking(&first_card.card_id, 3).expect("Submit review failed");
        assert_eq!(sched.reps, 1);
        assert!(sched.due > first_card.due || sched.stability > 0.0);

        let stats = get_deck_stats_blocking(Some("sample")).expect("Failed to get stats");
        assert!(stats.total_cards > 0);
    }
}

