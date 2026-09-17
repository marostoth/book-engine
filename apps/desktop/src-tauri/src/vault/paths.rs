//! Paths in the vault that are made from names the app page sends: a book id, a chapter file, a chapter notes file and
//! a topic id (SEC-03).
//!
//! The commands used to join these names into paths as they came. `Path::join` with an absolute path gives that path,
//! and `..` climbs out of a folder, so code in the page could read and write any file on the computer. Now a name must
//! follow a strict rule before it is part of a path, and the path must still be in the vault when the links on the way
//! to it are followed. Every name that the importer or the app makes follows the rule.

use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};

use super::reader::find_vault_root;

/// The most characters that one name in a path can have.
const LONGEST_NAME: usize = 255;

/// The most characters of a refused name that an error message shows.
const SHOWN_CHARACTERS: usize = 80;

/// True for a book id or a topic id: 1 to 255 characters from `a-z`, `0-9`, `-` and `_`, and not `-` first. So it is
/// never `.` or `..`, and it holds no separator, no drive and no other character that a path gives a meaning to. The
/// importer makes book ids from these characters only (`packages/ingestion/ingest/book_id.py` has the same rule), and
/// `topic_id_from_title` makes topic ids the same way.
fn is_simple_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= LONGEST_NAME
        && !name.starts_with('-')
        && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
}

/// True for `ch-`, 2 or more digits and then `ending`, as the importer names chapters: `ch-01.md`, `ch-01-notes.md`.
fn is_chapter_name(name: &str, ending: &str) -> bool {
    name.len() <= LONGEST_NAME
        && name
            .strip_prefix("ch-")
            .and_then(|rest| rest.strip_suffix(ending))
            .is_some_and(|number| number.len() >= 2 && number.bytes().all(|b| b.is_ascii_digit()))
}

/// A refused name for an error message: in quotes, and cut short when it is long.
fn shown(name: &str) -> String {
    let start: String = name.chars().take(SHOWN_CHARACTERS).collect();
    let more = if start.len() < name.len() { "..." } else { "" };
    format!("\"{start}{more}\"")
}

/// Refuses a book id that does not follow the rule of `is_simple_name`.
pub fn check_book_id(book_id: &str) -> Result<()> {
    if is_simple_name(book_id) {
        return Ok(());
    }
    bail!(
        "The book id {} cannot be used. A book id has 1 to 255 characters: a-z, 0-9, - and _, and it does not start \
         with -.",
        shown(book_id)
    )
}

/// Refuses a topic id that does not follow the rule of `is_simple_name`.
pub fn check_topic_id(topic_id: &str) -> Result<()> {
    if is_simple_name(topic_id) {
        return Ok(());
    }
    bail!(
        "The topic id {} cannot be used. A topic id has 1 to 255 characters: a-z, 0-9, - and _, and it does not start \
         with -.",
        shown(topic_id)
    )
}

/// Refuses a chapter file name that is not `ch-`, 2 or more digits and `.md`, such as `ch-01.md`.
pub fn check_chapter_file(chapter_file: &str) -> Result<()> {
    if is_chapter_name(chapter_file, ".md") {
        return Ok(());
    }
    bail!(
        "The chapter file {} cannot be used. A chapter file is named ch-, 2 or more digits and .md, such as ch-01.md.",
        shown(chapter_file)
    )
}

/// Refuses a chapter notes file name that is not `ch-`, 2 or more digits and `-notes.md`, such as `ch-01-notes.md`.
pub fn check_notes_file(notes_file: &str) -> Result<()> {
    if is_chapter_name(notes_file, "-notes.md") {
        return Ok(());
    }
    bail!(
        "The notes file {} cannot be used. A notes file is named ch-, 2 or more digits and -notes.md, such as \
         ch-01-notes.md.",
        shown(notes_file)
    )
}

/// `vault/books/<book_id>`.
pub fn book_folder(book_id: &str) -> Result<PathBuf> {
    check_book_id(book_id)?;
    vault_path(&["books", book_id])
}

/// `vault/books/<book_id>/<file>`, for a file whose name the app gives, such as `_meta.json`.
pub fn book_file(book_id: &str, file: &'static str) -> Result<PathBuf> {
    check_book_id(book_id)?;
    vault_path(&["books", book_id, file])
}

/// `vault/books/<book_id>/<chapter_file>`.
pub fn chapter_path(book_id: &str, chapter_file: &str) -> Result<PathBuf> {
    check_book_id(book_id)?;
    check_chapter_file(chapter_file)?;
    vault_path(&["books", book_id, chapter_file])
}

/// `vault/notes/<book_id>`.
pub fn notes_folder(book_id: &str) -> Result<PathBuf> {
    check_book_id(book_id)?;
    vault_path(&["notes", book_id])
}

/// `vault/notes/<book_id>/<file>`, for a file whose name the app gives, such as `bookmark.json`.
pub fn notes_file(book_id: &str, file: &'static str) -> Result<PathBuf> {
    check_book_id(book_id)?;
    vault_path(&["notes", book_id, file])
}

/// `vault/notes/<book_id>/<notes_file>`, for the notes of a chapter, such as `ch-01-notes.md`.
pub fn chapter_notes_path(book_id: &str, notes_file: &str) -> Result<PathBuf> {
    check_book_id(book_id)?;
    check_notes_file(notes_file)?;
    vault_path(&["notes", book_id, notes_file])
}

/// `vault/notes/<book_id>/<chapter>-highlights.json`, for a chapter file such as `ch-01.md`.
pub fn chapter_highlights_path(book_id: &str, chapter_file: &str) -> Result<PathBuf> {
    check_book_id(book_id)?;
    check_chapter_file(chapter_file)?;
    let chapter = chapter_file.trim_end_matches(".md");
    vault_path(&["notes", book_id, &format!("{chapter}-highlights.json")])
}

/// `vault/syntopicon/topics/<topic_id>.json`.
pub fn topic_path(topic_id: &str) -> Result<PathBuf> {
    check_topic_id(topic_id)?;
    vault_path(&["syntopicon", "topics", &format!("{topic_id}.json")])
}

/// `vault/syntopicon/reports/<topic_id>-synthesis.md`.
pub fn topic_report_path(topic_id: &str) -> Result<PathBuf> {
    check_topic_id(topic_id)?;
    vault_path(&["syntopicon", "reports", &format!("{topic_id}-synthesis.md")])
}

/// The vault folder joined with `parts`, in the form the vault was found in. It is refused when it leads out of the
/// vault.
fn vault_path(parts: &[&str]) -> Result<PathBuf> {
    let vault = find_vault_root()?;
    let path = parts.iter().fold(vault.clone(), |path, part| path.join(part));
    check_in_vault(&vault, &path)?;
    Ok(path)
}

/// Refuses a path that leads out of the vault when the links on the way to it are followed: a folder or a file in the
/// vault can be a link to another place. A part of the path that is not there yet cannot be a link, so the check
/// follows the path up to its last part that is there.
fn check_in_vault(vault: &Path, path: &Path) -> Result<()> {
    let real_vault = std::fs::canonicalize(vault)
        .with_context(|| format!("Failed to find the vault folder {}", vault.display()))?;
    let mut there = path;
    let real = loop {
        match std::fs::canonicalize(there) {
            Ok(real) => break real,
            Err(e) if matches!(e.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory) => {
                there = there
                    .parent()
                    .with_context(|| format!("Failed to find a folder of {} that is there", path.display()))?;
            }
            Err(e) => {
                return Err(e).with_context(|| format!("Failed to check where {} leads", path.display()));
            }
        }
    };
    if !real.starts_with(&real_vault) {
        bail!("{} leads out of the vault through a link, so the app does not use it.", path.display());
    }
    Ok(())
}
