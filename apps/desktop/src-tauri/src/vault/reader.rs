use super::file_is_there::file_is_there;
use super::models::{AppError, BookMetadata, BookSummary};
use super::text_file::read_text_file;
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

/// Test builds only resolve the vault inside the active `test_support::Sandbox`.
#[cfg(test)]
pub fn find_vault_root() -> Result<PathBuf> {
    crate::test_support::vault_root()
}

/// The absolute path of the Markdown vault. `vault/locate.rs` says where it looks and in what order.
#[cfg(not(test))]
pub fn find_vault_root() -> Result<PathBuf> {
    match super::locate::locate_vault() {
        Some((folder, _)) => Ok(folder),
        None => anyhow::bail!("{}", super::locate::not_found_message()),
    }
}

/// Reads a chapter file from vault/books/<book-id>/<file-name>, with `\n` line endings only, so the reader finds its
/// paragraphs and footnotes (IN-06). The page sends both names, so they are checked first (`vault/paths.rs`, SEC-03).
pub fn read_chapter_file(book_id: &str, file_name: &str) -> Result<String> {
    let path = super::paths::chapter_path(book_id, file_name)?;
    read_text_file(&path).with_context(|| format!("Failed to read chapter file: {}", path.display()))
}

/// Reads the _meta.json file for a book. The importer makes this file, so the app only reads it: the reader's own
/// answers are kept in `vault/notes/<book-id>/` (DS-09).
pub fn read_book_meta_json(book_id: &str) -> Result<String> {
    let path = super::paths::book_file(book_id, "_meta.json")?;
    std::fs::read_to_string(&path).with_context(|| format!("Failed to read _meta.json: {}", path.display()))
}

/// Retrieves the inspectional blueprint for a given book_id, synthesizing a resilient fallback if absent.
pub fn get_inspectional_blueprint(book_id: &str) -> Result<crate::vault::InspectionalBlueprint> {
    let meta_json_str = read_book_meta_json(book_id)?;
    let val: serde_json::Value =
        serde_json::from_str(&meta_json_str).with_context(|| format!("Failed to parse _meta.json for {book_id}"))?;

    if let Some(bp_val) = val.get("inspectional_blueprint") {
        if !bp_val.is_null() {
            if let Ok(bp) = serde_json::from_value::<crate::vault::InspectionalBlueprint>(bp_val.clone()) {
                return Ok(bp);
            }
        }
    }

    let title = val["title"].as_str().unwrap_or("Untitled").to_string();
    let author = val["author"].as_str().unwrap_or("Unknown Author").to_string();
    let spine = val["spine"].as_array();
    let pivotal_chapters: Vec<String> = spine
        .map(|arr| {
            arr.iter()
                .filter_map(|ch| ch["id"].as_str().map(|s| s.to_string()))
                .take(2)
                .collect()
        })
        .unwrap_or_default();

    Ok(crate::vault::InspectionalBlueprint {
        front_matter: serde_json::json!({
            "has_preface": false,
            "preface_path": None::<String>,
            "publisher_blurb": format!("{} by {}", title, author)
        }),
        pivotal_chapters,
        synthetic_index_clusters: vec![],
    })
}

/// Reads the notes of a chapter from vault/notes/<book-id>/<file-name>, such as `ch-01-notes.md` (SEC-03), with `\n`
/// line endings only (IN-06).
pub fn read_notes_file(book_id: &str, file_name: &str) -> Result<String> {
    let path = super::paths::chapter_notes_path(book_id, file_name)?;
    if file_is_there(&path) {
        read_text_file(&path).with_context(|| format!("Failed to read notes file: {}", path.display()))
    } else {
        // Only a file that was really looked at and was really not there gets the starter template. A file that
        // could not be looked at gives an error above instead, because the notes pane saves what it was shown,
        // and being shown the template is how a chapter of notes was written over (DS-16).
        Ok(format!(
            "# Notes: {book_id}\n\n## Key Reflections\n\n- \n\n## Questions\n\n- \n"
        ))
    }
}

/// Writes the notes of a chapter to vault/notes/<book-id>/<file-name>, such as `ch-01-notes.md` (SEC-03).
pub fn write_notes_file(book_id: &str, file_name: &str, content: &str) -> Result<()> {
    let path = super::paths::chapter_notes_path(book_id, file_name)?;
    super::safe_write::write_file(&path, content)
}

/// The id of the book in `folder`: the name of the folder, which every file read uses, `books/<id>/` for the book and
/// `notes/<id>/` for the reader's notes and study progress (LC-02). None when the name is not valid Unicode.
pub fn book_id_of(folder: &Path) -> Option<String> {
    folder.file_name()?.to_str().map(str::to_string)
}

/// Whether the vault holds the book `book_id`: a folder `books/<book_id>` with a `_meta.json`, as the library lists it.
/// A `_meta.json` that cannot be looked at still counts, because a file in OneDrive can be locked or offline for a
/// moment (LC-02). A name that is no book id, or a book folder that leads out of the vault, is no book of the vault
/// (SEC-03).
pub fn book_is_in_vault(book_id: &str) -> Result<bool> {
    find_vault_root()?;
    let Ok(meta) = super::paths::book_file(book_id, "_meta.json") else {
        return Ok(false);
    };
    Ok(file_is_there(&meta))
}

/// Scans vault/books/ for all subdirectories containing a _meta.json and returns BookMetadata list.
///
/// A book's id is its folder name (`book_id_of`). The `book_id` in `_meta.json` is not used: it named a book that no
/// file read could find once the folder was renamed (LC-02). The index run names a renamed folder in the error bar.
pub fn scan_library_books() -> std::result::Result<Vec<BookMetadata>, AppError> {
    let vault = find_vault_root().map_err(|e| AppError::VaultNotFound(e.to_string()))?;
    let books_dir = vault.join("books");
    let mut results = Vec::new();

    if !file_is_there(&books_dir) {
        return Ok(results);
    }

    let dir_entries =
        std::fs::read_dir(&books_dir).map_err(|e| AppError::Io(format!("Failed to read books directory: {e}")))?;

    for entry in dir_entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                eprintln!("Warning: Skipping unreadable entry in books dir: {e}");
                continue;
            }
        };
        let path = entry.path();
        if path.is_dir() {
            let meta_path = path.join("_meta.json");
            if file_is_there(&meta_path) {
                let content = match std::fs::read_to_string(&meta_path) {
                    Ok(c) => c,
                    Err(e) => {
                        eprintln!("Warning: Could not read {}: {}", meta_path.display(), e);
                        continue;
                    }
                };

                let val = match serde_json::from_str::<serde_json::Value>(&content) {
                    Ok(v) => v,
                    Err(e) => {
                        eprintln!("Warning: Failed to parse {}: {}", meta_path.display(), e);
                        continue;
                    }
                };

                let Some(id) = book_id_of(&path) else {
                    eprintln!(
                        "Warning: Skipping a book folder whose name is not valid Unicode: {}",
                        path.display()
                    );
                    continue;
                };

                let title = val["title"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .unwrap_or("Untitled")
                    .to_string();

                let author = val["author"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .unwrap_or("Unknown Author")
                    .to_string();

                let chapter_count = val["total_chapters"]
                    .as_u64()
                    .map(|n| n as usize)
                    .or_else(|| val["spine"].as_array().map(|arr| arr.len()))
                    .unwrap_or(0);

                let total_words = val["total_words"].as_u64().map(|n| n as usize).unwrap_or(0);

                let elementary_metrics = val
                    .get("elementary_metrics")
                    .and_then(|v| serde_json::from_value(v.clone()).ok());

                let inspectional_blueprint = val
                    .get("inspectional_blueprint")
                    .and_then(|v| serde_json::from_value(v.clone()).ok());

                results.push(BookMetadata {
                    id,
                    title,
                    author,
                    chapter_count,
                    total_words,
                    elementary_metrics,
                    inspectional_blueprint,
                });
            }
        }
    }

    results.sort_by_key(|book| book.title.to_lowercase());
    Ok(results)
}

/// Scans vault/books/ for available ingested books
pub fn scan_available_books() -> Result<Vec<BookSummary>> {
    let vault = find_vault_root()?;
    let books_dir = vault.join("books");
    let mut results = Vec::new();

    if !file_is_there(&books_dir) {
        return Ok(results);
    }

    for entry in std::fs::read_dir(&books_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let meta_path = path.join("_meta.json");
            if file_is_there(&meta_path) {
                if let Ok(content) = std::fs::read_to_string(&meta_path) {
                    // A book is known by its folder name, as the library knows it (LC-02).
                    if let (Ok(val), Some(book_id)) =
                        (serde_json::from_str::<serde_json::Value>(&content), book_id_of(&path))
                    {
                        let title = val["title"].as_str().unwrap_or("Untitled").to_string();
                        let author = val["author"].as_str().unwrap_or("Unknown").to_string();
                        let total_chapters = val["total_chapters"].as_u64().unwrap_or(0) as usize;
                        let total_words = val["total_words"].as_u64().unwrap_or(0) as usize;

                        results.push(BookSummary {
                            book_id,
                            title,
                            author,
                            total_chapters,
                            total_words,
                        });
                    }
                }
            }
        }
    }

    Ok(results)
}
