//! Puts your study progress back into the cache from the vault.
//!
//! The vault is the permanent record (`vault/study_log.rs`). The cache database only holds a copy, so the
//! app can ask questions of it quickly. This runs at startup and adds back whatever the cache is missing:
//! a deleted, damaged or brand new `index.db` fills itself again, and moving to another PC brings your
//! whole study history with the vault (DS-01).
//!
//! Nothing is ever taken away and nothing is counted twice:
//!
//! - A review the cache already has, matched on the card and the second it happened, is skipped.
//! - A card only takes the schedule of a replayed review that is newer than its last review, so a review
//!   done in the app is never undone by an older line.
//! - Reading time is put back only for a chapter the cache has no row for at all, so seconds are never
//!   added to a count that is already there. The word count on an older line is not put back: it was the
//!   length of the whole chapter, not the words read (AN-01).
//! - A book that left the vault (no `vault/books/<book-id>/_meta.json`) gets nothing back until it returns (LC-02).

use anyhow::{Context, Result};
use rusqlite::{params, Connection, TransactionBehavior};

use crate::vault::study_log::{self, ReadingLine, ReviewLine};

/// What one run put back.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct RestoreReport {
    pub reviews_added: usize,
    pub cards_rescheduled: usize,
    pub chapters_restored: usize,
    /// Lines in the vault that could not be read. Each one names its file and says why.
    pub damaged_lines: Vec<String>,
}

impl RestoreReport {
    pub fn changed_nothing(&self) -> bool {
        self.reviews_added == 0 && self.cards_rescheduled == 0 && self.chapters_restored == 0
    }
}

/// Reads every book's study log and puts back what the cache is missing.
pub fn restore_progress_blocking() -> Result<RestoreReport> {
    let mut conn = super::schema::open_or_create_db()?;
    let books = study_log::books_with_notes()?;
    let mut report = RestoreReport::default();

    for book_id in books {
        // Or every start would put back what the index run takes out again (`removed_books.rs`). The study log stays
        // in the vault, so it comes back with the book.
        if !crate::vault::book_is_in_vault(&book_id)? {
            continue;
        }
        let log = study_log::read_book_log(&book_id)
            .with_context(|| format!("Failed to read the study log of '{book_id}'"))?;
        report.damaged_lines.extend(log.damaged);
        restore_book(&mut conn, &log.reviews, &log.reading, &mut report)
            .with_context(|| format!("Failed to put back the study progress of '{book_id}'"))?;
    }

    Ok(report)
}

fn restore_book(
    conn: &mut Connection,
    reviews: &[ReviewLine],
    reading: &[ReadingLine],
    report: &mut RestoreReport,
) -> Result<()> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    add_missing_reviews(&tx, reviews, report)?;
    add_missing_reading(&tx, reading, report)?;
    tx.commit()?;
    Ok(())
}

/// Adds review rows the cache does not have, and gives each card the standing of its newest line.
fn add_missing_reviews(tx: &rusqlite::Transaction, reviews: &[ReviewLine], report: &mut RestoreReport) -> Result<()> {
    for review in reviews {
        let Some(rating) = review.rating else {
            // A line that only says where a card stands is not a review. It sets the card below.
            continue;
        };
        let already: i64 = tx.query_row(
            "SELECT COUNT(*) FROM review_logs WHERE card_id = ?1 AND reviewed_at = ?2",
            params![review.card_id, review.reviewed_at],
            |row| row.get(0),
        )?;
        if already > 0 {
            continue;
        }
        tx.execute(
            "INSERT INTO review_logs (card_id, book_id, rating, reviewed_at) VALUES (?1, ?2, ?3, ?4)",
            params![review.card_id, review.book_id, rating as i64, review.reviewed_at],
        )?;
        report.reviews_added += 1;
    }

    // The newest standing of each card, so a card is written once however many lines it has.
    let mut newest: std::collections::HashMap<&str, &ReviewLine> = std::collections::HashMap::new();
    for review in reviews.iter().filter(|line| line.schedule.is_some()) {
        let keep = newest
            .get(review.card_id.as_str())
            .is_none_or(|known| review.reviewed_at > known.reviewed_at);
        if keep {
            newest.insert(&review.card_id, review);
        }
    }

    for review in newest.into_values() {
        let standing = review.schedule.as_ref().expect("filtered above");
        // `last_review < ?5` keeps a review done in the app: only an older standing is written over.
        // A card that is not in the deck any more has no row to write. Its review history is back, which
        // is what the heatmap and the totals are built from.
        let changed = tx.execute(
            "UPDATE fsrs_cards SET
                state = ?1,
                stability = ?2,
                difficulty = ?3,
                due = ?4,
                last_review = ?5,
                reps = ?6
             WHERE card_id = ?7 AND last_review < ?5",
            params![
                standing.state,
                standing.stability,
                standing.difficulty,
                standing.due,
                review.reviewed_at,
                standing.reps,
                review.card_id,
            ],
        )?;
        report.cards_rescheduled += changed;
    }

    Ok(())
}

/// Builds a `reading_sessions` row for every chapter the cache has none for.
fn add_missing_reading(tx: &rusqlite::Transaction, reading: &[ReadingLine], report: &mut RestoreReport) -> Result<()> {
    let mut chapters: Vec<(&str, &str)> = reading
        .iter()
        .map(|line| (line.book_id.as_str(), line.chapter_file.as_str()))
        .collect();
    chapters.sort_unstable();
    chapters.dedup();

    for (book_id, chapter_file) in chapters {
        let already: i64 = tx.query_row(
            "SELECT COUNT(*) FROM reading_sessions WHERE book_id = ?1 AND chapter_file = ?2",
            params![book_id, chapter_file],
            |row| row.get(0),
        )?;
        if already > 0 {
            continue;
        }

        let lines = reading
            .iter()
            .filter(|line| line.book_id == book_id && line.chapter_file == chapter_file);
        let mut seconds = 0i64;
        let mut completed = false;
        let mut last_read_at = 0i64;
        for line in lines {
            seconds += line.seconds_spent;
            completed |= line.completed;
            last_read_at = last_read_at.max(line.read_at);
        }

        tx.execute(
            "INSERT INTO reading_sessions (book_id, chapter_file, seconds_spent, completed, last_read_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![book_id, chapter_file, seconds, i64::from(completed), last_read_at],
        )?;
        report.chapters_restored += 1;
    }

    Ok(())
}
