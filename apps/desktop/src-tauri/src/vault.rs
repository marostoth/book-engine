use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use anyhow::{Context, Result};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookSummary {
    pub book_id: String,
    pub title: String,
    pub author: String,
    pub total_chapters: usize,
    pub total_words: usize,
}

/// Discovers the absolute path to the Markdown vault directory.
pub fn find_vault_root() -> Result<PathBuf> {
    // Check environment variable first if set
    if let Ok(env_path) = std::env::var("BOOK_ENGINE_VAULT") {
        let p = PathBuf::from(env_path);
        if p.exists() {
            return Ok(p);
        }
    }

    // Try relative paths from current working directory
    let candidates = [
        PathBuf::from("vault"),
        PathBuf::from("../../vault"),
        PathBuf::from("../vault"),
    ];

    for candidate in &candidates {
        if candidate.exists() && candidate.join("books").exists() {
            return std::fs::canonicalize(candidate).context("Failed to canonicalize vault path");
        }
    }

    // Search parent directories
    if let Ok(mut current) = std::env::current_dir() {
        for _ in 0..6 {
            let test_path = current.join("vault");
            if test_path.exists() && test_path.join("books").exists() {
                return std::fs::canonicalize(test_path).context("Failed to canonicalize vault path");
            }
            if !current.pop() {
                break;
            }
        }
    }

    anyhow::bail!("Vault directory not found in workspace hierarchy")
}

/// Reads a chapter file from vault/books/<book-id>/<file-name>
pub fn read_chapter_file(book_id: &str, file_name: &str) -> Result<String> {
    let vault = find_vault_root()?;
    let path = vault.join("books").join(book_id).join(file_name);
    std::fs::read_to_string(&path)
        .with_context(|| format!("Failed to read chapter file: {}", path.display()))
}

/// Reads the _meta.json file for a book
pub fn read_book_meta_json(book_id: &str) -> Result<String> {
    let vault = find_vault_root()?;
    let path = vault.join("books").join(book_id).join("_meta.json");
    std::fs::read_to_string(&path)
        .with_context(|| format!("Failed to read _meta.json: {}", path.display()))
}

/// Reads notes markdown file from vault/notes/<book-id>/<file-name>
pub fn read_notes_file(book_id: &str, file_name: &str) -> Result<String> {
    let vault = find_vault_root()?;
    let path = vault.join("notes").join(book_id).join(file_name);
    if path.exists() {
        std::fs::read_to_string(&path)
            .with_context(|| format!("Failed to read notes file: {}", path.display()))
    } else {
        // Return default starter template if file does not yet exist
        Ok(format!("# Notes: {book_id}\n\n## Key Reflections\n\n- \n\n## Questions\n\n- \n"))
    }
}

/// Writes notes markdown file to vault/notes/<book-id>/<file-name>
pub fn write_notes_file(book_id: &str, file_name: &str, content: &str) -> Result<()> {
    let vault = find_vault_root()?;
    let notes_dir = vault.join("notes").join(book_id);
    std::fs::create_dir_all(&notes_dir)
        .with_context(|| format!("Failed to create notes dir: {}", notes_dir.display()))?;
    let path = notes_dir.join(file_name);
    std::fs::write(&path, content)
        .with_context(|| format!("Failed to write notes file: {}", path.display()))?;
    Ok(())
}

/// Scans vault/books/ for available ingested books
pub fn scan_available_books() -> Result<Vec<BookSummary>> {
    let vault = find_vault_root()?;
    let books_dir = vault.join("books");
    let mut results = Vec::new();

    if !books_dir.exists() {
        return Ok(results);
    }

    for entry in std::fs::read_dir(&books_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let meta_path = path.join("_meta.json");
            if meta_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&meta_path) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                        let book_id = val["book_id"].as_str().unwrap_or("").to_string();
                        let title = val["title"].as_str().unwrap_or("Untitled").to_string();
                        let author = val["author"].as_str().unwrap_or("Unknown").to_string();
                        let total_chapters = val["total_chapters"].as_u64().unwrap_or(0) as usize;
                        let total_words = val["total_words"].as_u64().unwrap_or(0) as usize;

                        if !book_id.is_empty() {
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
    }

    Ok(results)
}
