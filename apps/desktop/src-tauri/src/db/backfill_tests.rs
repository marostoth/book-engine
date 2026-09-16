//! DS-01: a cache filled before the vault kept the record is copied into the vault, once.

use rusqlite::params;

use super::backfill::backfill_vault_blocking;
use super::restore::restore_progress_blocking;
use super::schema::open_or_create_db;
use crate::test_support::Sandbox;
use crate::vault::study_log::read_book_log;

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
}

#[test]
fn copying_it_again_writes_nothing() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    cache_from_before("card-one");

    backfill_vault_blocking().expect("first run");
    let second = backfill_vault_blocking().expect("second run");

    assert!(second.changed_nothing(), "the second run must write nothing: {second:?}");
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

    assert!(report.changed_nothing(), "a card with no reviews holds no progress: {report:?}");
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
