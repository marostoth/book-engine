//! Syncs `vault/notes/<book-id>/practice-deck.md` into `fsrs_cards` with one stored card per question.
//!
//! - A card's id comes from its question (`card_identity`), so progress follows the question when a deck
//!   generated again reorders or renumbers its cards, and a changed question starts as a new card.
//! - A stored card that is no longer in the deck moves to `fsrs_cards_archive` with its progress. It comes
//!   back with that progress when its question returns to the deck.
//! - The cards of a book that left the vault move to the archive too (`removed_books.rs`), and come back with
//!   their progress when the book returns and its deck syncs (LC-02).
//! - Rows from older builds, whose ids came from deck positions, get their question id. When two rows hold
//!   the same question, the row with more progress stays and the other one is archived.
//! - A deck without any valid card changes nothing.

use std::collections::HashSet;

use anyhow::Result;
use rusqlite::{params, OptionalExtension, Transaction};

use super::card_identity::card_identity;
use super::fsrs_parser::{parse_card_section, RawCard};
use super::schema::open_or_create_db;
use crate::vault::find_vault_root;

/// Archive reason for a card whose question is no longer in the deck. It comes back when its question returns.
const NOT_IN_DECK: &str = "not_in_deck";
/// Archive reason for a card of a book that left the vault (`removed_books.rs`). It comes back when the book returns.
pub(crate) const BOOK_NOT_IN_VAULT: &str = "book_not_in_vault";
/// Archive reason for an older row that held the same question as the card that stays. It never comes back.
const DUPLICATE: &str = "duplicate";

/// Synchronizes the practice deck of `book_id` and returns the number of distinct questions synced.
/// `parse_card_section` verifies every card verbatim against its chapter Markdown.
pub fn sync_practice_deck_blocking(book_id: &str) -> Result<usize> {
    let mut conn = open_or_create_db()?;
    let vault_root = find_vault_root()?;
    let deck_path = vault_root.join("notes").join(book_id).join("practice-deck.md");
    if !deck_path.exists() {
        return Ok(0);
    }

    let deck_content = std::fs::read_to_string(&deck_path)?;
    let book_dir = vault_root.join("books").join(book_id);
    let mut deck_ids = HashSet::new();
    let cards: Vec<(String, RawCard)> = deck_content
        .split("### ")
        .filter_map(|section| parse_card_section(section, &book_dir))
        .map(|card| (card_identity(book_id, &card.item_type, &card.cloze, &card.answer_key), card))
        .filter(|(card_id, _)| deck_ids.insert(card_id.clone()))
        .collect();
    if cards.is_empty() {
        return Ok(0);
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let tx = conn.transaction()?;
    give_old_rows_question_ids(&tx, book_id, now)?;
    for (card_id, card) in &cards {
        restore_archived_card(&tx, card_id)?;
        upsert_card(&tx, book_id, card_id, card, now)?;
    }
    for card_id in stored_card_ids(&tx, book_id)? {
        if !deck_ids.contains(&card_id) {
            archive_card(&tx, &card_id, NOT_IN_DECK, now)?;
        }
    }
    tx.commit()?;
    Ok(cards.len())
}

/// Inserts a new card, or updates the text of a stored card and keeps its schedule.
fn upsert_card(tx: &Transaction, book_id: &str, card_id: &str, card: &RawCard, now: i64) -> Result<()> {
    let payload_json = card.scenario_payload.as_ref().and_then(|p| serde_json::to_string(p).ok());
    tx.execute(
        "INSERT INTO fsrs_cards (
            card_id, book_id, chapter_file, anchor, item_type, prompt, answer,
            state, stability, difficulty, due, last_review, reps, card_type, payload
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0.0, 0.0, ?8, 0, 0, ?9, ?10)
        ON CONFLICT(card_id) DO UPDATE SET
            chapter_file = excluded.chapter_file,
            anchor = excluded.anchor,
            item_type = excluded.item_type,
            prompt = excluded.prompt,
            answer = excluded.answer,
            card_type = excluded.card_type,
            payload = excluded.payload",
        params![
            card_id,
            book_id,
            &card.chapter_file,
            &card.anchor,
            &card.item_type,
            &card.cloze,
            &card.answer_key,
            now,
            &card.card_type,
            payload_json,
        ],
    )?;
    Ok(())
}

fn stored_card_ids(tx: &Transaction, book_id: &str) -> Result<Vec<String>> {
    let mut stmt = tx.prepare("SELECT card_id FROM fsrs_cards WHERE book_id = ?1 ORDER BY rowid")?;
    let ids = stmt.query_map([book_id], |row| row.get(0))?.collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(ids)
}

/// Gives rows from older builds their question id and merges rows that hold the same question.
/// Review history follows the question id.
fn give_old_rows_question_ids(tx: &Transaction, book_id: &str, now: i64) -> Result<()> {
    let rows: Vec<(String, String, String, String)> = {
        let mut stmt = tx.prepare(
            "SELECT card_id, item_type, prompt, answer FROM fsrs_cards WHERE book_id = ?1 ORDER BY rowid",
        )?;
        let rows = stmt
            .query_map([book_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows
    };

    for (old_id, item_type, prompt, answer) in rows {
        let question_id = card_identity(book_id, &item_type, &prompt, &answer);
        if old_id == question_id {
            continue;
        }
        let stored = progress_of(tx, &question_id)?;
        let old = progress_of(tx, &old_id)?;
        match stored {
            None => rename_card(tx, &old_id, &question_id)?,
            Some(stored) if old > Some(stored) => {
                archive_card(tx, &question_id, DUPLICATE, now)?;
                rename_card(tx, &old_id, &question_id)?;
            }
            Some(_) => archive_card(tx, &old_id, DUPLICATE, now)?,
        }
        tx.execute("UPDATE review_logs SET card_id = ?1 WHERE card_id = ?2", params![question_id, old_id])?;
    }
    Ok(())
}

/// Progress for choosing between duplicates: more reviews first, then the later review.
fn progress_of(tx: &Transaction, card_id: &str) -> Result<Option<(i64, i64)>> {
    let progress = tx
        .query_row("SELECT reps, last_review FROM fsrs_cards WHERE card_id = ?1", [card_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .optional()?;
    Ok(progress)
}

fn rename_card(tx: &Transaction, old_id: &str, new_id: &str) -> Result<()> {
    tx.execute("UPDATE fsrs_cards SET card_id = ?1 WHERE card_id = ?2", params![new_id, old_id])?;
    Ok(())
}

/// Moves a stored card with its progress from `fsrs_cards` to `fsrs_cards_archive`.
fn archive_card(tx: &Transaction, card_id: &str, reason: &str, now: i64) -> Result<()> {
    tx.execute(
        "INSERT INTO fsrs_cards_archive (
            archived_at, reason, card_id, book_id, chapter_file, anchor, item_type, prompt, answer,
            state, stability, difficulty, due, last_review, reps, card_type, payload
        )
        SELECT ?1, ?2, card_id, book_id, chapter_file, anchor, item_type, prompt, answer,
               state, stability, difficulty, due, last_review, reps, card_type, payload
        FROM fsrs_cards WHERE card_id = ?3",
        params![now, reason, card_id],
    )?;
    tx.execute("DELETE FROM fsrs_cards WHERE card_id = ?1", [card_id])?;
    Ok(())
}

/// Moves every stored card of `book_id` with its progress from `fsrs_cards` to `fsrs_cards_archive`.
pub(crate) fn archive_cards_of_book(tx: &Transaction, book_id: &str, reason: &str, now: i64) -> Result<()> {
    tx.execute(
        "INSERT INTO fsrs_cards_archive (
            archived_at, reason, card_id, book_id, chapter_file, anchor, item_type, prompt, answer,
            state, stability, difficulty, due, last_review, reps, card_type, payload
        )
        SELECT ?1, ?2, card_id, book_id, chapter_file, anchor, item_type, prompt, answer,
               state, stability, difficulty, due, last_review, reps, card_type, payload
        FROM fsrs_cards WHERE book_id = ?3",
        params![now, reason, book_id],
    )?;
    tx.execute("DELETE FROM fsrs_cards WHERE book_id = ?1", [book_id])?;
    Ok(())
}

/// Brings a card back from the archive with its progress, when its question returns to the deck or its book returns
/// to the vault.
fn restore_archived_card(tx: &Transaction, card_id: &str) -> Result<()> {
    let archived: Option<i64> = tx
        .query_row(
            "SELECT archive_id FROM fsrs_cards_archive
             WHERE card_id = ?1 AND reason IN (?2, ?3) AND NOT EXISTS (SELECT 1 FROM fsrs_cards WHERE card_id = ?1)
             ORDER BY archive_id DESC LIMIT 1",
            params![card_id, NOT_IN_DECK, BOOK_NOT_IN_VAULT],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(archive_id) = archived {
        tx.execute(
            "INSERT INTO fsrs_cards (
                card_id, book_id, chapter_file, anchor, item_type, prompt, answer,
                state, stability, difficulty, due, last_review, reps, card_type, payload
            )
            SELECT card_id, book_id, chapter_file, anchor, item_type, prompt, answer,
                   state, stability, difficulty, due, last_review, reps, card_type, payload
            FROM fsrs_cards_archive WHERE archive_id = ?1",
            [archive_id],
        )?;
        tx.execute("DELETE FROM fsrs_cards_archive WHERE archive_id = ?1", [archive_id])?;
    }
    Ok(())
}
