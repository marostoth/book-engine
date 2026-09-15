//! Picks the practice cards for a session from the `fsrs_cards` cache table.

use anyhow::Result;
use super::models::PracticeCardItem;
use super::schema::open_or_create_db;

fn map_card_row(row: &rusqlite::Row) -> rusqlite::Result<PracticeCardItem> {
    let card_type: String = row.get(13).unwrap_or_else(|_| "cloze".to_string());
    let payload_str: Option<String> = row.get(14).ok();
    let scenario_payload = payload_str
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok());

    Ok(PracticeCardItem {
        card_id: row.get(0)?,
        book_id: row.get(1)?,
        chapter_file: row.get(2)?,
        anchor: row.get(3)?,
        item_type: row.get(4)?,
        prompt: row.get(5)?,
        answer: row.get(6)?,
        state: row.get(7)?,
        stability: row.get(8)?,
        difficulty: row.get(9)?,
        due: row.get(10)?,
        last_review: row.get(11)?,
        reps: row.get(12)?,
        card_type,
        scenario_payload,
    })
}

/// A practice session takes cards from two queues: due reviews first, then new cards.
#[derive(Clone, Copy)]
enum Queue {
    /// Reviewed cards whose due time has passed. A card rated Again is due 10 minutes after the review.
    Review,
    /// Cards that were never reviewed.
    New,
}

/// The cards a query may return: one book or all books, and optionally one chapter file of that book.
#[derive(Clone, Copy)]
struct Scope<'a> {
    book_id: Option<&'a str>,
    chapter_file: Option<&'a str>,
}

fn fetch_due_cards_query(
    conn: &rusqlite::Connection,
    now: i64,
    scope: Scope<'_>,
    card_type_filter: Option<&str>,
    queue: Queue,
    limit: usize,
) -> Result<Vec<PracticeCardItem>> {
    let mut query = "SELECT card_id, book_id, chapter_file, anchor, item_type, prompt, answer, state, stability, difficulty, due, last_review, reps, card_type, payload
         FROM fsrs_cards".to_string();

    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

    match queue {
        Queue::Review => {
            query.push_str(" WHERE reps > 0 AND due <= ?");
            params_vec.push(now.into());
        }
        Queue::New => query.push_str(" WHERE reps = 0"),
    }

    if let Some(b_id) = scope.book_id {
        query.push_str(" AND book_id = ?");
        params_vec.push(b_id.to_string().into());
    }

    if let Some(chapter_file) = scope.chapter_file {
        query.push_str(" AND chapter_file = ?");
        params_vec.push(chapter_file.to_string().into());
    }

    if let Some(ct) = card_type_filter {
        if ct == "scenario" {
            query.push_str(" AND card_type = 'scenario'");
        } else if ct == "cloze" {
            query.push_str(" AND card_type != 'scenario'");
        }
    }

    // Most overdue reviews first; new cards in sync order. rowid keeps the deck order inside one sync.
    query.push_str(" ORDER BY due ASC, rowid ASC LIMIT ?;");
    params_vec.push((limit as i64).into());

    let mut stmt = conn.prepare(&query)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params_vec), map_card_row)?;
    let mut cards = Vec::new();
    for row in rows {
        cards.push(row?);
    }
    Ok(cards)
}

/// Retrieves up to `limit` practice cards, filtered by book_id, card_type, and hybrid ratio.
/// Due reviews come first and new cards fill the places that are left, so a failed or overdue
/// card never waits behind new cards.
pub fn get_due_cards_blocking(
    book_id: Option<&str>,
    card_type: Option<&str>,
    limit: Option<usize>,
    hybrid_ratio: Option<f32>,
) -> Result<Vec<PracticeCardItem>> {
    due_cards_in(Scope { book_id, chapter_file: None }, card_type, limit, hybrid_ratio)
}

/// Retrieves up to `limit` due cards from one chapter file of a book, in the same order as `get_due_cards_blocking`.
/// The Chapter Gatekeeper tests these cards before the reader leaves that chapter. The book id is required,
/// because every book names its chapters `ch-01.md`, `ch-02.md`, and so on.
pub fn get_chapter_due_cards_blocking(
    book_id: &str,
    chapter_file: &str,
    card_type: Option<&str>,
    limit: Option<usize>,
    hybrid_ratio: Option<f32>,
) -> Result<Vec<PracticeCardItem>> {
    let scope = Scope { book_id: Some(book_id), chapter_file: Some(chapter_file) };
    due_cards_in(scope, card_type, limit, hybrid_ratio)
}

fn due_cards_in(
    scope: Scope<'_>,
    card_type: Option<&str>,
    limit: Option<usize>,
    hybrid_ratio: Option<f32>,
) -> Result<Vec<PracticeCardItem>> {
    let conn = open_or_create_db()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let target_limit = limit.unwrap_or(50).max(1);

    let mut cards = fetch_queue(&conn, now, scope, card_type, hybrid_ratio, Queue::Review, target_limit)?;
    let free_places = target_limit.saturating_sub(cards.len());
    if free_places > 0 {
        cards.extend(fetch_queue(&conn, now, scope, card_type, hybrid_ratio, Queue::New, free_places)?);
    }
    Ok(cards)
}

/// Fetches up to `limit` cards from one queue: one card type, or both types mixed for hybrid mode.
fn fetch_queue(
    conn: &rusqlite::Connection,
    now: i64,
    scope: Scope<'_>,
    card_type: Option<&str>,
    hybrid_ratio: Option<f32>,
    queue: Queue,
    limit: usize,
) -> Result<Vec<PracticeCardItem>> {
    match card_type {
        Some("scenario") => fetch_due_cards_query(conn, now, scope, Some("scenario"), queue, limit),
        Some("cloze") => fetch_due_cards_query(conn, now, scope, Some("cloze"), queue, limit),
        _ => {
            let ratio = hybrid_ratio.unwrap_or(0.5).clamp(0.05, 0.95);
            // Fetch `limit` cards of each type, so that either type can fill places the other leaves empty.
            let clozes = fetch_due_cards_query(conn, now, scope, Some("cloze"), queue, limit)?;
            let scenarios = fetch_due_cards_query(conn, now, scope, Some("scenario"), queue, limit)?;
            Ok(mix_by_ratio(clozes, scenarios, limit, ratio))
        }
    }
}

/// Hybrid mix of at most `limit` cards: about `ratio` of the places go to cloze cards and the rest
/// to scenario cards. When one type runs short, the other type fills its places. The two types
/// alternate, and the filler cards come last.
fn mix_by_ratio(
    clozes: Vec<PracticeCardItem>,
    scenarios: Vec<PracticeCardItem>,
    limit: usize,
    ratio: f32,
) -> Vec<PracticeCardItem> {
    let cloze_places = (((limit as f32) * ratio).round() as usize).min(limit);
    let cloze_take = cloze_places.min(clozes.len());
    let scenario_take = (limit - cloze_places).min(scenarios.len());
    let cloze_fill = (limit - cloze_take - scenario_take).min(clozes.len() - cloze_take);
    let scenario_fill = (limit - cloze_take - scenario_take - cloze_fill).min(scenarios.len() - scenario_take);

    let mut clozes = clozes.into_iter();
    let mut scenarios = scenarios.into_iter();
    let mut mixed = Vec::with_capacity(limit);
    for i in 0..cloze_take.max(scenario_take) {
        if i < cloze_take {
            mixed.extend(clozes.next());
        }
        if i < scenario_take {
            mixed.extend(scenarios.next());
        }
    }
    mixed.extend(clozes.take(cloze_fill));
    mixed.extend(scenarios.take(scenario_fill));
    mixed
}

#[cfg(test)]
mod tests {
    use super::{get_chapter_due_cards_blocking, get_due_cards_blocking};
    use crate::db::{open_or_create_db, submit_card_review_blocking, sync_practice_deck_blocking, PracticeCardItem};
    use crate::test_support::Sandbox;

    const AGAIN: u8 = 1;

    /// Moves every schedule timestamp `seconds` into the past, as if that much time had passed.
    fn pass_time(seconds: i64) {
        open_or_create_db()
            .expect("open sandbox database")
            .execute(
                "UPDATE fsrs_cards SET due = due - ?1, last_review = MAX(last_review - ?1, 0)",
                [seconds],
            )
            .expect("move schedule timestamps");
    }

    fn ids(cards: &[PracticeCardItem]) -> Vec<&str> {
        cards.iter().map(|card| card.card_id.as_str()).collect()
    }

    fn chapters(cards: &[PracticeCardItem]) -> Vec<&str> {
        cards.iter().map(|card| card.chapter_file.as_str()).collect()
    }

    #[test]
    fn test_failed_card_comes_back_before_new_cards() {
        let sandbox = Sandbox::new();
        sandbox.write_sample_book();
        sandbox.write_sample_deck(4, 0);
        assert_eq!(sync_practice_deck_blocking("sample").expect("Failed to sync deck"), 4);
        let cloze = |n| sandbox.cloze_card_id(n);

        submit_card_review_blocking(&cloze(1), AGAIN).expect("Submit review failed");
        let due = get_due_cards_blocking(Some("sample"), Some("cloze"), Some(10), None).expect("Failed to get due cards");
        assert!(!ids(&due).contains(&cloze(1).as_str()), "A failed card must wait 10 minutes");

        // An hour later the failed card is due again. It must come before the 3 new cards.
        pass_time(3600);
        let due = get_due_cards_blocking(Some("sample"), Some("cloze"), Some(2), None).expect("Failed to get due cards");
        assert_eq!(ids(&due), [cloze(1), cloze(2)]);
    }

    #[test]
    fn test_hybrid_mode_gives_due_reviews_before_new_cards_of_either_type() {
        let sandbox = Sandbox::new();
        sandbox.write_sample_book();
        sandbox.write_sample_deck(3, 2);
        assert_eq!(sync_practice_deck_blocking("sample").expect("Failed to sync deck"), 5);
        let cloze = |n| sandbox.cloze_card_id(n);

        submit_card_review_blocking(&cloze(1), AGAIN).expect("Submit review failed");
        submit_card_review_blocking(&cloze(2), AGAIN).expect("Submit review failed");
        pass_time(3600);

        // Both due cloze reviews come first, although a 50:50 mix of 2 cards has only 1 cloze place.
        let due = get_due_cards_blocking(Some("sample"), None, Some(2), Some(0.5)).expect("Failed to get due cards");
        assert_eq!(ids(&due), [cloze(1), cloze(2)]);

        // New cards fill the places that are left, mixed 50:50.
        let due = get_due_cards_blocking(Some("sample"), None, Some(4), Some(0.5)).expect("Failed to get due cards");
        assert_eq!(ids(&due), [cloze(1), cloze(2), cloze(3), sandbox.scenario_card_id(1)]);

        // The mix never gives more cards than the limit.
        let due = get_due_cards_blocking(Some("sample"), None, Some(1), Some(0.5)).expect("Failed to get due cards");
        assert_eq!(ids(&due), [cloze(1)]);
    }

    /// A cloze card of the sandbox deck in `chapter` (for example `ch-01`), number `n`, with its own question.
    fn cloze_card(chapter: &str, n: usize, cloze: &str, answer: &str) -> String {
        format!(
            "\n### card-{chapter}-{n:03}\n- **Chapter:** {chapter}\n- **Anchor:** ^p-001\n- **Cloze:** Card {n}: {cloze}\n- **Answer Key:** ``{answer}``\n"
        )
    }

    #[test]
    fn test_chapter_due_cards_come_only_from_that_chapter() {
        let sandbox = Sandbox::new();
        sandbox.write_sample_book();
        sandbox.write(
            "books/sample/ch-02.md",
            "# Chapter 2: Markets\n\nThe extent of the market limits the division of labour. ^p-001\n",
        );
        let mut deck = String::from("# Practice Deck: Sandbox Economics\n");
        for n in 1..=3 {
            let cloze = "The {{c1::division of labour}} raises the productive powers of work.";
            deck.push_str(&cloze_card("ch-01", n, cloze, "division of labour"));
        }
        for n in 1..=2 {
            let cloze = "The {{c1::extent of the market}} limits the division of labour.";
            deck.push_str(&cloze_card("ch-02", n, cloze, "extent of the market"));
        }
        sandbox.write("notes/sample/practice-deck.md", &deck);
        assert_eq!(sync_practice_deck_blocking("sample").expect("Failed to sync deck"), 5);

        // The first 3 due cards of the book all come from chapter 1.
        let book = get_due_cards_blocking(Some("sample"), Some("cloze"), Some(3), None).expect("Failed to get due cards");
        assert_eq!(chapters(&book), ["ch-01.md"; 3]);

        // Leaving chapter 2, the gatekeeper gets only chapter 2 cards, up to its quota.
        let gate = get_chapter_due_cards_blocking("sample", "ch-02.md", Some("cloze"), Some(3), None)
            .expect("Failed to get chapter due cards");
        assert_eq!(chapters(&gate), ["ch-02.md"; 2]);
        let gate = get_chapter_due_cards_blocking("sample", "ch-02.md", None, Some(1), Some(0.5))
            .expect("Failed to get chapter due cards");
        assert_eq!(chapters(&gate), ["ch-02.md"]);
    }
}
