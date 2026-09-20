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
//! - A saved schedule whose card has no row yet is counted, not invented. `fsrs_cards` needs the question
//!   and the answer of the card and the log holds neither, and this runs at startup, before any deck is
//!   synced. `deck_sync` makes the row and asks for the schedule then (DS-15).
//! - The reading time of each chapter in the cache is the sum of its lines, so seconds are never added to a
//!   count that is already there. A new import can move the lines to other chapter files (IN-04), and the
//!   cache follows them. The word count on an older line is not put back: it was the length of the whole
//!   chapter, not the words read (AN-01).
//! - When the log may not hold all of a book's reading time (a line is damaged, or the cache counts more
//!   seconds), the cache keeps its rows and only a chapter it has no row for at all is put back.
//! - A book that left the vault (no `vault/books/<book-id>/_meta.json`) gets nothing back until it returns (LC-02).

use std::collections::BTreeMap;

use anyhow::{Context, Result};
use rusqlite::{params, Connection, TransactionBehavior};

use crate::vault::study_log::{self, ReadingLine, ReviewLine};

/// What one run put back.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct RestoreReport {
    pub reviews_added: usize,
    pub cards_rescheduled: usize,
    /// Cards whose saved schedule has no row to go into yet, because the deck has not been synced.
    pub cards_waiting_for_deck: usize,
    /// Chapters whose reading time the cache took from the vault: a row added, set to the sum of its lines, or
    /// removed because no line names its chapter file any more.
    pub chapters_restored: usize,
    /// Lines in the vault that could not be read. Each one names its file and says why.
    pub damaged_lines: Vec<String>,
}

impl RestoreReport {
    pub fn changed_nothing(&self) -> bool {
        self.reviews_added == 0
            && self.cards_rescheduled == 0
            && self.cards_waiting_for_deck == 0
            && self.chapters_restored == 0
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
        let reading = ReadingLog {
            book_id: &book_id,
            lines: &log.reading,
            damaged_lines: log.damaged_reading_lines,
        };
        restore_book(&mut conn, &log.reviews, &reading, &mut report)
            .with_context(|| format!("Failed to put back the study progress of '{book_id}'"))?;
    }

    Ok(report)
}

/// The reading log of one book.
struct ReadingLog<'a> {
    book_id: &'a str,
    lines: &'a [ReadingLine],
    /// Lines of the log that could not be read.
    damaged_lines: usize,
}

fn restore_book(
    conn: &mut Connection,
    reviews: &[ReviewLine],
    reading: &ReadingLog,
    report: &mut RestoreReport,
) -> Result<()> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    add_missing_reviews(&tx, reviews, report)?;
    restore_reading(&tx, reading, report)?;
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

    let applied = apply_saved_standings(tx, reviews)?;
    report.cards_rescheduled += applied.rescheduled;
    report.cards_waiting_for_deck += applied.waiting_for_deck;

    Ok(())
}

/// What one run of `apply_saved_standings` did.
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct StandingsApplied {
    /// Cards whose row took the standing of its newest line.
    pub rescheduled: usize,
    /// Cards with a saved standing and no row to put it in, because their deck is not synced yet (DS-15).
    pub waiting_for_deck: usize,
}

/// Gives each card the standing of its newest line in the log.
///
/// Called twice, and safe both times. The startup restore calls it before any window exists, when a cache
/// that was deleted, damaged or carried from another PC still has no card rows at all; `deck_sync` calls it
/// again after it has made those rows. `last_review < ?5` writes only a standing older than the row's own
/// last review, so a review done in the app is never undone by a replayed line, however often this runs.
///
/// A card with no row is counted, never invented: `fsrs_cards` needs the question, the answer, the chapter
/// and the item type, and a review line holds none of the four. Its review history is back either way,
/// which is what the heatmap and the totals are built from.
pub(crate) fn apply_saved_standings(tx: &rusqlite::Transaction, reviews: &[ReviewLine]) -> Result<StandingsApplied> {
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

    let mut applied = StandingsApplied::default();
    for review in newest.into_values() {
        let standing = review.schedule.as_ref().expect("filtered above");
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
        applied.rescheduled += changed;
        // Nothing changed for two different reasons: the row holds a newer review, or there is no row.
        // Only the second one is a schedule still waiting to come back.
        if changed == 0 && !card_has_a_row(tx, &review.card_id)? {
            applied.waiting_for_deck += 1;
        }
    }

    Ok(applied)
}

/// True when `fsrs_cards` holds a row for this card.
fn card_has_a_row(tx: &rusqlite::Transaction, card_id: &str) -> Result<bool> {
    let rows: i64 = tx.query_row(
        "SELECT COUNT(*) FROM fsrs_cards WHERE card_id = ?1",
        params![card_id],
        |row| row.get(0),
    )?;
    Ok(rows > 0)
}

/// The reading time of one chapter: its seconds, whether it was finished, and when it was read last.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ChapterTime {
    seconds: i64,
    completed: bool,
    last_read_at: i64,
}

/// The sum of the lines of each chapter, by book id and chapter file.
fn sum_by_chapter(lines: &[ReadingLine]) -> BTreeMap<(&str, &str), ChapterTime> {
    let mut sums: BTreeMap<(&str, &str), ChapterTime> = BTreeMap::new();
    for line in lines {
        let sum = sums
            .entry((line.book_id.as_str(), line.chapter_file.as_str()))
            .or_insert(ChapterTime {
                seconds: 0,
                completed: false,
                last_read_at: 0,
            });
        sum.seconds += line.seconds_spent;
        sum.completed |= line.completed;
        sum.last_read_at = sum.last_read_at.max(line.read_at);
    }
    sums
}

/// Makes the reading time of a book in the cache follow its log.
///
/// The log is the record (DS-01), and a new import can move its lines to other chapter files (IN-04). So when the
/// log holds all of the book's reading time, each chapter in the cache gets the sum of its lines, and a chapter that
/// no line names leaves the cache. The log holds all of it when every line can be read, every line names this book,
/// and the lines hold at least as many seconds as the cache. Otherwise the cache can count time that only it knows,
/// so only the chapters it has no row for are added, and nothing is taken away.
fn restore_reading(tx: &rusqlite::Transaction, reading: &ReadingLog, report: &mut RestoreReport) -> Result<()> {
    let sums = sum_by_chapter(reading.lines);
    let cached = cached_reading(tx, reading.book_id)?;
    let log_seconds: i64 = sums.values().map(|time| time.seconds).sum();
    let cache_seconds: i64 = cached.values().map(|time| time.seconds).sum();
    let log_is_whole = reading.damaged_lines == 0
        && sums.keys().all(|(book_id, _)| *book_id == reading.book_id)
        && log_seconds >= cache_seconds;

    if !log_is_whole {
        return add_missing_chapters(tx, &sums, report);
    }

    for chapter_file in cached.keys() {
        if !sums.contains_key(&(reading.book_id, chapter_file.as_str())) {
            tx.execute(
                "DELETE FROM reading_sessions WHERE book_id = ?1 AND chapter_file = ?2",
                params![reading.book_id, chapter_file],
            )?;
            report.chapters_restored += 1;
        }
    }
    for ((book_id, chapter_file), time) in &sums {
        if cached.get(*chapter_file) == Some(time) {
            continue;
        }
        tx.execute(
            "INSERT INTO reading_sessions (book_id, chapter_file, seconds_spent, completed, last_read_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(book_id, chapter_file) DO UPDATE SET
                 seconds_spent = excluded.seconds_spent,
                 completed = excluded.completed,
                 last_read_at = excluded.last_read_at",
            params![
                book_id,
                chapter_file,
                time.seconds,
                i64::from(time.completed),
                time.last_read_at
            ],
        )?;
        report.chapters_restored += 1;
    }
    Ok(())
}

/// The reading time of each chapter of a book that the cache holds, by chapter file.
fn cached_reading(tx: &rusqlite::Transaction, book_id: &str) -> Result<BTreeMap<String, ChapterTime>> {
    let mut statement = tx.prepare(
        "SELECT chapter_file, seconds_spent, completed, last_read_at FROM reading_sessions WHERE book_id = ?1",
    )?;
    let rows = statement.query_map(params![book_id], |row| {
        let completed: i64 = row.get(2)?;
        Ok((
            row.get(0)?,
            ChapterTime {
                seconds: row.get(1)?,
                completed: completed != 0,
                last_read_at: row.get(3)?,
            },
        ))
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Builds a `reading_sessions` row for every chapter the cache has none for.
fn add_missing_chapters(
    tx: &rusqlite::Transaction,
    sums: &BTreeMap<(&str, &str), ChapterTime>,
    report: &mut RestoreReport,
) -> Result<()> {
    for ((book_id, chapter_file), time) in sums {
        let already: i64 = tx.query_row(
            "SELECT COUNT(*) FROM reading_sessions WHERE book_id = ?1 AND chapter_file = ?2",
            params![book_id, chapter_file],
            |row| row.get(0),
        )?;
        if already > 0 {
            continue;
        }

        tx.execute(
            "INSERT INTO reading_sessions (book_id, chapter_file, seconds_spent, completed, last_read_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                book_id,
                chapter_file,
                time.seconds,
                i64::from(time.completed),
                time.last_read_at
            ],
        )?;
        report.chapters_restored += 1;
    }

    Ok(())
}
