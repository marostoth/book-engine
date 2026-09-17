//! The permanent record of your study, in the vault.
//!
//! Card schedules, review history and reading time used to live only in `index.db`, the cache file in
//! AppData. That file is not in the vault and is not backed up, so deleting it, damaging it, or moving to
//! another PC lost every bit of study progress (DS-01).
//!
//! Every review and every piece of reading time is now written as one line to a file in the vault, next to
//! the book it belongs to:
//!
//! ```text
//! vault/notes/<book-id>/reviews.jsonl    one line per card review
//! vault/notes/<book-id>/reading.jsonl    one line per piece of reading time
//! ```
//!
//! The files are only ever added to. A review line holds the schedule the review produced as well as the
//! rating, so the cache is rebuilt from what the app really did, not from running the schedule again: the
//! FSRS weights have already changed once (LE-01), and a replay must not give a reader different dates
//! than they had.
//!
//! A line is written with one append, which the file system does in one step, so a crash can damage only
//! the line being written. A line that cannot be read is reported and skipped; every other line still
//! counts.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use super::reader::find_vault_root;

const REVIEWS_FILE: &str = "reviews.jsonl";
const READING_FILE: &str = "reading.jsonl";

/// Where a card stood after a review: what the app showed the reader.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CardStanding {
    /// 0 new, 1 learning, 2 review, 3 relearning.
    pub state: u8,
    pub stability: f64,
    pub difficulty: f64,
    /// When the card is due again, in seconds since 1970.
    pub due: i64,
    pub reps: i64,
}

/// One line of a book's review log.
///
/// A review the app made has both a `rating` and a `schedule`. The one-time copy of an older cache
/// (`db/backfill.rs`) writes lines with only one of the two, because that is all the cache knew: the
/// rating and the time of each old review, and the standing of each card at the time of the copy.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewLine {
    pub card_id: String,
    pub book_id: String,
    /// Again 1, Hard 2, Good 3, Easy 4. Missing on a line that only says where a card stood.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rating: Option<u8>,
    pub reviewed_at: i64,
    /// Missing on a line that only records that a review happened.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule: Option<CardStanding>,
}

/// One piece of reading time for one chapter.
///
/// A line written before AN-01 also holds `wordsRead`: the word count of the whole chapter, not the words that were
/// read. It is not read back, and new lines leave it out.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReadingLine {
    pub book_id: String,
    pub chapter_file: String,
    pub seconds_spent: i64,
    pub completed: bool,
    pub read_at: i64,
}

/// What one book's log files hold, and the lines that could not be read.
#[derive(Debug, Default)]
pub struct BookStudyLog {
    pub reviews: Vec<ReviewLine>,
    pub reading: Vec<ReadingLine>,
    /// Lines that could not be read. Each one names its file and says why.
    pub damaged: Vec<String>,
    /// How many of the damaged lines are in `reading.jsonl`. The reading time they hold is not in `reading`.
    pub damaged_reading_lines: usize,
}

fn log_path(book_id: &str, file: &'static str) -> Result<PathBuf> {
    super::paths::notes_file(book_id, file)
}

/// Adds one line to a log file, and makes sure it reached the disk before returning.
fn append_line(path: &PathBuf, line: &str) -> Result<()> {
    let folder = path
        .parent()
        .with_context(|| format!("{} has no folder", path.display()))?;
    std::fs::create_dir_all(folder)
        .with_context(|| format!("Failed to create {}", folder.display()))?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .with_context(|| format!("Failed to open {}", path.display()))?;
    // One write, so a crash cannot mix this line with another one.
    file.write_all(format!("{line}\n").as_bytes())
        .with_context(|| format!("Failed to write to {}", path.display()))?;
    file.sync_all()
        .with_context(|| format!("Failed to flush {} to the disk", path.display()))?;
    Ok(())
}

/// Writes one review to the vault. The review is not saved anywhere else until this works.
pub fn append_review(review: &ReviewLine) -> Result<()> {
    let path = log_path(&review.book_id, REVIEWS_FILE)?;
    let line = serde_json::to_string(review).context("Failed to turn the review into a line")?;
    append_line(&path, &line)
}

/// Writes one piece of reading time to the vault.
pub fn append_reading(reading: &ReadingLine) -> Result<()> {
    let path = log_path(&reading.book_id, READING_FILE)?;
    let line = serde_json::to_string(reading).context("Failed to turn the reading time into a line")?;
    append_line(&path, &line)
}

/// Reads one log file. A missing file holds nothing. A line that cannot be read is collected in `damaged`
/// and skipped, so one bad line never hides the rest.
fn read_lines<T: serde::de::DeserializeOwned>(path: &PathBuf, damaged: &mut Vec<String>) -> Result<Vec<T>> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(path).with_context(|| format!("Failed to read {}", path.display()))?;
    let mut lines = Vec::new();
    for (index, raw) in text.lines().enumerate() {
        if raw.trim().is_empty() {
            continue;
        }
        match serde_json::from_str(raw) {
            Ok(parsed) => lines.push(parsed),
            Err(err) => damaged.push(format!("{} line {}: {}", path.display(), index + 1, err)),
        }
    }
    Ok(lines)
}

/// Reads one book's study log out of the vault.
pub fn read_book_log(book_id: &str) -> Result<BookStudyLog> {
    let mut damaged = Vec::new();
    let reviews = read_lines(&log_path(book_id, REVIEWS_FILE)?, &mut damaged)?;
    let damaged_reviews = damaged.len();
    let reading = read_lines(&log_path(book_id, READING_FILE)?, &mut damaged)?;
    Ok(BookStudyLog {
        reviews,
        reading,
        damaged_reading_lines: damaged.len() - damaged_reviews,
        damaged,
    })
}

/// The books that have a folder under `vault/notes/`, in name order. A folder whose name is no book id, or that is a
/// link, is no book: the app does not read or write it (SEC-03), so it cannot stop a job that reads every book.
pub fn books_with_notes() -> Result<Vec<String>> {
    let notes = find_vault_root()?.join("notes");
    if !notes.exists() {
        return Ok(Vec::new());
    }
    let mut books: Vec<String> = std::fs::read_dir(&notes)
        .with_context(|| format!("Failed to read {}", notes.display()))?
        .filter_map(Result::ok)
        // `file_type` does not follow a link, so a folder that is a link is not a folder here.
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| super::paths::check_book_id(name).is_ok())
        .collect();
    books.sort();
    Ok(books)
}
