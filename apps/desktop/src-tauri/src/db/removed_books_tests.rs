//! A book that leaves the vault leaves practice and "All Books" analytics too, and gets its study progress back when it
//! returns (LC-02). Nothing in the vault changes.

use std::path::Path;

use crate::db::{
    get_deck_stats_blocking, get_due_cards_blocking, get_reading_velocity_blocking, get_study_analytics_blocking,
    index_vault_blocking, open_or_create_db, record_reading_session_blocking, restore_progress_blocking,
    submit_card_review_blocking, sync_practice_deck_blocking,
};
use crate::test_support::Sandbox;

const GOOD: u8 = 3;

/// Writes the book `hume`: one chapter, and a practice deck with two cloze cards on it.
fn write_hume(sandbox: &Sandbox) {
    sandbox.write(
        "books/hume/_meta.json",
        r#"{ "book_id": "hume", "title": "An Enquiry", "author": "David Hume", "spine": [
             { "id": "ch-01", "title": "Custom", "file_path": "ch-01.md", "order": 1 } ] }"#,
    );
    sandbox.write(
        "books/hume/ch-01.md",
        "# Custom\n\nCustom is the great guide of human life. ^p-001\n",
    );
    let card = |n: usize, cloze: &str, answer: &str| {
        format!(
            "\n### card-ch-01-{n:03}\n- **Chapter:** ch-01\n- **Anchor:** ^p-001\n- **Cloze:** {cloze}\n- **Answer Key:** ``{answer}``\n"
        )
    };
    let deck = format!(
        "# Practice Deck: An Enquiry\n{}{}",
        card(1, "{{c1::Custom}} is the great guide of human life.", "Custom"),
        card(2, "Custom is the great {{c1::guide}} of human life.", "guide"),
    );
    sandbox.write("notes/hume/practice-deck.md", &deck);
}

/// Runs the index, as the app does when it opens and on "Rescan library".
fn index() {
    let summary = index_vault_blocking().unwrap_or_else(|e| panic!("the index returned an error: {e:#}"));
    assert!(summary.problems.is_empty(), "{:?}", summary.problems);
}

/// Opens the book, so its deck syncs, and rates the first cloze card that practice gives Good.
fn practice_one_card(book: &str) {
    sync_practice_deck_blocking(book).expect("sync the deck");
    let cards = get_due_cards_blocking(Some(book), Some("cloze"), Some(1), None).expect("due cards");
    submit_card_review_blocking(&cards[0].card_id, GOOD).expect("review the card");
}

/// What "All Books" in the analytics window counts: cards, reviews, and seconds of reading.
fn all_books() -> (usize, usize, u64) {
    let analytics = get_study_analytics_blocking(None).expect("study analytics");
    let reviews = analytics.review_blocks.iter().map(|block| block.count).sum();
    let seconds = get_reading_velocity_blocking(None)
        .expect("reading velocity")
        .total_seconds;
    (analytics.state_counts.total_cards, reviews, seconds)
}

/// The books whose cards practice gives when it takes cards from every book.
fn books_in_practice() -> Vec<String> {
    let mut books: Vec<String> = get_due_cards_blocking(None, None, Some(50), None)
        .expect("due cards of every book")
        .into_iter()
        .map(|card| card.book_id)
        .collect();
    books.sort();
    books.dedup();
    books
}

/// Every file under `folder` with its bytes, in path order.
fn files_in(folder: &Path) -> Vec<(String, Vec<u8>)> {
    let mut files = Vec::new();
    let mut folders = vec![folder.to_path_buf()];
    while let Some(next) = folders.pop() {
        for entry in std::fs::read_dir(&next).expect("read a folder").flatten() {
            let path = entry.path();
            if path.is_dir() {
                folders.push(path);
            } else {
                files.push((path.display().to_string(), std::fs::read(&path).expect("read a file")));
            }
        }
    }
    files.sort();
    files
}

/// The stored cards of `book` with their progress: (card id, state, stability, due, last review, reps).
fn cards_of(book: &str) -> Vec<(String, i64, f64, i64, i64, i64)> {
    let conn = open_or_create_db().expect("open the cache");
    let mut statement = conn
        .prepare(
            "SELECT card_id, state, stability, due, last_review, reps FROM fsrs_cards WHERE book_id = ?1 ORDER BY card_id",
        )
        .expect("prepare the card query");
    let rows = statement
        .query_map([book], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })
        .expect("query the cards");
    rows.map(|row| row.expect("read a card")).collect()
}

#[test]
fn a_deleted_book_leaves_all_books_analytics_and_practice() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    write_hume(&sandbox);
    practice_one_card("sample");
    practice_one_card("hume");
    record_reading_session_blocking("sample", "ch-01.md", 60, true).expect("read sample");
    record_reading_session_blocking("hume", "ch-01.md", 90, true).expect("read hume");
    index();
    assert_eq!(all_books(), (4, 2, 150), "both books count");
    assert_eq!(books_in_practice(), ["hume", "sample"]);

    let notes_before = files_in(&sandbox.vault().join("notes"));
    std::fs::remove_dir_all(sandbox.vault().join("books/hume")).expect("delete the book");
    index();

    assert_eq!(all_books(), (2, 1, 60), "only the book in the vault counts");
    assert_eq!(get_deck_stats_blocking(None).expect("deck stats").total_cards, 2);
    assert_eq!(
        books_in_practice(),
        ["sample"],
        "practice gives no card of the deleted book"
    );
    assert_eq!(
        files_in(&sandbox.vault().join("notes")),
        notes_before,
        "the notes and the study log in the vault stay as they are"
    );
}

#[test]
fn a_book_that_comes_back_gets_its_cards_review_history_and_reading_time_back() {
    let sandbox = Sandbox::new();
    write_hume(&sandbox);
    practice_one_card("hume");
    record_reading_session_blocking("hume", "ch-01.md", 90, true).expect("read hume");
    index();
    let studied = cards_of("hume");
    assert_eq!(all_books(), (2, 1, 90));

    // The book folder goes out of the vault for a while, as when it is moved to another folder, and comes back.
    let away = sandbox.vault().with_file_name("hume-away");
    std::fs::rename(sandbox.vault().join("books/hume"), &away).expect("move the book out of the vault");
    index();
    assert_eq!(all_books(), (0, 0, 0), "the book is out of the vault");
    std::fs::rename(&away, sandbox.vault().join("books/hume")).expect("move the book back");
    index();

    // The reader opens the book, so its deck syncs: every card is back with its progress.
    sync_practice_deck_blocking("hume").expect("sync the deck");
    assert_eq!(cards_of("hume"), studied);
    // The review history and the reading time come back from the study log in the vault at the next start.
    restore_progress_blocking().expect("start the app again");
    assert_eq!(all_books(), (2, 1, 90));
}

#[test]
fn a_book_folder_that_is_still_there_keeps_its_study_progress() {
    let sandbox = Sandbox::new();
    write_hume(&sandbox);
    practice_one_card("hume");
    record_reading_session_blocking("hume", "ch-01.md", 90, true).expect("read hume");
    index();
    let studied = cards_of("hume");
    assert_eq!(all_books(), (2, 1, 90));

    // The folder is still in the vault and only `_meta.json` is missing: a folder half-arrived from a cloud client,
    // a hand-made one, or one left by an import that failed before IN-05. A folder that is still there has not left
    // the vault, so its study progress stays (DS-19).
    std::fs::remove_file(sandbox.vault().join("books/hume/_meta.json")).expect("remove _meta.json");
    index();

    assert_eq!(all_books(), (2, 1, 90), "the study progress stays in the cache");
    assert_eq!(cards_of("hume"), studied, "no card was archived");
    assert_eq!(books_in_practice(), ["hume"], "practice still gives its cards");
}

#[test]
fn a_book_folder_that_is_still_there_gets_its_meta_file_back_and_changes_nothing() {
    let sandbox = Sandbox::new();
    write_hume(&sandbox);
    practice_one_card("hume");
    record_reading_session_blocking("hume", "ch-01.md", 90, true).expect("read hume");
    index();
    let studied = cards_of("hume");

    let meta = sandbox.vault().join("books/hume/_meta.json");
    let bytes = std::fs::read(&meta).expect("read _meta.json");
    std::fs::remove_file(&meta).expect("remove _meta.json");
    index();
    std::fs::write(&meta, &bytes).expect("put _meta.json back");
    index();

    // Nothing had to come back, because nothing left. No restart and no deck sync are needed here, and that is the
    // difference from a book that really left the vault.
    assert_eq!(all_books(), (2, 1, 90), "the book is counted again");
    assert_eq!(cards_of("hume"), studied, "the cards were never touched");
}

#[test]
fn a_vault_with_no_books_folder_keeps_the_study_progress_in_the_cache() {
    let sandbox = Sandbox::new();
    write_hume(&sandbox);
    practice_one_card("hume");
    index();

    // The books folder itself is gone: something happened to the vault, not to one book.
    std::fs::remove_dir_all(sandbox.vault().join("books")).expect("remove the books folder");
    index();
    assert_eq!(all_books(), (2, 1, 0), "no study progress leaves the cache");
}
