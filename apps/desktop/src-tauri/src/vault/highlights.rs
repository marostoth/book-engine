//! Chapter highlights, stored in their own file `vault/notes/<book-id>/<chapter>-highlights.json`.
//!
//! Highlights used to live in an HTML comment inside the chapter notes Markdown. Two parts of the
//! app then wrote that one file: the notes pane saved the text it had loaded, and a new highlight
//! was added to the file that was on the disk. Whichever saved last erased the other's work, so a
//! keystroke in the notes pane made a new highlight disappear (DS-05).
//!
//! Now each file has one writer. The notes Markdown holds only what the reader writes, and this
//! module owns the highlights file. A chapter that still keeps its highlights in the old comment
//! is moved over the first time it is read, and the reader's own text is left alone.

use anyhow::{Context, Result};

use super::json_store::read_json_file;
use super::models::HighlightItem;
use super::reader::{find_vault_root, write_notes_file};
use super::safe_write::write_file;
use std::path::PathBuf;

const COMMENT_START: &str = "<!-- highlights-json";
const COMMENT_END: &str = "-->";

/// `vault/notes/<book-id>/<chapter>-highlights.json` for a chapter file such as `ch-01.md`.
fn highlights_path(book_id: &str, chapter_file: &str) -> Result<PathBuf> {
    let vault = find_vault_root()?;
    let stem = chapter_file.strip_suffix(".md").unwrap_or(chapter_file);
    Ok(vault.join("notes").join(book_id).join(format!("{stem}-highlights.json")))
}

/// `<chapter>-notes.md` for a chapter file such as `ch-01.md`.
fn notes_file_name(chapter_file: &str) -> String {
    let stem = chapter_file.strip_suffix(".md").unwrap_or(chapter_file);
    format!("{stem}-notes.md")
}

/// Reads the highlights of a chapter without changing anything on the disk.
///
/// It reads the highlights file when there is one, and otherwise the old comment in the chapter
/// notes. A chapter with neither has no highlights.
pub fn read_chapter_highlights(book_id: &str, chapter_file: &str) -> Result<Vec<HighlightItem>> {
    if let Some(saved) = read_json_file(&highlights_path(book_id, chapter_file)?)? {
        return Ok(saved);
    }
    Ok(read_old_comment(book_id, chapter_file)?.unwrap_or_default())
}

/// Reads the highlights of a chapter, moving them out of the old notes comment when they are
/// still there. The reader's own text in the notes file is kept.
pub fn load_chapter_highlights(book_id: &str, chapter_file: &str) -> Result<Vec<HighlightItem>> {
    let path = highlights_path(book_id, chapter_file)?;
    if let Some(saved) = read_json_file(&path)? {
        return Ok(saved);
    }

    let Some(old) = read_old_comment(book_id, chapter_file)? else {
        return Ok(Vec::new());
    };

    // Write the highlights first. If the notes clean-up then fails, nothing is lost: the
    // highlights are in their own file and the notes file still holds the old comment.
    write_highlights(&path, &old)?;
    let notes = super::reader::read_notes_file(book_id, &notes_file_name(chapter_file))?;
    write_notes_file(book_id, &notes_file_name(chapter_file), &without_highlights_section(&notes, &old))?;
    Ok(old)
}

/// Saves the highlights of a chapter. A damaged highlights file stops the save (DS-04).
pub fn save_chapter_highlights(
    book_id: &str,
    chapter_file: &str,
    highlights: Vec<HighlightItem>,
) -> Result<()> {
    let path = highlights_path(book_id, chapter_file)?;
    read_json_file::<Vec<HighlightItem>>(&path)?;
    write_highlights(&path, &highlights)
}

fn write_highlights(path: &std::path::Path, highlights: &[HighlightItem]) -> Result<()> {
    let serialized = serde_json::to_string_pretty(highlights)
        .context("Failed to serialize the highlights to JSON")?;
    write_file(path, &serialized)
}

/// The highlights still stored in the old `<!-- highlights-json ... -->` comment, or `None` when
/// the notes file has no such comment. A comment that cannot be parsed gives an error, so that
/// nothing is moved and nothing is removed (DS-06 keeps the rest).
fn read_old_comment(book_id: &str, chapter_file: &str) -> Result<Option<Vec<HighlightItem>>> {
    let notes_file = notes_file_name(chapter_file);
    let vault = find_vault_root()?;
    if !vault.join("notes").join(book_id).join(&notes_file).exists() {
        return Ok(None);
    }

    let notes = super::reader::read_notes_file(book_id, &notes_file)?;
    let Some(json) = comment_json(&notes) else {
        return Ok(None);
    };

    let parsed: Vec<HighlightItem> = serde_json::from_str(json).with_context(|| {
        format!("The saved highlights in {book_id}/{notes_file} could not be read, so they were left as they are")
    })?;
    Ok(Some(parsed))
}

/// The JSON between `<!-- highlights-json` and the first `-->` after it.
fn comment_json(notes: &str) -> Option<&str> {
    let start = notes.find(COMMENT_START)? + COMMENT_START.len();
    let end = start + notes[start..].find(COMMENT_END)?;
    Some(notes[start..end].trim())
}

/// The notes text without the machine comment and without the quote lines the app wrote for the
/// given highlights. A `## Highlights` heading is removed only when nothing else is left under it,
/// so a heading the reader writes under, and any text of their own, stays.
fn without_highlights_section(notes: &str, moved: &[HighlightItem]) -> String {
    let mut text = notes.to_string();
    if let Some(start) = text.find(COMMENT_START) {
        if let Some(end) = text[start..].find(COMMENT_END) {
            text.replace_range(start..start + end + COMMENT_END.len(), "");
        }
    }

    let quoted: Vec<String> = moved.iter().map(|h| format!("\"{}\"", h.exact)).collect();
    let is_moved_quote = |line: &str| {
        let body = line.trim().trim_start_matches("- ").trim_start_matches('>').trim_start();
        !body.is_empty() && quoted.iter().any(|quote| body.starts_with(quote.as_str()))
    };

    let kept: Vec<&str> = text.lines().filter(|line| !is_moved_quote(line)).collect();
    drop_empty_highlights_heading(&kept).trim_end().to_string() + "\n"
}

/// Joins the lines, dropping a `## Highlights` heading that has nothing but blank lines under it.
fn drop_empty_highlights_heading(lines: &[&str]) -> String {
    let Some(heading) = lines.iter().position(|line| line.trim() == "## Highlights") else {
        return lines.join("\n");
    };
    let section_end = lines[heading + 1..]
        .iter()
        .position(|line| line.trim_start().starts_with("## "))
        .map(|pos| heading + 1 + pos)
        .unwrap_or(lines.len());
    if lines[heading + 1..section_end].iter().any(|line| !line.trim().is_empty()) {
        return lines.join("\n");
    }

    let mut kept: Vec<&str> = lines[..heading].to_vec();
    kept.extend_from_slice(&lines[section_end..]);
    kept.join("\n")
}
