//! Copies the study progress an older cache already holds into the vault, once.
//!
//! Before DS-01 every review, card schedule and piece of reading time was written only to `index.db`.
//! Writing new activity to the vault does not protect what is already there, so at the first startup
//! after the change the cache is copied into the vault. A reader who had studied for months keeps that
//! work even if the cache is lost the next day.
//!
//! It runs on every startup and writes only what the vault does not have, so it costs nothing after the
//! first time. It never changes the cache and never removes a line.
//!
//! The cache does not know as much as a review line does. It has the rating and the time of each old
//! review, but not the schedule each one produced, and it has the standing of each card now, but not
//! which review made it. So the copy writes two kinds of line:
//!
//! - one line per old review, with a rating and no schedule: the history for the heatmap and the totals;
//! - one line per card that has been studied, with a schedule and no rating, at the time of its last
//!   review: where the card stands.

use anyhow::{Context, Result};
use rusqlite::{params, Connection};

use crate::vault::study_log::{self, CardStanding, ReadingLine, ReviewLine};

/// What one run copied into the vault.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct BackfillReport {
    pub reviews_written: usize,
    pub cards_written: usize,
    pub chapters_written: usize,
}

impl BackfillReport {
    pub fn changed_nothing(&self) -> bool {
        self.reviews_written == 0 && self.cards_written == 0 && self.chapters_written == 0
    }
}

/// Copies whatever the cache holds and the vault does not.
pub fn backfill_vault_blocking() -> Result<BackfillReport> {
    let conn = super::schema::open_or_create_db()?;
    let mut report = BackfillReport::default();

    for book_id in study_log::books_with_notes()? {
        let log = study_log::read_book_log(&book_id)
            .with_context(|| format!("Failed to read the study log of '{book_id}'"))?;
        copy_reviews(&conn, &book_id, &log.reviews, &mut report)
            .with_context(|| format!("Failed to copy the reviews of '{book_id}' into the vault"))?;
        copy_cards(&conn, &book_id, &log.reviews, &mut report)
            .with_context(|| format!("Failed to copy the cards of '{book_id}' into the vault"))?;
        copy_reading(&conn, &book_id, &log.reading, &mut report)
            .with_context(|| format!("Failed to copy the reading time of '{book_id}' into the vault"))?;
    }

    Ok(report)
}

/// Writes every review row the vault has no line for.
fn copy_reviews(conn: &Connection, book_id: &str, have: &[ReviewLine], report: &mut BackfillReport) -> Result<()> {
    let known: std::collections::HashSet<(&str, i64)> = have
        .iter()
        .filter(|line| line.rating.is_some())
        .map(|line| (line.card_id.as_str(), line.reviewed_at))
        .collect();

    let mut stmt = conn.prepare(
        "SELECT card_id, rating, reviewed_at FROM review_logs WHERE book_id = ?1 ORDER BY reviewed_at, id",
    )?;
    let rows: Vec<(String, i64, i64)> = stmt
        .query_map(params![book_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<rusqlite::Result<_>>()?;

    for (card_id, rating, reviewed_at) in rows {
        if known.contains(&(card_id.as_str(), reviewed_at)) {
            continue;
        }
        study_log::append_review(&ReviewLine {
            card_id,
            book_id: book_id.to_string(),
            rating: Some(rating as u8),
            reviewed_at,
            schedule: None,
        })?;
        report.reviews_written += 1;
    }

    Ok(())
}

/// Writes where every studied card stands, for cards the vault has no standing for.
fn copy_cards(conn: &Connection, book_id: &str, have: &[ReviewLine], report: &mut BackfillReport) -> Result<()> {
    let known: std::collections::HashSet<(&str, i64)> = have
        .iter()
        .filter(|line| line.schedule.is_some())
        .map(|line| (line.card_id.as_str(), line.reviewed_at))
        .collect();

    let mut stmt = conn.prepare(
        "SELECT card_id, state, stability, difficulty, due, last_review, reps
         FROM fsrs_cards WHERE book_id = ?1 AND reps > 0 ORDER BY card_id",
    )?;
    let rows: Vec<(String, u8, f64, f64, i64, i64, i64)> = stmt
        .query_map(params![book_id], |row| {
            Ok((
                row.get(0)?,
                row.get::<_, i64>(1)? as u8,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;

    for (card_id, state, stability, difficulty, due, last_review, reps) in rows {
        if known.contains(&(card_id.as_str(), last_review)) {
            continue;
        }
        study_log::append_review(&ReviewLine {
            card_id,
            book_id: book_id.to_string(),
            rating: None,
            reviewed_at: last_review,
            schedule: Some(CardStanding {
                state,
                stability,
                difficulty,
                due,
                reps,
            }),
        })?;
        report.cards_written += 1;
    }

    Ok(())
}

/// Writes the reading time of every chapter the vault has no line for.
fn copy_reading(conn: &Connection, book_id: &str, have: &[ReadingLine], report: &mut BackfillReport) -> Result<()> {
    let known: std::collections::HashSet<&str> = have.iter().map(|line| line.chapter_file.as_str()).collect();

    let mut stmt = conn.prepare(
        "SELECT chapter_file, seconds_spent, words_read, completed, last_read_at
         FROM reading_sessions WHERE book_id = ?1 ORDER BY chapter_file",
    )?;
    let rows: Vec<(String, i64, i64, i64, i64)> = stmt
        .query_map(params![book_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
        })?
        .collect::<rusqlite::Result<_>>()?;

    for (chapter_file, seconds_spent, words_read, completed, last_read_at) in rows {
        if known.contains(chapter_file.as_str()) {
            continue;
        }
        study_log::append_reading(&ReadingLine {
            book_id: book_id.to_string(),
            chapter_file,
            seconds_spent,
            words_read,
            completed: completed != 0,
            read_at: last_read_at,
        })?;
        report.chapters_written += 1;
    }

    Ok(())
}
