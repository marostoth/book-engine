//! AN-03: the analytics window shows only numbers the app has.
//!
//! It showed made-up numbers. With no review, the retention rate was a default of 90%. A card that was never reviewed
//! counted as due, so "Due Today" showed nearly every card of the deck. The reading table named each chapter by its
//! file name, because the cache sent no titles, and "All Books" divided the finished chapters by the chapters of the
//! open book.

use serde_json::{json, Value};

use super::analytics::get_study_analytics_blocking;
use super::deck_sync::sync_practice_deck_blocking;
use super::due_cards::get_due_cards_blocking;
use super::fsrs_store::submit_card_review_blocking;
use super::reading_velocity::{get_reading_velocity_blocking, record_reading_session_blocking};
use super::schema::open_or_create_db;
use crate::test_support::Sandbox;

const AGAIN: u8 = 1;
const EASY: u8 = 4;

/// The study analytics, as JSON, as the window gets them.
fn study_analytics(book: Option<&str>) -> Value {
    serde_json::to_value(get_study_analytics_blocking(book).expect("read the study analytics")).expect("as JSON")
}

/// The reading analytics, as JSON, as the window gets them.
fn reading_analytics(book: Option<&str>) -> Value {
    serde_json::to_value(get_reading_velocity_blocking(book).expect("read the reading analytics")).expect("as JSON")
}

/// Moves every schedule time `seconds` into the past, as if that much time had passed.
fn pass_time(seconds: i64) {
    open_or_create_db()
        .expect("open the sandbox cache")
        .execute(
            "UPDATE fsrs_cards SET due = due - ?1, last_review = MAX(last_review - ?1, 0)",
            [seconds],
        )
        .expect("move the schedule times");
}

/// Each row of the reading table as (book, chapter), with the text the cache sent. "(no title)" marks a missing
/// title, and "(no book)" a row that does not say its book.
fn table_rows(stats: &Value) -> Vec<(String, String)> {
    stats["chapter_stats"]
        .as_array()
        .expect("one row for each chapter")
        .iter()
        .map(|row| {
            let book = row["book_title"].as_str().map(str::to_string);
            let chapter = row["chapter_title"].as_str().map(str::to_string);
            (
                book.unwrap_or_else(|| match row["book_id"].as_str() {
                    Some(book_id) => format!("{book_id} (no title)"),
                    None => "(no book)".to_string(),
                }),
                chapter.unwrap_or_else(|| format!("{} (no title)", row["chapter_file"].as_str().unwrap_or("?"))),
            )
        })
        .collect()
}

fn rows(expected: &[(&str, &str)]) -> Vec<(String, String)> {
    expected
        .iter()
        .map(|(book, chapter)| (book.to_string(), chapter.to_string()))
        .collect()
}

#[test]
fn the_retention_rate_is_empty_before_the_first_review_and_counts_every_review_after() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    sync_practice_deck_blocking("sample").expect("open the book");

    for book in [Some("sample"), None] {
        assert_eq!(
            study_analytics(book)["retention_rate"],
            Value::Null,
            "{book:?}: no card was reviewed, so there is no retention rate to show"
        );
    }

    submit_card_review_blocking(&sandbox.cloze_card_id(1), AGAIN).expect("rate a card Again");
    for book in [Some("sample"), None] {
        assert_eq!(
            study_analytics(book)["retention_rate"],
            json!(0.0),
            "{book:?}: 0 of 1 reviews remembered"
        );
    }

    submit_card_review_blocking(&sandbox.scenario_card_id(1), EASY).expect("rate a card Easy");
    for book in [Some("sample"), None] {
        assert_eq!(
            study_analytics(book)["retention_rate"],
            json!(50.0),
            "{book:?}: 1 of 2 reviews remembered"
        );
    }
}

#[test]
fn reviews_due_are_the_reviews_practice_gives_now_and_new_cards_count_apart() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    sandbox.write_sample_deck(3, 0);
    sync_practice_deck_blocking("sample").expect("open the book");
    submit_card_review_blocking(&sandbox.cloze_card_id(1), AGAIN).expect("rate card 1 Again: due again in minutes");
    submit_card_review_blocking(&sandbox.cloze_card_id(2), EASY).expect("rate card 2 Easy: due again in days");
    // An hour later card 1 is due, and card 2 is not. Card 3 was never reviewed.
    pass_time(60 * 60);

    let practice = get_due_cards_blocking(Some("sample"), None, Some(50), None).expect("the practice cards");
    let reviews_in_practice = practice.iter().filter(|card| card.reps > 0).count();
    let new_in_practice = practice.iter().filter(|card| card.reps == 0).count();
    assert_eq!(
        (reviews_in_practice, new_in_practice),
        (1, 1),
        "practice gives card 1 to review and card 3 as new"
    );

    for book in [Some("sample"), None] {
        let analytics = study_analytics(book);
        assert!(
            analytics.get("cards_due_today").is_none(),
            "{book:?}: \"Due Today\" counted the new card as due: {} cards",
            analytics["cards_due_today"]
        );
        assert_eq!(
            analytics["reviews_due"], reviews_in_practice,
            "{book:?}: the reviews practice gives now"
        );
        assert_eq!(
            analytics["new_cards"], new_in_practice,
            "{book:?}: the new cards, apart"
        );
    }
}

#[test]
fn the_reading_table_names_each_book_and_chapter_and_all_books_counts_the_chapters_of_every_book() {
    let sandbox = Sandbox::new();
    // "Sandbox Economics", with 1 chapter.
    sandbox.write_sample_book();
    sandbox.write(
        "books/hume/_meta.json",
        r#"{ "book_id": "hume", "title": "An Enquiry", "author": "David Hume", "total_chapters": 2, "spine": [
             { "id": "ch-01", "title": "Of the Origin of Ideas", "file_path": "ch-01.md", "order": 1 },
             { "id": "ch-02", "title": "Of the Association of Ideas", "file_path": "ch-02.md", "order": 2 } ] }"#,
    );
    // A book with no reading yet: its chapters count in "All Books" too.
    sandbox.write(
        "books/locke/_meta.json",
        r#"{ "book_id": "locke", "title": "Two Treatises", "author": "John Locke", "total_chapters": 4, "spine": [
             { "id": "ch-01", "title": "One", "file_path": "ch-01.md", "order": 1 },
             { "id": "ch-02", "title": "Two", "file_path": "ch-02.md", "order": 2 },
             { "id": "ch-03", "title": "Three", "file_path": "ch-03.md", "order": 3 },
             { "id": "ch-04", "title": "Four", "file_path": "ch-04.md", "order": 4 } ] }"#,
    );
    record_reading_session_blocking("sample", "ch-01.md", 120, true).expect("read the sample chapter");
    record_reading_session_blocking("hume", "ch-02.md", 30, false).expect("read Hume chapter 2");
    record_reading_session_blocking("hume", "ch-01.md", 45, true).expect("read Hume chapter 1");
    // The spine does not list this file, so it keeps its file name: the cache makes up no title.
    record_reading_session_blocking("hume", "ch-09.md", 15, false).expect("read a chapter the spine does not list");

    let hume_rows = [
        ("An Enquiry", "Of the Origin of Ideas"),
        ("An Enquiry", "Of the Association of Ideas"),
        ("An Enquiry", "ch-09.md (no title)"),
    ];
    let all = reading_analytics(None);
    assert_eq!(
        table_rows(&all),
        rows(
            &[
                hume_rows.as_slice(),
                &[("Sandbox Economics", "Chapter 1: Division of Labour")]
            ]
            .concat()
        ),
        "All Books: every row names its book and chapter, in book and reading order"
    );
    assert_eq!(
        all["total_chapters"], 7,
        "All Books: the chapters of every book in the vault (1 + 2 + 4)"
    );
    assert_eq!(all["completed_chapters"], 2);

    let hume = reading_analytics(Some("hume"));
    assert_eq!(
        table_rows(&hume),
        rows(&hume_rows),
        "one book: its chapters in reading order"
    );
    assert_eq!(hume["total_chapters"], 2, "one book: the chapters of that book");
    assert_eq!(hume["completed_chapters"], 1);
}
