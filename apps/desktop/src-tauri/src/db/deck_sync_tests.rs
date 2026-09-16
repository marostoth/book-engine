//! Practice deck sync keeps one stored card per question. A card that leaves the deck leaves the
//! practice queue, a changed question starts fresh, and progress follows the question text, not
//! its position in the deck.

use rusqlite::params;

use crate::db::{
    get_deck_stats_blocking, get_due_cards_blocking, open_or_create_db, submit_card_review_blocking,
    sync_practice_deck_blocking,
};
use crate::test_support::Sandbox;

const GOOD: u8 = 3;

/// Cloze cards whose answers are in the sandbox chapter: (cloze text, answer key).
const DIVISION: (&str, &str) = ("The {{c1::division of labour}} raises the productive powers of work.", "division of labour");
const PIN_MAKER: (&str, &str) = ("A {{c1::pin maker}} working alone can make few pins in a day.", "pin maker");
/// Its answer is not in the sandbox chapter, so sync rejects it.
const STEAM: (&str, &str) = ("The {{c1::steam engine}} changed every workshop.", "steam engine");

fn sync(expected_cards: usize) {
    assert_eq!(sync_practice_deck_blocking("sample").expect("sync deck"), expected_cards);
}

/// Reps of every stored card with this question, one entry per row.
fn reps_of(card: (&str, &str)) -> Vec<i64> {
    let conn = open_or_create_db().expect("open sandbox database");
    let mut stmt = conn.prepare("SELECT reps FROM fsrs_cards WHERE prompt = ?1").expect("prepare reps query");
    let rows = stmt.query_map([card.0], |row| row.get(0)).expect("query reps");
    rows.map(|row| row.expect("read reps")).collect()
}

fn review_good(card: (&str, &str)) {
    let card_id: String = open_or_create_db()
        .expect("open sandbox database")
        .query_row("SELECT card_id FROM fsrs_cards WHERE prompt = ?1", [card.0], |row| row.get(0))
        .expect("stored card with this question");
    submit_card_review_blocking(&card_id, GOOD).expect("submit review");
}

fn due_prompts() -> Vec<String> {
    get_due_cards_blocking(Some("sample"), None, Some(50), None)
        .expect("get due cards")
        .into_iter()
        .map(|card| card.prompt)
        .collect()
}

fn total_cards() -> usize {
    get_deck_stats_blocking(Some("sample")).expect("deck stats").total_cards
}

#[test]
fn card_removed_from_the_deck_leaves_the_practice_queue() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    sandbox.write_cloze_deck(&[("card-ch-01-001", DIVISION), ("card-ch-01-002", PIN_MAKER)]);
    sync(2);

    sandbox.write_cloze_deck(&[("card-ch-01-001", DIVISION)]);
    sync(1);
    assert_eq!(due_prompts(), [DIVISION.0]);
    assert_eq!(total_cards(), 1);
}

#[test]
fn changed_question_under_the_same_deck_id_starts_with_a_fresh_schedule() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    sandbox.write_cloze_deck(&[("card-ch-01-001", DIVISION)]);
    sync(1);
    review_good(DIVISION);

    // The deck is generated again, and card-ch-01-001 now holds another question.
    sandbox.write_cloze_deck(&[("card-ch-01-001", PIN_MAKER)]);
    sync(1);
    assert_eq!(reps_of(PIN_MAKER), [0]);
    assert_eq!(due_prompts(), [PIN_MAKER.0]);
}

#[test]
fn progress_follows_the_question_when_the_deck_order_changes() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    sandbox.write_cloze_deck(&[("card-ch-01-001", DIVISION), ("card-ch-01-002", PIN_MAKER)]);
    sync(2);
    review_good(DIVISION);

    sandbox.write_cloze_deck(&[("card-ch-01-001", PIN_MAKER), ("card-ch-01-002", DIVISION)]);
    sync(2);
    assert_eq!(reps_of(DIVISION), [1]);
    assert_eq!(reps_of(PIN_MAKER), [0]);
}

#[test]
fn card_that_returns_to_the_deck_gets_its_progress_back() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    sandbox.write_cloze_deck(&[("card-ch-01-001", DIVISION), ("card-ch-01-002", PIN_MAKER)]);
    sync(2);
    review_good(DIVISION);

    sandbox.write_cloze_deck(&[("card-ch-01-002", PIN_MAKER)]);
    sync(1);
    sandbox.write_cloze_deck(&[("card-ch-01-001", DIVISION), ("card-ch-01-002", PIN_MAKER)]);
    sync(2);
    assert_eq!(reps_of(DIVISION), [1]);
}

#[test]
fn old_duplicate_rows_merge_into_one_card_that_keeps_the_progress_and_review_history() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    // Rows from older builds: the same question under the id without the book prefix (reviewed once)
    // and under the id with the prefix (never reviewed), as in the real Dalton deck.
    let conn = open_or_create_db().expect("open sandbox database");
    for (card_id, state, last_review, reps) in [("card-ch-01-001", 1, 1_000, 1), ("sample-card-ch-01-001", 0, 0, 0)] {
        conn.execute(
            "INSERT INTO fsrs_cards (card_id, book_id, chapter_file, anchor, item_type, prompt, answer,
                                     state, stability, difficulty, due, last_review, reps, card_type)
             VALUES (?1, 'sample', 'ch-01.md', '^p-001', 'cloze', ?2, ?3, ?4, 0.4, 7.2, ?5, ?5, ?6, 'cloze')",
            params![card_id, DIVISION.0, DIVISION.1, state, last_review, reps],
        )
        .expect("insert old card row");
    }
    conn.execute(
        "INSERT INTO review_logs (card_id, book_id, rating, reviewed_at) VALUES ('card-ch-01-001', 'sample', 1, 1000)",
        [],
    )
    .expect("insert old review log");

    sandbox.write_cloze_deck(&[("card-ch-01-001", DIVISION)]);
    sync(1);
    assert_eq!(reps_of(DIVISION), [1]);
    let card_id: String = conn.query_row("SELECT card_id FROM fsrs_cards", [], |row| row.get(0)).expect("one card");
    let logged: String = conn.query_row("SELECT card_id FROM review_logs", [], |row| row.get(0)).expect("one review log");
    assert_eq!(logged, card_id, "the review history must follow the card that stays");
}

#[test]
fn deck_without_valid_cards_keeps_the_stored_cards() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    sandbox.write_cloze_deck(&[("card-ch-01-001", DIVISION)]);
    sync(1);
    review_good(DIVISION);

    // Every card in this deck fails the verbatim check, for example while a chapter is being rewritten.
    sandbox.write_cloze_deck(&[("card-ch-01-001", STEAM)]);
    sync(0);
    assert_eq!(reps_of(DIVISION), [1]);
    assert_eq!(total_cards(), 1);
}

/// A cloze card is stored only when its answer is in its chapter. A card whose chapter file is missing was stored
/// without that check (LC-02).
#[test]
fn card_whose_chapter_file_is_missing_is_not_synced() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    sandbox.write_cloze_deck(&[("card-ch-01-001", DIVISION)]);
    // The deck also asks about chapter 9, which the book does not have.
    let path = sandbox.vault().join("notes/sample/practice-deck.md");
    let mut deck = std::fs::read_to_string(&path).expect("read the deck");
    deck.push_str(&format!(
        "\n### card-ch-09-001\n- **Chapter:** ch-09\n- **Anchor:** ^p-001\n- **Cloze:** {}\n- **Answer Key:** ``{}``\n",
        STEAM.0, STEAM.1
    ));
    sandbox.write("notes/sample/practice-deck.md", &deck);

    sync(1);
    assert!(reps_of(STEAM).is_empty(), "a card whose answer cannot be checked is not stored");
    assert_eq!(due_prompts(), [DIVISION.0]);
}
