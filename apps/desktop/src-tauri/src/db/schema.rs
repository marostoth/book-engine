use anyhow::{anyhow, Context, Result};
use rusqlite::Connection;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// The shape of the cache this build knows. `PRAGMA user_version` holds the shape of the file on disk.
///
/// 0 = a file made before there was a version, which this build reads and then stamps as 1.
/// 1 = the tables below.
///
/// A file stamped higher than this was made by a newer build. It is not opened, because a newer shape can
/// hold things this build would drop. The vault keeps your study progress either way (DS-01), so the
/// answer is to use the newer build, not to let this one rewrite the file.
pub const CACHE_SCHEMA_VERSION: i64 = 1;

/// Test builds only place the database inside the active `test_support::Sandbox`.
#[cfg(test)]
pub fn get_db_path() -> Result<PathBuf> {
    crate::test_support::db_path()
}

/// Returns the OS AppData path for the ephemeral database: %APPDATA%\book-engine\app_cache\index.db
#[cfg(not(test))]
pub fn get_db_path() -> Result<PathBuf> {
    let base = if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("book-engine").join("app_cache")
    } else if let Ok(userprofile) = std::env::var("USERPROFILE") {
        PathBuf::from(userprofile).join(".book-engine").join("app_cache")
    } else {
        std::env::temp_dir().join("book-engine").join("app_cache")
    };

    std::fs::create_dir_all(&base).with_context(|| format!("Failed to create cache directory: {}", base.display()))?;

    Ok(base.join("index.db"))
}

/// The cache files this process has already given their tables to (SI-04).
///
/// Every one of the sixteen callers of `open_or_create_db` used to run the whole setup again: thirteen statements
/// of `CREATE TABLE IF NOT EXISTS`, a `PRAGMA table_info` migration check, and a look at whether the dictionary
/// needed seeding. Measured on the reader's real index, 10,292 paragraphs: a bare open is 0.19 ms and an open with
/// the setup is 2.86 ms, so the setup cost 2.67 ms of every call, including every search.
///
/// It is keyed by path, not a plain "done once", because a test build gives every `Sandbox` its own cache file and
/// each one needs its own tables.
static PREPARED: Mutex<BTreeSet<PathBuf>> = Mutex::new(BTreeSet::new());

#[cfg(test)]
thread_local! {
    /// How many times the setup has run on this thread, so a test can say it did not run twice. The saving is
    /// time, and a test cannot hold a time still on a machine that is doing other work; it can hold this.
    ///
    /// Per thread, because cargo runs tests side by side and a shared counter would be counting other tests'
    /// work. One `Sandbox` is active per thread, so a thread is exactly one test.
    pub(crate) static SETUPS_RUN: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

/// True when this process has already made the tables in `db_path` and nothing has removed them since.
///
/// `PRAGMA user_version` is what says "nothing has removed them". The setup stamps it, so a file that has been
/// deleted and opened again reads 0 and is made from nothing once more. Two tests do exactly that, on purpose, to
/// prove the cache fills itself again from the vault (DS-01): `backfill_tests.rs` and `restore_tests.rs`.
fn tables_already_made(db_path: &Path, on_disk: i64) -> bool {
    on_disk == CACHE_SCHEMA_VERSION
        && PREPARED
            .lock()
            .unwrap_or_else(|held| held.into_inner())
            .contains(db_path)
}

/// Opens the cache. The tables are made on the first open of a file in this process, and not again (SI-04).
pub fn open_or_create_db() -> Result<Connection> {
    let db_path = get_db_path()?;
    let conn =
        Connection::open(&db_path).with_context(|| format!("Failed to open SQLite database: {}", db_path.display()))?;

    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    // These two live in the connection, not in the file, so every connection sets them. They are two pragmas, not
    // thirteen statements, and they do not touch the disk.
    conn.execute_batch("PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;")?;

    let on_disk: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if on_disk > CACHE_SCHEMA_VERSION {
        return Err(anyhow!(
            "{} was made by a newer version of this app (cache shape {}, this build knows {}). \
             Use the newer version. Your study progress is in the vault either way.",
            db_path.display(),
            on_disk,
            CACHE_SCHEMA_VERSION
        ));
    }

    // The check above runs on every open, so a file replaced by a newer build is still refused.
    if tables_already_made(&db_path, on_disk) {
        return Ok(conn);
    }

    make_the_tables(&conn, on_disk)?;
    PREPARED.lock().unwrap_or_else(|held| held.into_inner()).insert(db_path);
    Ok(conn)
}

/// Makes every table, index and column the cache holds, and stamps the file with the shape this build knows.
///
/// Each statement says `IF NOT EXISTS`, so running it on a file that already has them changes nothing. That is why
/// it was safe to run sixteen times per second, and why nobody noticed it was costing 2.67 ms each time.
fn make_the_tables(conn: &Connection, on_disk: i64) -> Result<()> {
    #[cfg(test)]
    SETUPS_RUN.with(|runs| runs.set(runs.get() + 1));

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
             reps INTEGER NOT NULL DEFAULT 0,
             card_type TEXT DEFAULT 'cloze',
             payload TEXT DEFAULT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_fsrs_due ON fsrs_cards (due, book_id);

         -- Cards whose question left the practice deck, and older duplicate rows, with their progress (deck_sync.rs).
         CREATE TABLE IF NOT EXISTS fsrs_cards_archive (
             archive_id INTEGER PRIMARY KEY AUTOINCREMENT,
             archived_at INTEGER NOT NULL,
             reason TEXT NOT NULL,
             card_id TEXT NOT NULL,
             book_id TEXT NOT NULL,
             chapter_file TEXT NOT NULL,
             anchor TEXT,
             item_type TEXT NOT NULL,
             prompt TEXT NOT NULL,
             answer TEXT NOT NULL,
             state INTEGER NOT NULL,
             stability REAL NOT NULL,
             difficulty REAL NOT NULL,
             due INTEGER NOT NULL,
             last_review INTEGER NOT NULL,
             reps INTEGER NOT NULL,
             card_type TEXT,
             payload TEXT
         );
         CREATE INDEX IF NOT EXISTS idx_fsrs_cards_archive_card ON fsrs_cards_archive (card_id);

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
             -- Not used since AN-01: the app cannot see how many words you read. An older row holds the word
             -- count of the whole chapter.
             words_read INTEGER NOT NULL DEFAULT 0,
             completed INTEGER NOT NULL DEFAULT 0,
             last_read_at INTEGER NOT NULL,
             PRIMARY KEY (book_id, chapter_file)
         );

         CREATE TABLE IF NOT EXISTS dictionary_entries (
             word TEXT PRIMARY KEY,
             part_of_speech TEXT,
             pronunciation TEXT,
             definition TEXT,
             etymology TEXT
         );",
    )
    .context("Failed to initialize database tables")?;

    // Safe idempotent migration for fsrs_cards columns (card_type, payload)
    let columns: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info(fsrs_cards);")?;
        let cols = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(Result::ok)
            .collect();
        cols
    };

    if !columns.iter().any(|c| c == "card_type") {
        conn.execute("ALTER TABLE fsrs_cards ADD COLUMN card_type TEXT DEFAULT 'cloze';", [])?;
    }
    if !columns.iter().any(|c| c == "payload") {
        conn.execute("ALTER TABLE fsrs_cards ADD COLUMN payload TEXT DEFAULT NULL;", [])?;
    }

    if on_disk < CACHE_SCHEMA_VERSION {
        conn.pragma_update(None, "user_version", CACHE_SCHEMA_VERSION)
            .context("Failed to stamp the cache with its shape")?;
    }

    // Seed dictionary table if empty
    if let Err(e) = super::seed_lexicon::seed_dictionary_if_empty(conn) {
        eprintln!("Warning: Failed to seed offline dictionary: {e}");
    }

    Ok(())
}

/// Looks up an English term in the offline SQLite dictionary cache.
/// Applies word sanitization and punctuation stripping before querying.
pub fn lookup_dictionary(conn: &Connection, word: &str) -> Result<Option<super::models::DictionaryEntry>> {
    let clean_word = word.trim().trim_matches(|c: char| !c.is_alphabetic()).to_lowercase();

    if clean_word.is_empty() {
        return Ok(None);
    }

    let mut stmt = conn.prepare(
        "SELECT word, part_of_speech, pronunciation, definition, etymology
         FROM dictionary_entries
         WHERE word = ?1
         LIMIT 1",
    )?;

    let mut rows = stmt.query([&clean_word])?;
    if let Some(row) = rows.next()? {
        Ok(Some(super::models::DictionaryEntry {
            word: row.get(0)?,
            part_of_speech: row.get(1)?,
            pronunciation: row.get(2)?,
            definition: row.get(3)?,
            etymology: row.get(4)?,
        }))
    } else {
        Ok(None)
    }
}
