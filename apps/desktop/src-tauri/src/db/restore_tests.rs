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

fn reading(seconds: i64, completed: bool, read_at: i64) -> ReadingLine {
    ReadingLine {
        book_id: BOOK.to_string(),
        chapter_file: CHAPTER.to_string(),
        seconds_spent: seconds,
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
    append_reading(&reading(900, false, 1_758_000_000)).expect("write the reading time");

    restore_progress_blocking().expect("first run");
    let second = restore_progress_blocking().expect("second run");

    assert!(second.changed_nothing(), "a second run must add nothing: {second:?}");
    assert_eq!(
        count("SELECT COUNT(*) FROM review_logs"),
        1,
        "the review must not be doubled"
    );
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

    assert_eq!(
        report.reviews_added, 0,
        "the same second of the same card is the same review"
    );
    assert_eq!(count("SELECT COUNT(*) FROM review_logs"), 1);
}

#[test]
fn reading_time_comes_back_as_the_sum_of_its_lines() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    append_reading(&reading(15, false, 1_758_000_000)).expect("first");
    append_reading(&reading(15, false, 1_758_000_100)).expect("second");
    append_reading(&reading(30, true, 1_758_000_200)).expect("third");

    let report = restore_progress_blocking().expect("put the progress back");

    assert_eq!(report.chapters_restored, 1);
    let conn = open_or_create_db().expect("open the cache");
    let (seconds, completed, last): (i64, i64, i64) = conn
        .query_row(
            "SELECT seconds_spent, completed, last_read_at FROM reading_sessions",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("read the row");
    assert_eq!(seconds, 60, "the seconds add up");
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
            "INSERT INTO reading_sessions (book_id, chapter_file, seconds_spent, completed, last_read_at)
             VALUES (?1, ?2, 60, 1, ?3)",
            params![BOOK, CHAPTER, 1_758_000_200i64],
        )
        .expect("the row the app already keeps");
    }
    append_reading(&reading(15, false, 1_758_000_000)).expect("a line for the same chapter");

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
    assert_eq!(
        log.reviews.len(),
        1,
        "the review must be in the vault, not only in the cache"
    );
    let line = &log.reviews[0];
    assert_eq!(line.card_id, card_id);
    assert_eq!(line.book_id, BOOK);
    assert_eq!(line.rating, Some(3));
    let standing = line
        .schedule
        .as_ref()
        .expect("a review the app made carries its schedule");
    assert_eq!(
        standing.due, schedule.due,
        "the vault holds the schedule the app gave the reader"
    );
    assert_eq!(standing.stability, schedule.stability);
    assert_eq!(standing.reps, schedule.reps);
}

#[test]
fn reading_time_recorded_in_the_app_is_written_to_the_vault() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();

    super::reading_velocity::record_reading_session_blocking(BOOK, CHAPTER, 15, false)
        .expect("record the reading time");

    let log = read_book_log(BOOK).expect("read the study log");
    assert_eq!(log.reading.len(), 1, "the reading time must be in the vault");
    assert_eq!(log.reading[0].seconds_spent, 15);
}

#[test]
fn throwing_away_the_cache_loses_no_study_progress() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    super::deck_sync::sync_practice_deck_blocking(BOOK).expect("sync the deck");
    let card_id = sandbox.cloze_card_id(1);

    let schedule = super::fsrs_store::submit_card_review_blocking(&card_id, 4).expect("review the card");
    super::reading_velocity::record_reading_session_blocking(BOOK, CHAPTER, 15, false).expect("read a while");
    super::reading_velocity::record_reading_session_blocking(BOOK, CHAPTER, 45, true).expect("finish it");

    throw_away_the_cache();
    assert_eq!(count("SELECT COUNT(*) FROM review_logs"), 0, "the cache really is gone");

    // The order the app really starts in: the setup closure first, the deck when the window mounts. This
    // test synced the deck first until DS-15, which is the one order that hid the fault.
    let report = restore_progress_blocking().expect("put the progress back");
    super::deck_sync::sync_practice_deck_blocking(BOOK).expect("the deck is built again from the vault");

    assert_eq!(report.reviews_added, 1);
    assert_eq!(report.cards_rescheduled, 0, "that early there is no card row to write");
    assert_eq!(
        report.cards_waiting_for_deck, 1,
        "and the reader is told the schedule is safe"
    );
    assert_eq!(report.chapters_restored, 1);
    let (state, stability, due, last_review, reps) = card_row(&card_id);
    assert_eq!(state as u8, schedule.state, "the card is where the reader left it");
    assert_eq!(stability, schedule.stability);
    assert_eq!(due, schedule.due);
    assert_eq!(last_review, schedule.last_review);
    assert_eq!(reps, schedule.reps);
    assert_eq!(
        count("SELECT seconds_spent FROM reading_sessions"),
        60,
        "every second of reading is back"
    );
    assert_eq!(count("SELECT completed FROM reading_sessions"), 1);
}

/// A book that left the vault gets nothing back at the start, or every start would put back what the index run takes
/// out again. Its study log stays in the vault, so it comes back with the book (LC-02).
#[test]
fn a_book_that_left_the_vault_gets_nothing_back_at_the_start() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    append_review(&review(CARD, 1_758_000_000, 3, 1_759_000_000, 1)).expect("write the review");
    append_reading(&reading(900, false, 1_758_000_000)).expect("write the reading time");
    std::fs::remove_dir_all(sandbox.vault().join("books").join(BOOK)).expect("delete the book");

    let report = restore_progress_blocking().expect("start the app");
    assert!(report.changed_nothing(), "{report:?}");
    assert_eq!(count("SELECT COUNT(*) FROM review_logs"), 0);
    assert_eq!(count("SELECT COUNT(*) FROM reading_sessions"), 0);

    sandbox.write_sample_book();
    let report = restore_progress_blocking().expect("start the app again, with the book back");
    assert_eq!((report.reviews_added, report.chapters_restored), (1, 1));
}

// ---------------------------------------------------------------------------------------------
// IN-04: a new import can give a chapter another file name, and it moves the reading time in the log.
// ---------------------------------------------------------------------------------------------

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

fn reading_in(chapter_file: &str, seconds: i64, completed: bool, read_at: i64) -> ReadingLine {
    ReadingLine {
        chapter_file: chapter_file.to_string(),
        ..reading(seconds, completed, read_at)
    }
}

/// Every reading row of the cache: chapter file, seconds, completed, last read.
fn reading_rows() -> Vec<(String, i64, i64, i64)> {
    let conn = open_or_create_db().expect("open the cache");
    let mut statement = conn
        .prepare(
            "SELECT chapter_file, seconds_spent, completed, last_read_at FROM reading_sessions ORDER BY chapter_file",
        )
        .expect("read the reading time");
    let rows = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
        .expect("read the rows");
    rows.collect::<rusqlite::Result<_>>().expect("read every row")
}

/// A new import that puts a dedication first gives every chapter the next file name, and it moves the reading time in
/// the vault log with its chapter. The cache follows the log, so no chapter keeps the time of another chapter.
#[test]
fn reading_time_follows_the_chapters_that_a_new_import_renamed() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    cache_reading("ch-01.md", 300, true, 1_758_000_100);
    cache_reading("ch-02.md", 120, false, 1_758_000_200);
    append_reading(&reading_in("ch-02.md", 300, true, 1_758_000_100)).expect("the line of ch-01.md, moved");
    append_reading(&reading_in("ch-03.md", 120, false, 1_758_000_200)).expect("the line of ch-02.md, moved");

    let report = restore_progress_blocking().expect("start the app");

    assert_eq!(
        reading_rows(),
        vec![
            ("ch-02.md".to_string(), 300, 1, 1_758_000_100),
            ("ch-03.md".to_string(), 120, 0, 1_758_000_200),
        ],
        "each chapter has its own time, and ch-01.md has none"
    );
    assert_eq!(
        report.chapters_restored, 3,
        "ch-01.md removed, ch-02.md changed, ch-03.md added: {report:?}"
    );
    let again = restore_progress_blocking().expect("start the app again");
    assert!(again.changed_nothing(), "the cache follows the log once: {again:?}");
}

/// A damaged line of the review log says nothing about reading time, so the reading time still follows its log.
#[test]
fn a_damaged_review_line_does_not_stop_reading_time_from_following_its_log() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    cache_reading("ch-01.md", 300, true, 1_758_000_100);
    append_reading(&reading_in("ch-02.md", 300, true, 1_758_000_100)).expect("the line of ch-01.md, moved");
    let path = sandbox.vault().join("notes").join(BOOK).join("reviews.jsonl");
    std::fs::write(&path, "{\"cardId\":\"card-two\",\"bookId\":\"sam").expect("a damaged review line");

    let report = restore_progress_blocking().expect("start the app");

    assert_eq!(report.damaged_lines.len(), 1, "{report:?}");
    assert_eq!(reading_rows(), vec![("ch-02.md".to_string(), 300, 1, 1_758_000_100)]);
}

/// A line that names another book is no reading time of this book, and it never changes the time of that book.
#[test]
fn a_log_line_of_another_book_changes_no_reading_time_of_that_book() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    {
        let conn = open_or_create_db().expect("open the cache");
        conn.execute(
            "INSERT INTO reading_sessions (book_id, chapter_file, seconds_spent, completed, last_read_at)
             VALUES ('other-book', 'ch-01.md', 500, 0, 1758000000)",
            [],
        )
        .expect("the reading time of another book");
    }
    // The app writes a line into the log of its own book, so only a copied or edited file can hold such a line
    let line = concat!(
        r#"{"bookId":"other-book","chapterFile":"ch-01.md","#,
        r#""secondsSpent":60,"completed":false,"readAt":1758000100}"#,
        "\n"
    );
    std::fs::write(sandbox.vault().join("notes").join(BOOK).join("reading.jsonl"), line)
        .expect("a line of another book in the log of this book");

    restore_progress_blocking().expect("start the app");

    assert_eq!(
        count("SELECT seconds_spent FROM reading_sessions WHERE book_id = 'other-book'"),
        500,
        "the other book keeps its reading time"
    );
}

/// A line of the log that cannot be read can hold reading time that the cache counts. Then the log is not the whole
/// record, so the cache keeps every second it has.
#[test]
fn a_damaged_reading_line_takes_no_reading_time_away_from_the_cache() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    cache_reading("ch-01.md", 300, true, 1_758_000_100);
    // The good line holds as many seconds as the cache, so only the damaged line keeps the rows of the cache
    append_reading(&reading_in("ch-02.md", 300, true, 1_758_000_100)).expect("a good line");
    let path = sandbox.vault().join("notes").join(BOOK).join("reading.jsonl");
    let mut text = std::fs::read_to_string(&path).expect("read the log");
    text.push_str("{\"bookId\":\"sample\",\"chapterFile\":\"ch-01.md\",\"secondsSp");
    std::fs::write(&path, text).expect("write the log back");

    let report = restore_progress_blocking().expect("start the app");

    assert_eq!(report.damaged_lines.len(), 1, "{report:?}");
    let rows = reading_rows();
    assert!(
        rows.contains(&("ch-01.md".to_string(), 300, 1, 1_758_000_100)),
        "the cache keeps its reading time: {rows:?}"
    );
    assert!(
        rows.iter().any(|row| row.0 == "ch-02.md" && row.1 == 300),
        "and gets the good line: {rows:?}"
    );
}

// --- DS-15: the deck is built AFTER the restore, which is the order the app starts in ---

/// The order the app really starts in, and the order no test used before DS-15.
///
/// `restore_progress_blocking` runs in the setup closure (`lib.rs`), before any window exists. The deck
/// sync is an IPC command the window asks for after it mounts. So on a cache that was deleted, damaged or
/// carried from another PC, the restore meets an empty `fsrs_cards` and has no row to write.
fn start_the_app_the_way_it_starts() -> super::restore::RestoreReport {
    let report = restore_progress_blocking().expect("the setup closure puts the progress back");
    super::deck_sync::sync_practice_deck_blocking(BOOK).expect("the window syncs the deck after it mounts");
    report
}

#[test]
fn a_card_keeps_its_schedule_when_the_deck_is_built_after_the_restore() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    super::deck_sync::sync_practice_deck_blocking(BOOK).expect("sync the deck");
    let card_id = sandbox.cloze_card_id(1);
    let schedule = super::fsrs_store::submit_card_review_blocking(&card_id, 4).expect("review the card");
    assert!(schedule.reps > 0, "the reader really practised the card");

    throw_away_the_cache();
    start_the_app_the_way_it_starts();

    let (state, stability, due, last_review, reps) = card_row(&card_id);
    assert_eq!(reps, schedule.reps, "a practised card must not come back as new");
    assert_eq!(state as u8, schedule.state, "the card is where the reader left it");
    assert_eq!(stability, schedule.stability);
    assert_eq!(due, schedule.due);
    assert_eq!(last_review, schedule.last_review);
}

#[test]
fn a_restored_card_is_not_offered_as_a_new_card() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    sandbox.write_sample_deck(2, 0);
    super::deck_sync::sync_practice_deck_blocking(BOOK).expect("sync the deck");
    let practised = sandbox.cloze_card_id(1);
    let untouched = sandbox.cloze_card_id(2);
    super::fsrs_store::submit_card_review_blocking(&practised, 4).expect("review one card");

    throw_away_the_cache();
    start_the_app_the_way_it_starts();

    let due = crate::db::get_due_cards_blocking(Some(BOOK), Some("cloze"), Some(10), None).expect("ask for cards");
    let offered: Vec<&str> = due.iter().map(|card| card.card_id.as_str()).collect();
    // The sight check: the card the reader never saw must still be offered, or this test asks nothing.
    assert!(
        offered.contains(&untouched.as_str()),
        "the card that was never practised is still new: {offered:?}"
    );
    assert!(
        !offered.contains(&practised.as_str()),
        "a card rated Easy is due in days, not now: {offered:?}"
    );
}

#[test]
fn the_restore_says_how_many_cards_are_waiting_for_their_deck() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    super::deck_sync::sync_practice_deck_blocking(BOOK).expect("sync the deck");
    let card_id = sandbox.cloze_card_id(1);
    super::fsrs_store::submit_card_review_blocking(&card_id, 4).expect("review the card");

    throw_away_the_cache();
    let report = restore_progress_blocking().expect("the setup closure puts the progress back");

    assert_eq!(report.reviews_added, 1, "the review history is back at once");
    assert_eq!(report.cards_rescheduled, 0, "there is no card row yet to write");
    assert_eq!(
        report.cards_waiting_for_deck, 1,
        "the reader is told the schedule is saved and waiting, not lost: {report:?}"
    );
    assert!(
        !report.changed_nothing(),
        "a start that saved a schedule is not a quiet start"
    );
}

#[test]
fn a_review_made_after_the_restore_is_not_pushed_back_by_the_next_deck_sync() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    super::deck_sync::sync_practice_deck_blocking(BOOK).expect("sync the deck");
    let card_id = sandbox.cloze_card_id(1);
    super::fsrs_store::submit_card_review_blocking(&card_id, 1).expect("the reader fails the card");

    throw_away_the_cache();
    start_the_app_the_way_it_starts();
    let newer = super::fsrs_store::submit_card_review_blocking(&card_id, 4).expect("and gets it right today");
    super::deck_sync::sync_practice_deck_blocking(BOOK).expect("the book is opened again");

    let (_, _, due, last_review, reps) = card_row(&card_id);
    assert_eq!(last_review, newer.last_review, "today's review stands");
    assert_eq!(due, newer.due);
    assert_eq!(reps, newer.reps);
}

#[test]
fn a_card_the_vault_knows_nothing_about_still_starts_as_new() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();

    start_the_app_the_way_it_starts();

    let card_id = sandbox.cloze_card_id(1);
    let (state, stability, due, last_review, reps) = card_row(&card_id);
    assert_eq!(reps, 0, "nothing was invented for a card that was never practised");
    assert_eq!(state, 0);
    assert_eq!(stability, 0.0);
    assert_eq!(last_review, 0);
    assert!(due > 0, "a new card is due now, which the deck sync sets");
}

#[test]
fn one_book_s_saved_schedule_is_not_written_onto_another_book_s_sync() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    super::deck_sync::sync_practice_deck_blocking(BOOK).expect("sync the deck");
    let card_id = sandbox.cloze_card_id(1);
    let schedule = super::fsrs_store::submit_card_review_blocking(&card_id, 4).expect("review the card");
    sandbox.write("books/other/_meta.json", OTHER_META);
    sandbox.write(
        "books/other/ch-01.md",
        "# Other

A sentence. ^p-001
",
    );

    throw_away_the_cache();
    restore_progress_blocking().expect("the setup closure puts the progress back");
    super::deck_sync::sync_practice_deck_blocking("other").expect("the other book has no deck, so nothing happens");

    assert_eq!(
        count("SELECT COUNT(*) FROM fsrs_cards"),
        0,
        "the other book's sync must not raise this book's card"
    );
    super::deck_sync::sync_practice_deck_blocking(BOOK).expect("now this book syncs");
    let (_, _, _, last_review, reps) = card_row(&card_id);
    assert_eq!(reps, schedule.reps, "and only then is the schedule back");
    assert_eq!(last_review, schedule.last_review);
}

const OTHER_META: &str = r#"{
  "book_id": "other",
  "title": "Another Book",
  "author": "Test Author",
  "total_words": 3,
  "total_chapters": 1,
  "spine": [
    { "id": "ch-01", "title": "Chapter 1", "file_path": "ch-01.md", "order": 1 }
  ]
}"#;
