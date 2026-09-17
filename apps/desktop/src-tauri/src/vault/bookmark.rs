//! Where you stopped reading, kept in the vault: one small file per book, `vault/notes/<book-id>/bookmark.json`.
//!
//! The app used to open chapter 1 of every book it loaded, and it kept the open book only in the browser
//! storage of the app window. A release build, a new PC or a reinstall has its own browser storage, so the
//! place was gone (DS-11). The bookmark sits next to the book's notes, so it goes wherever the vault goes.
//!
//! The newest bookmark of all books names the book the app opens with, so no second file can disagree with it.

use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

use super::json_store::read_json_file;
use super::safe_write::write_file;
use super::study_log::books_with_notes;

/// The name of a bookmark file, in `vault/notes/<book-id>/`.
pub const BOOKMARK_FILE: &str = "bookmark.json";

/// Where the reader stopped in one book.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
    /// The chapter file, such as `ch-03.md`.
    pub chapter_file: String,
    /// The paragraph in the middle of the screen, in the saved form `^p-012`. None when no paragraph was on screen.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<String>,
    /// When the bookmark was saved, in UTC (RFC 3339).
    pub saved_at: String,
}

/// A bookmark and the book it belongs to.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookBookmark {
    pub book_id: String,
    #[serde(flatten)]
    pub bookmark: Bookmark,
}

fn bookmark_path(book_id: &str) -> Result<PathBuf> {
    super::paths::notes_file(book_id, BOOKMARK_FILE)
}

/// The bookmark of a book, or `None` when the reader has not read it yet. A damaged file gives an error and
/// is copied, never read as no bookmark (DS-04).
pub fn load_bookmark(book_id: &str) -> Result<Option<Bookmark>> {
    read_json_file(&bookmark_path(book_id)?)
}

/// Saves where the reader is in a book. A damaged bookmark file is kept as it is and stops the save.
pub fn save_bookmark(book_id: &str, chapter_file: &str, anchor: Option<&str>) -> Result<Bookmark> {
    if chapter_file.trim().is_empty() {
        return Err(anyhow!("A bookmark needs a chapter file."));
    }
    let path = bookmark_path(book_id)?;
    read_json_file::<Bookmark>(&path)?;

    let bookmark = Bookmark {
        chapter_file: chapter_file.to_string(),
        anchor: anchor.map(str::trim).filter(|a| !a.is_empty()).map(str::to_string),
        saved_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
    };
    let text = serde_json::to_string_pretty(&bookmark).context("Failed to write the bookmark as JSON")?;
    write_file(&path, text)?;
    Ok(bookmark)
}

/// The newest bookmark of all books, which names the book the app opens with. A bookmark that cannot be read
/// is passed over here; that book reports it when it opens.
pub fn last_bookmark() -> Result<Option<BookBookmark>> {
    let mut newest: Option<(DateTime<Utc>, BookBookmark)> = None;
    for book_id in books_with_notes()? {
        let bookmark = match load_bookmark(&book_id) {
            Ok(Some(bookmark)) => bookmark,
            Ok(None) => continue,
            Err(err) => {
                eprintln!("Warning: the bookmark of {book_id} was passed over: {err:#}");
                continue;
            }
        };
        let Ok(saved_at) = DateTime::parse_from_rfc3339(&bookmark.saved_at) else {
            eprintln!("Warning: the bookmark of {book_id} has no time that can be read, so it was passed over.");
            continue;
        };
        let saved_at = saved_at.with_timezone(&Utc);
        if newest.as_ref().is_none_or(|(best, _)| saved_at > *best) {
            newest = Some((saved_at, BookBookmark { book_id, bookmark }));
        }
    }
    Ok(newest.map(|(_, found)| found))
}
