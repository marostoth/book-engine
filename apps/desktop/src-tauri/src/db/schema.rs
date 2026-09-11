use std::path::PathBuf;
use rusqlite::Connection;
use anyhow::{Context, Result};

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

/// Initializes database connection and creates FTS5, FSRS, review logs, and reading sessions tables
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
         CREATE INDEX IF NOT EXISTS idx_fsrs_due ON fsrs_cards (due, book_id);

         CREATE TABLE IF NOT EXISTS review_logs (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             card_id TEXT NOT NULL,
             book_id TEXT NOT NULL,
             rating INTEGER NOT NULL,
             reviewed_at INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_review_logs_date ON review_logs (reviewed_at);

         CREATE TABLE IF NOT EXISTS reading_sessions (
             book_id TEXT NOT NULL,
             chapter_file TEXT NOT NULL,
             seconds_spent INTEGER NOT NULL DEFAULT 0,
             words_read INTEGER NOT NULL DEFAULT 0,
             completed INTEGER NOT NULL DEFAULT 0,
             last_read_at INTEGER NOT NULL,
             PRIMARY KEY (book_id, chapter_file)
         );"
    ).context("Failed to initialize database tables")?;

    Ok(conn)
}
