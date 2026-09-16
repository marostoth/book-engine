use std::path::PathBuf;
use anyhow::{Context, Result};
use super::models::{AppError, BookMetadata, BookSummary, ExitAssessmentPayload};

/// Test builds only resolve the vault inside the active `test_support::Sandbox`.
#[cfg(test)]
pub fn find_vault_root() -> Result<PathBuf> {
    crate::test_support::vault_root()
}

/// Discovers the absolute path to the Markdown vault directory.
#[cfg(not(test))]
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

/// Retrieves the inspectional blueprint for a given book_id, synthesizing a resilient fallback if absent.
pub fn get_inspectional_blueprint(book_id: &str) -> Result<crate::vault::InspectionalBlueprint> {
    let meta_json_str = read_book_meta_json(book_id)?;
    let val: serde_json::Value = serde_json::from_str(&meta_json_str)
        .with_context(|| format!("Failed to parse _meta.json for {}", book_id))?;

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
        exit_assessment: None,
    })
}

/// Saves an inspectional exit assessment to vault/books/<book-id>/_meta.json
pub fn save_inspectional_exit_assessment(book_id: &str, assessment: ExitAssessmentPayload) -> Result<()> {
    let vault = find_vault_root()?;
    let meta_path = vault.join("books").join(book_id).join("_meta.json");
    let content = std::fs::read_to_string(&meta_path)
        .with_context(|| format!("Failed to read _meta.json: {}", meta_path.display()))?;
    let mut val: serde_json::Value = serde_json::from_str(&content)
        .with_context(|| format!("Failed to parse _meta.json for {}", book_id))?;

    let assessment_json = serde_json::to_value(&assessment)
        .with_context(|| "Failed to serialize exit assessment")?;

    if let Some(obj) = val.as_object_mut() {
        let bp = obj.entry("inspectional_blueprint").or_insert_with(|| serde_json::json!({
            "front_matter": {},
            "pivotal_chapters": [],
            "synthetic_index_clusters": [],
            "exit_assessment": null
        }));
        bp["exit_assessment"] = assessment_json;
    }

    let updated_json = serde_json::to_string_pretty(&val)
        .with_context(|| "Failed to serialize updated _meta.json")?;
    // Keep the key order and the line endings the file already had, so a rewrite of a file the
    // reader may also edit by hand is a small change, not a change on every line (DS-03).
    let updated_json = if content.contains("\r\n") {
        updated_json.replace('\n', "\r\n")
    } else {
        updated_json
    };
    super::safe_write::write_file(&meta_path, &updated_json)?;
    Ok(())
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
    let path = vault.join("notes").join(book_id).join(file_name);
    super::safe_write::write_file(&path, content)
}

/// Scans vault/books/ for all subdirectories containing a _meta.json and returns BookMetadata list.
pub fn scan_library_books() -> std::result::Result<Vec<BookMetadata>, AppError> {
    let vault = find_vault_root().map_err(|e| AppError::VaultNotFound(e.to_string()))?;
    let books_dir = vault.join("books");
    let mut results = Vec::new();

    if !books_dir.exists() {
        return Ok(results);
    }

    let dir_entries = std::fs::read_dir(&books_dir)
        .map_err(|e| AppError::Io(format!("Failed to read books directory: {}", e)))?;

    for entry in dir_entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                eprintln!("Warning: Skipping unreadable entry in books dir: {}", e);
                continue;
            }
        };
        let path = entry.path();
        if path.is_dir() {
            let meta_path = path.join("_meta.json");
            if meta_path.exists() {
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

                let dir_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();

                let id = val["book_id"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string())
                    .unwrap_or(dir_name);

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

                let total_words = val["total_words"]
                    .as_u64()
                    .map(|n| n as usize)
                    .unwrap_or(0);

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

    results.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(results)
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
