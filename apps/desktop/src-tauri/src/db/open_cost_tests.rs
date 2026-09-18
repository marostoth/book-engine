//! The cache is set up once per file, not once per call (SI-04).
//!
//! Sixteen places call `open_or_create_db`, and every one of them used to run the whole setup again: thirteen
//! statements of `CREATE TABLE IF NOT EXISTS`, a `PRAGMA table_info` migration check, and a look at whether the
//! dictionary needed seeding. Each statement says `IF NOT EXISTS`, so it changed nothing and nobody noticed.
//!
//! Measured on the reader's real index, 10,292 paragraphs in 66 chapters, on a copy taken with the SQLite backup
//! API: a bare open is 0.19 ms, an open with the setup is 2.86 ms. The setup cost **2.67 ms of every call**,
//! including every search. A search for `market*` was 15.9 ms and is 12.3 ms on a connection that is already set
//! up, which is the difference between missing the documented 15 ms and meeting it.
//!
//! What these tests hold is the behaviour, not the timing: a second open must not build the tables again, a second
//! cache file must get its own, and a cache file that was deleted must be built from nothing once more, because
//! two tests of DS-01 delete it on purpose to prove the cache fills itself again from the vault.

use crate::db::schema::{open_or_create_db, CACHE_SCHEMA_VERSION};
use crate::test_support::Sandbox;
use rusqlite::Connection;

/// How many of the cache's tables and indexes exist in the file `conn` has open.
fn tables_in(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'",
        [],
        |row| row.get(0),
    )
    .expect("count what the file holds")
}

/// The shape this build stamped on the file.
fn stamp_of(conn: &Connection) -> i64 {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .expect("read the stamp")
}

#[test]
fn the_first_open_makes_the_tables_and_stamps_the_file() {
    let _sandbox = Sandbox::new();
    let conn = open_or_create_db().expect("open the cache");

    assert!(tables_in(&conn) > 8, "the first open did not make the cache tables");
    assert_eq!(
        stamp_of(&conn),
        CACHE_SCHEMA_VERSION,
        "the first open did not stamp the file with the shape this build knows"
    );
}

#[test]
fn a_second_open_of_the_same_file_still_has_every_table() {
    // The setup is skipped the second time. What must not change is what the caller gets: a connection to a file
    // with every table in it. A skip that skipped too much would show here.
    let _sandbox = Sandbox::new();
    let first = open_or_create_db().expect("open the cache");
    let expected = tables_in(&first);
    drop(first);

    let second = open_or_create_db().expect("open the cache again");
    assert_eq!(
        tables_in(&second),
        expected,
        "the second open of the same file does not see the tables the first one made"
    );

    // And a table really works, not merely exists.
    second
        .execute(
            "INSERT INTO indexed_chapters (book_id, chapter_id, file_path, title, content_hash)
             VALUES ('smith', 'ch-01', 'ch-01.md', 'Chapter 1', 'abc')",
            [],
        )
        .expect("write a row through the second connection");
}

#[test]
fn a_second_cache_file_gets_its_own_tables() {
    // The setup is remembered per file, not once per process. A `Sandbox` gives every test its own cache, so a
    // "done once" flag would leave the second one empty and every test after the first would fail oddly.
    let first_tables = {
        let _sandbox = Sandbox::new();
        let conn = open_or_create_db().expect("open the first cache");
        tables_in(&conn)
    };

    let _sandbox = Sandbox::new();
    let conn = open_or_create_db().expect("open the second cache");
    assert_eq!(
        tables_in(&conn),
        first_tables,
        "the second cache file of this process was left without its tables"
    );
}

#[test]
fn a_cache_file_that_was_deleted_is_made_again() {
    // DS-01: the cache is thrown away and fills itself from the vault. `backfill_tests.rs` and `restore_tests.rs`
    // delete it on purpose. Remembering the path alone would make this open hand back an empty file.
    let _sandbox = Sandbox::new();
    let conn = open_or_create_db().expect("open the cache");
    let expected = tables_in(&conn);
    drop(conn);

    let db = crate::db::schema::get_db_path().expect("the cache path");
    for name in ["index.db", "index.db-wal", "index.db-shm"] {
        let path = db.with_file_name(name);
        if path.exists() {
            std::fs::remove_file(&path).expect("delete the cache file");
        }
    }
    assert!(!db.exists(), "the cache file is still there");

    let again = open_or_create_db().expect("open the cache after it was deleted");
    assert_eq!(
        tables_in(&again),
        expected,
        "a cache file that was deleted came back without its tables"
    );
    assert_eq!(stamp_of(&again), CACHE_SCHEMA_VERSION, "the new file was not stamped");
}

#[test]
fn every_connection_gets_the_settings_that_live_in_the_connection() {
    // `synchronous` and `temp_store` are not saved in the file, so skipping the setup must not skip them.
    let _sandbox = Sandbox::new();
    drop(open_or_create_db().expect("open the cache"));

    let conn = open_or_create_db().expect("open the cache again");
    let synchronous: i64 = conn
        .query_row("PRAGMA synchronous", [], |row| row.get(0))
        .expect("read synchronous");
    let temp_store: i64 = conn
        .query_row("PRAGMA temp_store", [], |row| row.get(0))
        .expect("read temp_store");

    assert_eq!(
        synchronous, 1,
        "synchronous is not NORMAL on a connection that skipped the setup"
    );
    assert_eq!(
        temp_store, 2,
        "temp_store is not MEMORY on a connection that skipped the setup"
    );
}

#[test]
fn the_write_ahead_log_survives_the_skip() {
    // `journal_mode = WAL` is saved in the file, so it is set once with the tables. A second connection must still
    // find the file in WAL, or every write would take the slower path and readers would be blocked.
    let _sandbox = Sandbox::new();
    drop(open_or_create_db().expect("open the cache"));

    let conn = open_or_create_db().expect("open the cache again");
    let mode: String = conn
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .expect("read the journal mode");
    assert_eq!(
        mode.to_lowercase(),
        "wal",
        "the cache is not in WAL for a later connection"
    );
}

#[test]
fn the_setup_runs_once_for_a_file_however_many_times_it_is_opened() {
    // This is the saving itself, and the only test here that fails when the fix is simply undone. The others watch
    // what a caller gets, and a caller gets the same thing either way: the old code was correct, only wasteful.
    //
    // Sixteen places open the cache. Before this, every one of them paid the setup again. The app opens it several
    // times for one screen of the reader, and once for every search.
    let setups = || crate::db::schema::SETUPS_RUN.with(|runs| runs.get());

    let _sandbox = Sandbox::new();
    let before = setups();

    drop(open_or_create_db().expect("open the cache"));
    assert_eq!(
        setups(),
        before + 1,
        "the first open of a new cache file did not set it up"
    );

    // Sixteen opens, which is what one screen of the reader costs.
    for _ in 0..15 {
        drop(open_or_create_db().expect("open the cache again"));
    }
    assert_eq!(
        setups(),
        before + 1,
        "the setup ran again on a file that already had its tables, which is the whole cost this finding is about"
    );
}
