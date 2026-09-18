//! DS-01: a cache filled before the vault kept the record is copied into the vault, once.

use rusqlite::params;

use super::backfill::backfill_vault_blocking;
use super::restore::restore_progress_blocking;
use super::schema::open_or_create_db;
use crate::test_support::Sandbox;
use crate::vault::study_log::{append_reading, read_book_log, ReadingLine};

const BOOK: &str = "sample";
const CHAPTER: &str = "ch-01.md";

/// Fills the cache the way the app did before DS-01: cards, review rows and reading time, no vault log.
fn cache_from_before(card_id: &str) {
    let conn = open_or_create_db().expect("open the cache");
    conn.execute(
        "INSERT INTO fsrs_cards
           (card_id, book_id, chapter_file, anchor, item_type, prompt, answer,
            state, stability, difficulty, due, last_review, reps)
         VALUES (?1, ?2, ?3, '^p-001', 'cloze', 'a question', 'an answer', 2, 14.5, 5.3, ?4, ?5, 3)",
        params![card_id, BOOK, CHAPTER, 1_760_000_000i64, 1_758_600_000i64],
    )
    .expect("a studied card");
    for (rating, at) in [(3i64, 1_758_000_000i64), (2, 1_758_300_000), (4, 1_758_600_000)] {
        conn.execute(
            "INSERT INTO review_logs (card_id, book_id, rating, reviewed_at) VALUES (?1, ?2, ?3, ?4)",
            params![card_id, BOOK, rating, at],
        )
        .expect("a review row");
    }
    conn.execute(
        "INSERT INTO reading_sessions (book_id, chapter_file, seconds_spent, words_read, completed, last_read_at)
         VALUES (?1, ?2, 3600, 1200, 1, ?3)",
        params![BOOK, CHAPTER, 1_758_700_000i64],
    )
    .expect("reading time");
}

#[test]
fn a_cache_from_before_is_copied_into_the_vault() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    cache_from_before("card-one");

    let report = backfill_vault_blocking().expect("copy the cache into the vault");

    assert_eq!(report.reviews_written, 3, "every review must reach the vault");
    assert_eq!(report.cards_written, 1, "and where the card stands");
    assert_eq!(report.chapters_written, 1, "and the reading time");

    let log = read_book_log(BOOK).expect("read the study log");
    assert_eq!(log.reviews.len(), 4, "3 reviews and 1 card standing");
    assert!(log.damaged.is_empty());

    let standing = log
        .reviews
        .iter()
        .find_map(|line| line.schedule.as_ref())
        .expect("the card standing");
    assert_eq!(standing.state, 2);
    assert_eq!(standing.stability, 14.5);
    assert_eq!(standing.due, 1_760_000_000);
    assert_eq!(standing.reps, 3);

    let ratings: Vec<Option<u8>> = log.reviews.iter().map(|line| line.rating).collect();
    assert_eq!(ratings.iter().filter(|r| r.is_some()).count(), 3);
    assert_eq!(log.reading.len(), 1);
    assert_eq!(log.reading[0].seconds_spent, 3600);
    assert!(log.reading[0].completed);
    let reading_file = std::fs::read_to_string(sandbox.vault().join("notes").join(BOOK).join("reading.jsonl"))
        .expect("read the reading log");
    assert!(
        !reading_file.contains("wordsRead"),
        "the word count in the old cache is the length of the chapter, not the words read (AN-01): {reading_file}"
    );
}

#[test]
fn copying_it_again_writes_nothing() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    cache_from_before("card-one");

    backfill_vault_blocking().expect("first run");
    let second = backfill_vault_blocking().expect("second run");

    assert!(
        second.changed_nothing(),
        "the second run must write nothing: {second:?}"
    );
    let log = read_book_log(BOOK).expect("read the study log");
    assert_eq!(log.reviews.len(), 4, "the lines must not be doubled");
    assert_eq!(log.reading.len(), 1);
}

#[test]
fn a_card_that_was_never_studied_is_not_copied() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    {
        let conn = open_or_create_db().expect("open the cache");
        conn.execute(
            "INSERT INTO fsrs_cards (card_id, book_id, chapter_file, item_type, prompt, answer)
             VALUES ('card-new', ?1, ?2, 'cloze', 'a question', 'an answer')",
            params![BOOK, CHAPTER],
        )
        .expect("a new card");
    }

    let report = backfill_vault_blocking().expect("copy the cache into the vault");

    assert!(
        report.changed_nothing(),
        "a card with no reviews holds no progress: {report:?}"
    );
}

#[test]
fn a_copied_cache_survives_being_thrown_away() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    cache_from_before("card-one");
    backfill_vault_blocking().expect("copy the cache into the vault");

    // The cache is deleted. Only the vault is left.
    let db = super::schema::get_db_path().expect("the cache path");
    for extra in ["", "-wal", "-shm"] {
        let path = std::path::PathBuf::from(format!("{}{}", db.display(), extra));
        if path.exists() {
            std::fs::remove_file(&path).expect("delete the cache file");
        }
    }
    {
        // The deck is built again from the vault, so the card row exists but has no progress.
        let conn = open_or_create_db().expect("make a new cache");
        conn.execute(
            "INSERT INTO fsrs_cards (card_id, book_id, chapter_file, item_type, prompt, answer)
             VALUES ('card-one', ?1, ?2, 'cloze', 'a question', 'an answer')",
            params![BOOK, CHAPTER],
        )
        .expect("the card row");
    }

    let report = restore_progress_blocking().expect("put the progress back");

    assert_eq!(report.reviews_added, 3, "every review comes back");
    assert_eq!(report.cards_rescheduled, 1, "and the card goes back where it was");
    let conn = open_or_create_db().expect("open the cache");
    let (state, stability, due, last_review, reps): (i64, f64, i64, i64, i64) = conn
        .query_row(
            "SELECT state, stability, due, last_review, reps FROM fsrs_cards WHERE card_id = 'card-one'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .expect("read the card");
    assert_eq!(state, 2);
    assert_eq!(stability, 14.5);
    assert_eq!(due, 1_760_000_000);
    assert_eq!(last_review, 1_758_600_000);
    assert_eq!(reps, 3);
    let seconds: i64 = conn
        .query_row("SELECT seconds_spent FROM reading_sessions", [], |row| row.get(0))
        .expect("read the reading time");
    assert_eq!(seconds, 3600, "and every second of reading");
}

#[test]
fn a_book_already_written_by_the_app_is_not_copied_again() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    super::deck_sync::sync_practice_deck_blocking(BOOK).expect("sync the deck");
    let card_id = sandbox.cloze_card_id(1);
    super::fsrs_store::submit_card_review_blocking(&card_id, 3).expect("review the card");

    let report = backfill_vault_blocking().expect("copy the cache into the vault");

    assert!(
        report.changed_nothing(),
        "a review the app already wrote to the vault must not be copied again: {report:?}"
    );
    let log = read_book_log(BOOK).expect("read the study log");
    assert_eq!(log.reviews.len(), 1, "one review, one line");
}

/// Puts the reading time of one chapter into the cache, the way the app keeps it.
fn cache_reading(chapter_file: &str, seconds: i64, completed: bool, read_at: i64) {
    let conn = open_or_create_db().expect("open the cache");
    conn.execute(
        "INSERT INTO reading_sessions (book_id, chapter_file, seconds_spent, completed, last_read_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![BOOK, chapter_file, seconds, i64::from(completed), read_at],
    )
    .expect("the reading time the app keeps");
}

fn log_reading(chapter_file: &str, seconds: i64, completed: bool, read_at: i64) {
    append_reading(&ReadingLine {
        book_id: BOOK.to_string(),
        chapter_file: chapter_file.to_string(),
        seconds_spent: seconds,
        completed,
        read_at,
    })
    .expect("write a line of the reading log");
}

/// A new import can give a chapter another file name, and it moves the reading time in the vault log with its chapter
/// (IN-04). Until the next start the cache still has the old name, so the copy must not write that time back under
/// the old name: the chapter that has the name now would get time that nobody read in it.
#[test]
fn reading_time_the_vault_keeps_is_not_copied_back_under_an_old_chapter_name() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    cache_reading("ch-01.md", 300, true, 1_758_000_100);
    log_reading("ch-02.md", 300, true, 1_758_000_100);

    let report = backfill_vault_blocking().expect("copy the cache into the vault");

    assert!(report.changed_nothing(), "{report:?}");
    let log = read_book_log(BOOK).expect("read the study log");
    let chapters: Vec<&str> = log.reading.iter().map(|line| line.chapter_file.as_str()).collect();
    assert_eq!(chapters, vec!["ch-02.md"]);
}

/// A log whose only reading line cannot be read may hold the time of the cache already, so nothing is copied: the
/// cache keeps its reading time, and no second may be counted twice when the line is mended.
#[test]
fn a_reading_log_with_a_damaged_line_gets_no_copy_of_the_cache() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    cache_reading("ch-01.md", 300, true, 1_758_000_100);
    let path = sandbox.vault().join("notes").join(BOOK).join("reading.jsonl");
    std::fs::write(
        &path,
        "{\"bookId\":\"sample\",\"chapterFile\":\"ch-01.md\",\"secondsSp\n",
    )
    .expect("a damaged reading line");

    let report = backfill_vault_blocking().expect("copy the cache into the vault");

    assert!(report.changed_nothing(), "{report:?}");
}

/// The start of the app after such an import: first the copy into the vault, then the cache from the vault.
#[test]
fn a_start_after_a_new_import_that_renamed_chapters_counts_every_second_once() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    cache_reading("ch-01.md", 300, true, 1_758_000_100);
    cache_reading("ch-02.md", 120, false, 1_758_000_200);
    log_reading("ch-02.md", 300, true, 1_758_000_100);
    log_reading("ch-03.md", 120, false, 1_758_000_200);
    let log_path = sandbox.vault().join("notes").join(BOOK).join("reading.jsonl");
    let log_before = std::fs::read_to_string(&log_path).expect("the log");

    for _ in 0..2 {
        backfill_vault_blocking().expect("copy the cache into the vault");
        restore_progress_blocking().expect("put the progress back");
    }

    let log_after = std::fs::read_to_string(&log_path).expect("the log");
    assert_eq!(log_after, log_before, "the vault log stays as the import wrote it");
    let conn = open_or_create_db().expect("open the cache");
    let mut statement = conn
        .prepare("SELECT chapter_file, seconds_spent FROM reading_sessions ORDER BY chapter_file")
        .expect("read the reading time");
    let rows: Vec<(String, i64)> = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .expect("read the rows")
        .collect::<rusqlite::Result<_>>()
        .expect("read every row");
    assert_eq!(rows, vec![("ch-02.md".to_string(), 300), ("ch-03.md".to_string(), 120)]);
}
