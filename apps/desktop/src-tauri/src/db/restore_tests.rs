//! DS-01: the vault is the permanent record of your study, and the cache fills itself from it.

use rusqlite::params;

use super::restore::restore_progress_blocking;
use super::schema::open_or_create_db;
use crate::test_support::Sandbox;
use crate::vault::study_log::{append_reading, append_review, read_book_log, CardStanding, ReadingLine, ReviewLine};

const BOOK: &str = "sample";
const CARD: &str = "card-one";
const CHAPTER: &str = "ch-01.md";

fn review(card_id: &str, reviewed_at: i64, rating: u8, due: i64, reps: i64) -> ReviewLine {
    ReviewLine {
        card_id: card_id.to_string(),
        book_id: BOOK.to_string(),
        rating: Some(rating),
        reviewed_at,
        schedule: Some(CardStanding {
            state: 2,
            stability: 11.0 + reps as f64,
            difficulty: 5.0,
            due,
            reps,
        }),
    }
}

fn reading(seconds: i64, words: i64, completed: bool, read_at: i64) -> ReadingLine {
    ReadingLine {
        book_id: BOOK.to_string(),
        chapter_file: CHAPTER.to_string(),
        seconds_spent: seconds,
        words_read: words,
        completed,
        read_at,
    }
}

/// Puts one card in the cache, the way `sync_practice_deck` would.
fn add_card(card_id: &str) {
    let conn = open_or_create_db().expect("open the cache");
    conn.execute(
        "INSERT INTO fsrs_cards (card_id, book_id, chapter_file, anchor, item_type, prompt, answer)
         VALUES (?1, ?2, ?3, '^p-001', 'cloze', 'a question', 'an answer')",
        params![card_id, BOOK, CHAPTER],
    )
    .expect("add the card");
}

fn card_row(card_id: &str) -> (i64, f64, i64, i64, i64) {
    let conn = open_or_create_db().expect("open the cache");
    conn.query_row(
        "SELECT state, stability, due, last_review, reps FROM fsrs_cards WHERE card_id = ?1",
        params![card_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    )
    .expect("read the card")
}

fn count(sql: &str) -> i64 {
    let conn = open_or_create_db().expect("open the cache");
    conn.query_row(sql, [], |row| row.get(0)).expect("count")
}

#[test]
fn a_review_written_to_the_vault_comes_back_into_an_empty_cache() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    add_card(CARD);
    append_review(&review(CARD, 1_758_000_000, 3, 1_759_000_000, 1)).expect("write the review");

    let report = restore_progress_blocking().expect("put the progress back");

    assert_eq!(report.reviews_added, 1, "the review must come back");
    assert_eq!(report.cards_rescheduled, 1, "and the card must take its schedule");
    assert_eq!(count("SELECT COUNT(*) FROM review_logs"), 1);
    let (state, stability, due, last_review, reps) = card_row(CARD);
    assert_eq!(state, 2);
    assert_eq!(stability, 12.0);
    assert_eq!(due, 1_759_000_000);
    assert_eq!(last_review, 1_758_000_000);
    assert_eq!(reps, 1);
}

#[test]
fn running_it_again_changes_nothing() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    add_card(CARD);
    append_review(&review(CARD, 1_758_000_000, 3, 1_759_000_000, 1)).expect("write the review");
    append_reading(&reading(900, 1200, false, 1_758_000_000)).expect("write the reading time");

    restore_progress_blocking().expect("first run");
    let second = restore_progress_blocking().expect("second run");

    assert!(second.changed_nothing(), "a second run must add nothing: {second:?}");
    assert_eq!(count("SELECT COUNT(*) FROM review_logs"), 1, "the review must not be doubled");
    assert_eq!(
        count("SELECT seconds_spent FROM reading_sessions"),
        900,
        "the reading time must not be counted twice"
    );
}

#[test]
fn the_newest_review_of_a_card_gives_it_its_schedule() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    add_card(CARD);
    append_review(&review(CARD, 1_758_000_000, 3, 1_758_500_000, 1)).expect("first review");
    append_review(&review(CARD, 1_758_600_000, 4, 1_760_000_000, 2)).expect("second review");
    append_review(&review(CARD, 1_758_300_000, 1, 1_758_400_000, 9)).expect("an out-of-order line");

    let report = restore_progress_blocking().expect("put the progress back");

    assert_eq!(report.reviews_added, 3, "every review must come back");
    assert_eq!(report.cards_rescheduled, 1, "but the card is written once");
    let (_, _, due, last_review, reps) = card_row(CARD);
    assert_eq!(due, 1_760_000_000, "the newest review decides the due date");
    assert_eq!(last_review, 1_758_600_000);
    assert_eq!(reps, 2);
}

#[test]
fn a_review_done_in_the_app_is_never_undone_by_an_older_line() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    add_card(CARD);
    {
        let conn = open_or_create_db().expect("open the cache");
        conn.execute(
            "UPDATE fsrs_cards SET state = 2, stability = 99.0, due = ?1, last_review = ?2, reps = 7
             WHERE card_id = ?3",
            params![2_000_000_000i64, 1_900_000_000i64, CARD],
        )
        .expect("a newer review, done in the app");
    }
    append_review(&review(CARD, 1_758_000_000, 1, 1_758_100_000, 1)).expect("an older line");

    let report = restore_progress_blocking().expect("put the progress back");

    assert_eq!(report.reviews_added, 1, "the old review is still part of the history");
    assert_eq!(report.cards_rescheduled, 0, "but it must not move the card");
    let (_, stability, due, last_review, reps) = card_row(CARD);
    assert_eq!(stability, 99.0);
    assert_eq!(due, 2_000_000_000);
    assert_eq!(last_review, 1_900_000_000);
    assert_eq!(reps, 7);
}

#[test]
fn a_review_the_cache_already_has_is_not_added_again() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    add_card(CARD);
    {
        let conn = open_or_create_db().expect("open the cache");
        conn.execute(
            "INSERT INTO review_logs (card_id, book_id, rating, reviewed_at) VALUES (?1, ?2, 3, ?3)",
            params![CARD, BOOK, 1_758_000_000i64],
        )
        .expect("the same review, already in the cache");
    }
    append_review(&review(CARD, 1_758_000_000, 3, 1_759_000_000, 1)).expect("write the review");

    let report = restore_progress_blocking().expect("put the progress back");

    assert_eq!(report.reviews_added, 0, "the same second of the same card is the same review");
    assert_eq!(count("SELECT COUNT(*) FROM review_logs"), 1);
}

#[test]
fn reading_time_comes_back_as_the_sum_of_its_lines() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    append_reading(&reading(15, 400, false, 1_758_000_000)).expect("first");
    append_reading(&reading(15, 900, false, 1_758_000_100)).expect("second");
    append_reading(&reading(30, 1200, true, 1_758_000_200)).expect("third");

    let report = restore_progress_blocking().expect("put the progress back");

    assert_eq!(report.chapters_restored, 1);
    let conn = open_or_create_db().expect("open the cache");
    let (seconds, words, completed, last): (i64, i64, i64, i64) = conn
        .query_row(
            "SELECT seconds_spent, words_read, completed, last_read_at FROM reading_sessions",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .expect("read the row");
    assert_eq!(seconds, 60, "the seconds add up");
    assert_eq!(words, 1200, "the words read are the furthest point");
    assert_eq!(completed, 1, "finished once is finished");
    assert_eq!(last, 1_758_000_200);
}

#[test]
fn reading_time_the_cache_already_counts_is_left_alone() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    {
        let conn = open_or_create_db().expect("open the cache");
        conn.execute(
            "INSERT INTO reading_sessions (book_id, chapter_file, seconds_spent, words_read, completed, last_read_at)
             VALUES (?1, ?2, 60, 1200, 1, ?3)",
            params![BOOK, CHAPTER, 1_758_000_200i64],
        )
        .expect("the row the app already keeps");
    }
    append_reading(&reading(15, 400, false, 1_758_000_000)).expect("a line for the same chapter");

    let report = restore_progress_blocking().expect("put the progress back");

    assert_eq!(report.chapters_restored, 0);
    assert_eq!(
        count("SELECT seconds_spent FROM reading_sessions"),
        60,
        "seconds must never be added to a count the cache already has"
    );
}

#[test]
fn a_damaged_line_is_reported_and_every_other_line_still_counts() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    add_card(CARD);
    append_review(&review(CARD, 1_758_000_000, 3, 1_759_000_000, 1)).expect("a good line");
    // A crash during an append can leave the last line half written.
    let path = sandbox.vault().join("notes").join(BOOK).join("reviews.jsonl");
    let mut text = std::fs::read_to_string(&path).expect("read the log");
    text.push_str("{\"cardId\":\"card-two\",\"bookId\":\"sam");
    std::fs::write(&path, text).expect("write the log back");

    let report = restore_progress_blocking().expect("put the progress back");

    assert_eq!(report.reviews_added, 1, "the good line must still come back");
    assert_eq!(report.damaged_lines.len(), 1, "the half line must be reported");
    assert!(
        report.damaged_lines[0].contains("reviews.jsonl"),
        "the report must name the file: {:?}",
        report.damaged_lines
    );
}

#[test]
fn a_card_that_left_the_deck_keeps_its_review_history() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    // No add_card: the question left the practice deck, so deck_sync archived its row.
    append_review(&review("card-gone", 1_758_000_000, 3, 1_759_000_000, 1)).expect("write the review");

    let report = restore_progress_blocking().expect("put the progress back");

    assert_eq!(report.reviews_added, 1, "the review is part of the history either way");
    assert_eq!(report.cards_rescheduled, 0, "there is no card row to write");
    assert_eq!(count("SELECT COUNT(*) FROM review_logs"), 1);
}

#[test]
fn an_empty_vault_puts_nothing_back_and_reports_nothing() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();

    let report = restore_progress_blocking().expect("put the progress back");

    assert!(report.changed_nothing(), "{report:?}");
    assert!(report.damaged_lines.is_empty());
}

#[test]
fn a_review_written_to_the_vault_can_be_read_back_exactly() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    let written = review(CARD, 1_758_000_000, 4, 1_759_000_000, 3);

    append_review(&written).expect("write the review");
    let log = read_book_log(BOOK).expect("read the log");

    assert_eq!(log.reviews, vec![written], "every field must survive the round trip");
    assert!(log.damaged.is_empty());
}

#[test]
fn the_cache_is_stamped_with_the_shape_this_build_knows() {
    let _sandbox = Sandbox::new();
    let conn = open_or_create_db().expect("open the cache");

    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .expect("read the version");

    assert_eq!(version, super::schema::CACHE_SCHEMA_VERSION);
}

#[test]
fn a_cache_from_a_newer_build_is_not_opened() {
    let _sandbox = Sandbox::new();
    {
        let conn = open_or_create_db().expect("make the cache");
        conn.pragma_update(None, "user_version", super::schema::CACHE_SCHEMA_VERSION + 1)
            .expect("stamp it as newer");
    }

    let error = open_or_create_db().expect_err("a newer cache must not be opened");

    let message = format!("{error:#}");
    assert!(message.contains("newer version"), "the message must say why: {message}");
    assert!(message.contains("vault"), "and where the progress is: {message}");
}

// ---------------------------------------------------------------------------------------------
// The whole way through: a review made in the app, the cache thrown away, the progress back.
// ---------------------------------------------------------------------------------------------

/// Deletes the cache database, the way a disk clean-up or a broken sync would.
fn throw_away_the_cache() {
    let db = super::schema::get_db_path().expect("the cache path");
    for extra in ["", "-wal", "-shm"] {
        let path = std::path::PathBuf::from(format!("{}{}", db.display(), extra));
        if path.exists() {
            std::fs::remove_file(&path).expect("delete the cache file");
        }
    }
}

#[test]
fn a_review_made_in_the_app_is_written_to_the_vault() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    super::deck_sync::sync_practice_deck_blocking(BOOK).expect("sync the deck");
    let card_id = sandbox.cloze_card_id(1);

    let schedule = super::fsrs_store::submit_card_review_blocking(&card_id, 3).expect("review the card");

    let log = read_book_log(BOOK).expect("read the study log");
    assert_eq!(log.reviews.len(), 1, "the review must be in the vault, not only in the cache");
    let line = &log.reviews[0];
    assert_eq!(line.card_id, card_id);
    assert_eq!(line.book_id, BOOK);
    assert_eq!(line.rating, Some(3));
    let standing = line.schedule.as_ref().expect("a review the app made carries its schedule");
    assert_eq!(standing.due, schedule.due, "the vault holds the schedule the app gave the reader");
    assert_eq!(standing.stability, schedule.stability);
    assert_eq!(standing.reps, schedule.reps);
}

#[test]
fn reading_time_recorded_in_the_app_is_written_to_the_vault() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();

    super::reading_velocity::record_reading_session_blocking(BOOK, CHAPTER, 15, 1200, false)
        .expect("record the reading time");

    let log = read_book_log(BOOK).expect("read the study log");
    assert_eq!(log.reading.len(), 1, "the reading time must be in the vault");
    assert_eq!(log.reading[0].seconds_spent, 15);
    assert_eq!(log.reading[0].words_read, 1200);
}

#[test]
fn throwing_away_the_cache_loses_no_study_progress() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    super::deck_sync::sync_practice_deck_blocking(BOOK).expect("sync the deck");
    let card_id = sandbox.cloze_card_id(1);

    let schedule = super::fsrs_store::submit_card_review_blocking(&card_id, 4).expect("review the card");
    super::reading_velocity::record_reading_session_blocking(BOOK, CHAPTER, 15, 900, false).expect("read a while");
    super::reading_velocity::record_reading_session_blocking(BOOK, CHAPTER, 45, 1200, true).expect("finish it");

    throw_away_the_cache();
    assert_eq!(count("SELECT COUNT(*) FROM review_logs"), 0, "the cache really is gone");
    super::deck_sync::sync_practice_deck_blocking(BOOK).expect("the deck is built again from the vault");

    let report = restore_progress_blocking().expect("put the progress back");

    assert_eq!(report.reviews_added, 1);
    assert_eq!(report.cards_rescheduled, 1);
    assert_eq!(report.chapters_restored, 1);
    let (state, stability, due, last_review, reps) = card_row(&card_id);
    assert_eq!(state as u8, schedule.state, "the card is where the reader left it");
    assert_eq!(stability, schedule.stability);
    assert_eq!(due, schedule.due);
    assert_eq!(last_review, schedule.last_review);
    assert_eq!(reps, schedule.reps);
    assert_eq!(count("SELECT seconds_spent FROM reading_sessions"), 60, "every second of reading is back");
    assert_eq!(count("SELECT completed FROM reading_sessions"), 1);
}
