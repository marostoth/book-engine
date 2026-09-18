//! Tests for `submit_card_review_blocking`: a review saves the card schedule and its review log row
//! together, or it saves nothing and returns the error.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, TransactionBehavior};

use crate::db::{open_or_create_db, submit_card_review_blocking, sync_practice_deck_blocking};
use crate::fsrs::{schedule_card, CardState, Rating};
use crate::test_support::Sandbox;

/// A stored card: (book_id, state, stability, difficulty, due, last_review, reps).
type StoredCard = (String, i64, f64, f64, i64, i64, i64);

/// Writes the sandbox book, syncs its practice deck, and returns the id of its cloze card.
fn synced_card(sandbox: &Sandbox) -> String {
    sandbox.write_sample_book();
    sync_practice_deck_blocking("sample").expect("sync the sample deck");
    sandbox.cloze_card_id(1)
}

fn stored_card(conn: &Connection, card_id: &str) -> StoredCard {
    conn.query_row(
        "SELECT book_id, state, stability, difficulty, due, last_review, reps FROM fsrs_cards WHERE card_id = ?1",
        params![card_id],
        |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
            ))
        },
    )
    .expect("stored card")
}

/// The review log rows of a card, oldest first: (book_id, rating, reviewed_at).
fn review_logs(conn: &Connection, card_id: &str) -> Vec<(String, i64, i64)> {
    let mut stmt = conn
        .prepare("SELECT book_id, rating, reviewed_at FROM review_logs WHERE card_id = ?1 ORDER BY id")
        .expect("prepare the review log query");
    stmt.query_map(params![card_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .expect("query the review logs")
        .map(|row| row.expect("review log row"))
        .collect()
}

#[test]
fn review_saves_the_schedule_and_one_log_row_under_the_book_of_the_card() {
    let sandbox = Sandbox::new();
    let card_id = synced_card(&sandbox);
    let conn = open_or_create_db().expect("open the sandbox database");
    // Not "sample", so a made-up "sample" book id in the log row would show.
    conn.execute(
        "UPDATE fsrs_cards SET book_id = 'wealth-of-nations' WHERE card_id = ?1",
        params![card_id],
    )
    .expect("move the card to another book");

    let schedule = submit_card_review_blocking(&card_id, 3).expect("the review is saved");

    assert_eq!(schedule.reps, 1);
    assert_eq!(
        stored_card(&conn, &card_id),
        (
            "wealth-of-nations".to_string(),
            i64::from(schedule.state),
            schedule.stability,
            schedule.difficulty,
            schedule.due,
            schedule.last_review,
            schedule.reps,
        )
    );
    assert_eq!(
        review_logs(&conn, &card_id),
        vec![("wealth-of-nations".to_string(), 3, schedule.last_review)]
    );
}

#[test]
fn review_whose_log_row_fails_saves_nothing_and_returns_the_error() {
    let sandbox = Sandbox::new();
    let card_id = synced_card(&sandbox);
    let conn = open_or_create_db().expect("open the sandbox database");
    let before = stored_card(&conn, &card_id);
    conn.execute_batch(
        "CREATE TRIGGER review_log_fails BEFORE INSERT ON review_logs
         BEGIN SELECT RAISE(ABORT, 'review log is not writable'); END;",
    )
    .expect("make review log inserts fail");

    let err = submit_card_review_blocking(&card_id, 3).expect_err("a review whose log row fails must return an error");

    assert!(
        format!("{err:#}").contains("review log is not writable"),
        "unexpected error: {err:#}"
    );
    assert_eq!(
        stored_card(&conn, &card_id),
        before,
        "the card must keep its old schedule"
    );
    assert!(review_logs(&conn, &card_id).is_empty());
}

#[test]
fn card_without_a_book_id_is_not_reviewed() {
    let sandbox = Sandbox::new();
    let card_id = synced_card(&sandbox);
    let conn = open_or_create_db().expect("open the sandbox database");
    conn.execute(
        "UPDATE fsrs_cards SET book_id = '' WHERE card_id = ?1",
        params![card_id],
    )
    .expect("clear the book id");
    let before = stored_card(&conn, &card_id);

    let err = submit_card_review_blocking(&card_id, 3).expect_err("a card without a book id must not be reviewed");

    assert!(format!("{err:#}").contains("no book id"), "unexpected error: {err:#}");
    assert_eq!(
        stored_card(&conn, &card_id),
        before,
        "the card must keep its old schedule"
    );
    assert!(
        review_logs(&conn, &card_id).is_empty(),
        "no log row may be saved without the book id of the card"
    );
}

/// A double click sends two reviews of the same card. The second review must start from the saved
/// result of the first review, not from the schedule that the first review replaces.
#[test]
fn review_that_waits_for_another_review_of_the_card_builds_on_it() {
    let sandbox = Sandbox::new();
    let card_id = synced_card(&sandbox);
    let mut first = open_or_create_db().expect("open the sandbox database");

    // The first review holds the write lock while it saves.
    let saving = first
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .expect("take the write lock");
    let second = {
        let card_id = card_id.clone();
        sandbox.spawn(move || submit_card_review_blocking(&card_id, 3))
    };
    // Time for the second review to reach the card while the first review saves.
    std::thread::sleep(Duration::from_millis(300));

    let now = SystemTime::now().duration_since(UNIX_EPOCH).expect("clock").as_secs() as i64;
    let reviewed = schedule_card(&card_id, CardState::New, 0.0, 0.0, 0, 0, now, Rating::Good);
    saving
        .execute(
            "UPDATE fsrs_cards SET state = ?1, stability = ?2, difficulty = ?3, due = ?4, last_review = ?5, reps = ?6
             WHERE card_id = ?7",
            params![
                reviewed.state,
                reviewed.stability,
                reviewed.difficulty,
                reviewed.due,
                reviewed.last_review,
                reviewed.reps,
                card_id
            ],
        )
        .expect("save the first review");
    saving
        .execute(
            "INSERT INTO review_logs (card_id, book_id, rating, reviewed_at) VALUES (?1, 'sample', 3, ?2)",
            params![card_id, now],
        )
        .expect("log the first review");
    saving.commit().expect("finish the first review");

    let schedule = second
        .join()
        .expect("second review thread")
        .expect("the second review is saved");

    assert_eq!(schedule.reps, 2, "the second review must build on the first review");
    assert_eq!(stored_card(&first, &card_id).6, 2);
    assert_eq!(review_logs(&first, &card_id).len(), 2);
}
