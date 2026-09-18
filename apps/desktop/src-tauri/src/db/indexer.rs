use std::collections::{HashMap, HashSet};
use std::io::ErrorKind;
use std::path::Path;
use std::sync::{Mutex, PoisonError};

use anyhow::{Context, Result};
use rusqlite::{params, Connection, TransactionBehavior};
use crate::vault::text_file::read_text_file;
use crate::vault::{book_id_of, find_vault_root};
use super::models::{IndexProblem, IndexSummary, RenamedBook, SearchResult};
use super::removed_books::set_aside_removed_books;
use super::schema::open_or_create_db;
use super::search_query::fts5_match_expression;
use super::search_text::{search_text, HIT_END, HIT_START};

/// One index run at a time. A run that read the vault before an import could otherwise remove the rows that a newer
/// run has just written for the new book.
static INDEX_RUN: Mutex<()> = Mutex::new(());

/// The form of the search rows that `index_chapter` writes. It is part of the hash of every indexed chapter, so a
/// chapter whose rows have another form is read again at the next run, even when its file did not change.
///
/// Form 2 (SEC-01): the rows hold `search_text` of each paragraph. Before, the rows held each paragraph as the chapter
/// file has it, with its HTML, and the hash held only the text of the file.
const SEARCH_ROWS_FORM: u32 = 2;

/// The search rows of a book that stay after an index run.
enum RowsToKeep {
    /// `_meta.json` could not be read, so the run does not know the chapters of the book: every row stays.
    All,
    /// The chapters that `_meta.json` lists now, except a chapter whose file is missing.
    Chapters(HashSet<String>),
}

/// Brings the FTS5 search index up to date with vault/books/.
///
/// Each book is read and written in a transaction of its own, so a broken book or chapter never stops the other books
/// (SI-02). A file that cannot be read is left out and named in `IndexSummary::problems`, and its book or chapter keeps
/// the rows that search read last: a file in OneDrive can be locked or offline for a moment. The rows of a book or a
/// chapter that is no longer in the vault are removed.
///
/// A book is known by its folder name, as the library knows it (LC-02). The study rows of a book that left the vault
/// leave the cache too (`removed_books.rs`), and a book folder that was renamed is named in `renamed_books`.
pub fn index_vault_blocking() -> Result<IndexSummary> {
    let _one_run = INDEX_RUN.lock().unwrap_or_else(PoisonError::into_inner);
    let start_time = std::time::Instant::now();
    let mut conn = open_or_create_db()?;
    let vault = find_vault_root()?;
    let books_dir = vault.join("books");
    let mut summary = IndexSummary::default();

    // Every book folder with a `_meta.json`, and the rows of that book that stay.
    let mut books = HashMap::new();
    // False when an entry of the books folder could not be read: a book that the run did not see can still be there.
    let mut saw_every_book = true;
    // The book folders whose `_meta.json` names another book: (folder, the name in `_meta.json`).
    let mut other_names = Vec::new();

    let listing = match std::fs::read_dir(&books_dir) {
        Ok(listing) => Some(listing),
        // A vault with no books folder has no books.
        Err(e) if e.kind() == ErrorKind::NotFound => None,
        Err(e) => return Err(e).with_context(|| format!("Failed to read {}", books_dir.display())),
    };
    let books_folder_is_there = listing.is_some();
    for entry in listing.into_iter().flatten() {
        let book_path = match entry {
            Ok(entry) => entry.path(),
            Err(e) => {
                saw_every_book = false;
                summary.problems.push(problem("books".to_string(), format!("has a folder that could not be read ({e})")));
                continue;
            }
        };
        if !book_path.is_dir() {
            continue;
        }

        let Some(book_id) = book_id_of(&book_path) else {
            // The library does not list it either: no file read could find the folder by that name.
            continue;
        };
        let rows_to_keep = match std::fs::read_to_string(book_path.join("_meta.json")) {
            Ok(meta) => {
                if let Some(name) = book_id_in_meta(&meta).filter(|name| *name != book_id) {
                    other_names.push((book_id.clone(), name));
                }
                index_book(&mut conn, &book_path, &book_id, &meta, &mut summary)?
            }
            // Not a book, or an import that has not written `_meta.json` yet. The library does not list it either.
            Err(e) if e.kind() == ErrorKind::NotFound => continue,
            Err(e) => {
                summary.problems.push(problem(format!("books/{book_id}/_meta.json"), unreadable(&e)));
                RowsToKeep::All
            }
        };
        books.insert(book_id, rows_to_keep);
    }

    remove_rows_that_left_the_vault(&mut conn, &books, saw_every_book)?;
    // Study progress is not rebuilt from the book files as search is, so it leaves the cache only when the run saw the
    // whole books folder. A books folder that is missing is a problem with the vault, not a sign that every book left.
    if books_folder_is_there && saw_every_book {
        let in_vault: HashSet<String> = books.keys().cloned().collect();
        set_aside_removed_books(&mut conn, &in_vault)?;
    }
    summary.renamed_books = renamed_books(&vault, &books, other_names);

    summary.problems.sort_by(|a, b| a.file.cmp(&b.file));
    summary.duration_ms = start_time.elapsed().as_millis();
    Ok(summary)
}

/// Reads the chapters that the `_meta.json` text `meta` lists, and writes the rows of every new or changed chapter in one
/// transaction for the book. Gives the rows of the book that stay. A file that cannot be used goes to `summary.problems`.
fn index_book(
    conn: &mut Connection,
    book_path: &Path,
    book_id: &str,
    meta: &str,
    summary: &mut IndexSummary,
) -> Result<RowsToKeep> {
    let meta_file = format!("books/{book_id}/_meta.json");
    let chapters = match chapter_list(meta) {
        Ok(chapters) => chapters,
        Err(reason) => {
            summary.problems.push(problem(meta_file, reason));
            return Ok(RowsToKeep::All);
        }
    };

    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let mut kept = HashSet::new();
    for (index, chapter) in chapters.iter().enumerate() {
        let (Some(ch_id), Some(ch_file)) = (text_field(chapter, "id"), text_field(chapter, "file_path")) else {
            summary.problems.push(problem(
                meta_file.clone(),
                format!("lists a chapter with no \"id\" or no \"file_path\" (number {} in \"spine\")", index + 1),
            ));
            continue;
        };
        let ch_title = chapter["title"].as_str().unwrap_or("");

        // With `\n` line endings only, so search finds the paragraphs that the reader shows (IN-06)
        let content = match read_text_file(&book_path.join(ch_file)) {
            Ok(content) => content,
            Err(e) => {
                let missing = e.kind() == ErrorKind::NotFound;
                if !missing {
                    // The rows keep the text that search read last.
                    kept.insert(ch_id.to_string());
                }
                let reason = if missing { "is missing, but _meta.json lists it".to_string() } else { unreadable(&e) };
                summary.problems.push(problem(format!("books/{book_id}/{ch_file}"), reason));
                continue;
            }
        };
        kept.insert(ch_id.to_string());

        if let Some(paragraphs) = index_chapter(&tx, book_id, ch_id, ch_title, ch_file, &content)? {
            summary.chapters_indexed += 1;
            summary.paragraphs_indexed += paragraphs;
        }
    }
    tx.commit()?;
    Ok(RowsToKeep::Chapters(kept))
}

/// Writes the search rows of one chapter, unless its rows already hold this text. Gives the number of paragraphs
/// written, or None when the chapter was up to date.
fn index_chapter(
    conn: &Connection,
    book_id: &str,
    ch_id: &str,
    ch_title: &str,
    ch_file: &str,
    content: &str,
) -> Result<Option<usize>> {
    // Simple hash to detect updates. It holds the form of the rows too, so rows of an older form are written again.
    let content_hash = format!("{:x}", md5_hash(&format!("{SEARCH_ROWS_FORM}\n{content}")));

    // Check if already indexed with same hash and has indexed rows
    let mut check_stmt = conn.prepare_cached(
        "SELECT content_hash FROM indexed_chapters WHERE book_id = ? AND chapter_id = ?"
    )?;
    let existing_hash: Option<String> = check_stmt
        .query_row(params![book_id, ch_id], |row| row.get(0))
        .ok();

    let existing_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM search_index WHERE book_id = ? AND chapter_id = ?",
        params![book_id, ch_id],
        |row| row.get(0),
    ).unwrap_or(0);

    if let Some(ref h) = existing_hash {
        if h == &content_hash && existing_count > 0 {
            // Already up to date
            return Ok(None);
        }
    }

    // Delete old FTS5 rows for this chapter if re-indexing
    conn.execute(
        "DELETE FROM search_index WHERE book_id = ? AND chapter_id = ?",
        params![book_id, ch_id]
    )?;

    // Parse paragraphs and anchors
    let mut paragraphs = 0;
    for block in content.split("\n\n") {
        let trimmed = block.trim();
        // Only a heading is left out. A paragraph that starts with a `#` and a word, such as "#1 rule"
        // or a hashtag, is text of the book, and search used to leave it out (IN-08).
        if trimmed.is_empty() || super::chapter_blocks::is_heading(trimmed) {
            continue;
        }

        // Extract anchor: ^p-xxx
        let mut anchor = String::new();
        let mut para_text = trimmed.to_string();

        if let Some(pos) = trimmed.rfind("^p-") {
            anchor = trimmed[pos..].trim().to_string();
            para_text = trimmed[..pos].trim().to_string();
        }

        // Search keeps the words of the paragraph as plain text, never its HTML (SEC-01).
        let para_text = search_text(&para_text);
        let para_text = para_text.trim();
        if para_text.is_empty() {
            continue;
        }

        // Insert into search_index
        conn.execute(
            "INSERT INTO search_index (book_id, chapter_id, chapter_title, chapter_file, anchor, content)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![book_id, ch_id, ch_title, ch_file, &anchor, para_text]
        )?;
        paragraphs += 1;
    }

    // Record indexed chapter
    conn.execute(
        "INSERT INTO indexed_chapters (book_id, chapter_id, file_path, title, content_hash)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(book_id, chapter_id) DO UPDATE SET
             title = excluded.title,
             file_path = excluded.file_path,
             content_hash = excluded.content_hash,
             indexed_at = CURRENT_TIMESTAMP",
        params![book_id, ch_id, ch_file, ch_title, &content_hash]
    )?;

    Ok(Some(paragraphs))
}

/// Removes the rows of the books and chapters that left the vault. `books` holds every book folder with a `_meta.json`
/// that the run saw. When `saw_every_book` is false, a book that is not in `books` can still be there, so its rows stay.
fn remove_rows_that_left_the_vault(
    conn: &mut Connection,
    books: &HashMap<String, RowsToKeep>,
    saw_every_book: bool,
) -> Result<()> {
    let indexed: Vec<(String, String)> = {
        let mut statement = conn.prepare(
            "SELECT book_id, chapter_id FROM indexed_chapters UNION SELECT book_id, chapter_id FROM search_index",
        )?;
        let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        rows.collect::<rusqlite::Result<_>>()?
    };
    let left: Vec<(String, String)> = indexed
        .into_iter()
        .filter(|(book_id, chapter_id)| match books.get(book_id) {
            None => saw_every_book,
            Some(RowsToKeep::All) => false,
            Some(RowsToKeep::Chapters(kept)) => !kept.contains(chapter_id),
        })
        .collect();
    if left.is_empty() {
        return Ok(());
    }

    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    for (book_id, chapter_id) in &left {
        tx.execute("DELETE FROM search_index WHERE book_id = ? AND chapter_id = ?", params![book_id, chapter_id])?;
        tx.execute("DELETE FROM indexed_chapters WHERE book_id = ? AND chapter_id = ?", params![book_id, chapter_id])?;
    }
    tx.commit()?;
    Ok(())
}

/// The folders whose `_meta.json` names a book that has notes in the vault and no folder: a book folder that was
/// renamed. The notes and study progress under the old name do not show, because a book is known by its folder name.
/// A folder whose `_meta.json` names a book that is still there is a copy, and its notes are in use.
fn renamed_books(
    vault: &Path,
    books: &HashMap<String, RowsToKeep>,
    other_names: Vec<(String, String)>,
) -> Vec<RenamedBook> {
    let mut renamed: Vec<RenamedBook> = other_names
        .into_iter()
        .filter(|(_, old_name)| !books.contains_key(old_name) && vault.join("notes").join(old_name).is_dir())
        .map(|(folder, old_name)| RenamedBook { folder, old_name })
        .collect();
    renamed.sort_by(|a, b| a.folder.cmp(&b.folder));
    renamed
}

/// The `book_id` that a `_meta.json` text records, when it is a name that one folder can have.
fn book_id_in_meta(meta: &str) -> Option<String> {
    let meta: serde_json::Value = serde_json::from_str(meta).ok()?;
    let name = meta.get("book_id")?.as_str()?;
    let mut parts = Path::new(name).components();
    match (parts.next(), parts.next()) {
        (Some(std::path::Component::Normal(_)), None) => Some(name.to_string()),
        _ => None,
    }
}

/// The chapter list ("spine") of a `_meta.json` text, or why the text has none.
fn chapter_list(meta: &str) -> std::result::Result<Vec<serde_json::Value>, String> {
    let mut meta: serde_json::Value = serde_json::from_str(meta).map_err(|e| format!("is not valid JSON ({e})"))?;
    match meta.get_mut("spine").map(serde_json::Value::take) {
        Some(serde_json::Value::Array(chapters)) => Ok(chapters),
        _ => Err("has no chapter list (\"spine\")".to_string()),
    }
}

/// A text field of a chapter in the spine, or None when it is missing or empty.
fn text_field<'a>(chapter: &'a serde_json::Value, name: &str) -> Option<&'a str> {
    chapter[name].as_str().filter(|text| !text.is_empty())
}

/// Why a file could not be read, in words that follow the file name.
fn unreadable(error: &std::io::Error) -> String {
    if error.kind() == ErrorKind::InvalidData {
        "is not UTF-8 text".to_string()
    } else {
        format!("could not be read ({error})")
    }
}

fn problem(file: String, reason: impl Into<String>) -> IndexProblem {
    IndexProblem { file, reason: reason.into() }
}

/// Executes an FTS5 search query. Each snippet is plain text with `HIT_START` and `HIT_END` around each hit, and the
/// window shows it as text (SEC-01). `search_query::fts5_match_expression` turns the typed search into the MATCH
/// expression.
pub fn search_vault_blocking(raw_query: &str) -> Result<Vec<SearchResult>> {
    let Some(match_expression) = fts5_match_expression(raw_query) else {
        return Ok(Vec::new());
    };

    let conn = open_or_create_db()?;

    let mut stmt = conn.prepare_cached(
        "SELECT
             book_id,
             chapter_id,
             chapter_title,
             chapter_file,
             anchor,
             snippet(search_index, 5, ?2, ?3, '...', 18) AS snippet_text,
             bm25(search_index) AS rank
         FROM search_index
         WHERE search_index MATCH ?1
         ORDER BY rank
         LIMIT 30;"
    )?;

    let rows = stmt.query_map(params![match_expression, HIT_START.to_string(), HIT_END.to_string()], |row| {
        Ok(SearchResult {
            book_id: row.get(0)?,
            chapter_id: row.get(1)?,
            chapter_title: row.get(2)?,
            chapter_file: row.get(3)?,
            anchor: row.get(4)?,
            snippet: row.get(5)?,
            rank: row.get(6)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }

    Ok(results)
}

pub fn md5_hash(text: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut hasher);
    hasher.finish()
}
