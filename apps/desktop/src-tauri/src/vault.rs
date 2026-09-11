use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use anyhow::{Context, Result};

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum AppError {
    #[error("Vault not found: {0}")]
    VaultNotFound(String),
    #[error("I/O error: {0}")]
    Io(String),
    #[error("Serialization error: {0}")]
    Serialization(String),
    #[error("Internal error: {0}")]
    Internal(String),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookMetadata {
    pub id: String,
    pub title: String,
    pub author: String,
    pub chapter_count: usize,
    pub total_words: usize,
}

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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChapterNoteFile {
    pub file_name: String,
    pub chapter_file: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AggregatedNoteItem {
    pub id: String,
    pub item_type: String, // "highlight" | "note"
    pub chapter_file: String,
    pub chapter_title: String,
    pub chapter_order: usize,
    pub anchor: Option<String>,
    pub text: String,
    pub color: Option<String>,
    pub section_heading: Option<String>,
    pub created_at: Option<String>,
}

/// Helper: extracts numeric index from paragraph anchor like "^p-042" -> 42
fn extract_anchor_index(anchor_opt: Option<&str>) -> usize {
    if let Some(anchor) = anchor_opt {
        let digits: String = anchor.chars().filter(|c| c.is_ascii_digit()).collect();
        digits.parse::<usize>().unwrap_or(usize::MAX)
    } else {
        usize::MAX
    }
}

/// Scans vault/notes/<book-id>/ for all ch-*-notes.md files in read-only mode and returns their contents.
pub fn scan_all_notes(book_id: &str) -> Result<Vec<ChapterNoteFile>> {
    let vault = find_vault_root()?;
    let notes_dir = vault.join("notes").join(book_id);
    let mut entries = Vec::new();

    if !notes_dir.exists() {
        return Ok(entries);
    }

    let dir_entries = std::fs::read_dir(&notes_dir)
        .with_context(|| format!("Failed to read notes dir: {}", notes_dir.display()))?;

    for entry in dir_entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                eprintln!("Warning: Skipping unreadable entry in notes dir: {}", e);
                continue;
            }
        };
        let path = entry.path();
        if path.is_file() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            // Match files like ch-01-notes.md, ch-XX-notes.md
            if file_name.ends_with("-notes.md") && !file_name.starts_with('.') {
                let chapter_file = file_name.replace("-notes.md", ".md");
                if let Ok(content) = std::fs::read_to_string(&path) {
                    entries.push(ChapterNoteFile {
                        file_name,
                        chapter_file,
                        content,
                    });
                }
            }
        }
    }

    entries.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    Ok(entries)
}

/// Scans and parses both human-written reflection Markdown and embedded W3C highlight JSON blocks
/// across all `vault/notes/<book-id>/ch-*-notes.md`, grouping entries by chapter and anchor.
pub fn parse_all_book_notes(book_id: &str) -> Result<Vec<AggregatedNoteItem>> {
    let note_files = scan_all_notes(book_id)?;
    let mut chapter_info: std::collections::HashMap<String, (String, usize)> = std::collections::HashMap::new();

    // Load _meta.json if present to get canonical chapter titles and reading orders
    if let Ok(meta_json) = read_book_meta_json(book_id) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&meta_json) {
            if let Some(spine) = val["spine"].as_array() {
                for (idx, ch) in spine.iter().enumerate() {
                    let file_path = ch["file_path"].as_str().unwrap_or("").to_string();
                    let title = ch["title"].as_str().unwrap_or("").to_string();
                    let order = ch["order"].as_u64().map(|o| o as usize).unwrap_or(idx + 1);
                    if !file_path.is_empty() {
                        chapter_info.insert(file_path, (title, order));
                    }
                }
            }
        }
    }

    let mut items: Vec<AggregatedNoteItem> = Vec::new();

    for file in &note_files {
        let (ch_title, ch_order) = chapter_info.get(&file.chapter_file).cloned().unwrap_or_else(|| {
            let fallback_title = file.chapter_file.replace(".md", "").replace("ch-", "Chapter ");
            (fallback_title, 999)
        });

        // 1. Parse embedded W3C highlights JSON comment block: <!-- highlights-json [...] -->
        if let Some(start_idx) = file.content.find("<!-- highlights-json") {
            if let Some(end_rel) = file.content[start_idx..].find("-->") {
                let json_slice = &file.content[start_idx + "<!-- highlights-json".len()..start_idx + end_rel].trim();
                if let Ok(highlights) = serde_json::from_str::<Vec<serde_json::Value>>(json_slice) {
                    for hl in highlights {
                        let id = hl["id"].as_str().unwrap_or("").to_string();
                        let exact = hl["exact"].as_str().unwrap_or("").to_string();
                        let anchor = hl["anchor"].as_str().map(|s| s.to_string());
                        let color = hl["color"].as_str().map(|s| s.to_string());
                        let created_at = hl["createdAt"].as_str().map(|s| s.to_string());

                        if !exact.is_empty() {
                            items.push(AggregatedNoteItem {
                                id: if id.is_empty() { format!("hl-{}", items.len()) } else { id },
                                item_type: "highlight".to_string(),
                                chapter_file: file.chapter_file.clone(),
                                chapter_title: ch_title.clone(),
                                chapter_order: ch_order,
                                anchor,
                                text: exact,
                                color,
                                section_heading: None,
                                created_at,
                            });
                        }
                    }
                }
            }
        }

        // 2. Parse human-written reflection Markdown
        // Strip out the highlights json comment and the human-readable highlights block
        let mut clean_content = file.content.clone();
        if let Some(start) = clean_content.find("<!-- highlights-json") {
            if let Some(end) = clean_content[start..].find("-->") {
                clean_content.replace_range(start..start + end + 3, "");
            }
        }

        // Remove `## Highlights ...` section if present
        if let Some(hl_sec) = clean_content.find("## Highlights") {
            let next_sec = clean_content[hl_sec + 13..]
                .find("\n## ")
                .map(|pos| hl_sec + 13 + pos)
                .unwrap_or(clean_content.len());
            clean_content.replace_range(hl_sec..next_sec, "");
        }

        let lines: Vec<&str> = clean_content.lines().collect();
        let mut current_heading = "Reflections".to_string();

        for (line_idx, raw_line) in lines.iter().enumerate() {
            let line = raw_line.trim();
            if line.is_empty() || line.starts_with("# ") {
                continue;
            }

            if line.starts_with("## ") || line.starts_with("### ") {
                current_heading = line.trim_start_matches('#').trim().to_string();
                continue;
            }

            let mut text = line.trim_start_matches(|c| c == '-' || c == '*' || c == '•').trim().to_string();
            if text.is_empty() || text == "-" {
                continue;
            }

            // Extract anchor (^p-xxx) if present
            let mut anchor: Option<String> = None;
            if let Some(anchor_start) = text.rfind("^p-") {
                let candidate = &text[anchor_start..];
                let anchor_str: String = candidate.chars().take_while(|c| !c.is_whitespace() && *c != ')').collect();
                text = text[..anchor_start].trim().trim_end_matches('(').trim().to_string();
                anchor = Some(anchor_str);
            }

            if !text.is_empty() {
                items.push(AggregatedNoteItem {
                    id: format!("note-{}-{}-{}", file.chapter_file, line_idx, items.len()),
                    item_type: "note".to_string(),
                    chapter_file: file.chapter_file.clone(),
                    chapter_title: ch_title.clone(),
                    chapter_order: ch_order,
                    anchor,
                    text,
                    color: None,
                    section_heading: Some(current_heading.clone()),
                    created_at: None,
                });
            }
        }
    }

    // Sort items chronologically by chapter order, then by anchor number
    items.sort_by(|a, b| {
        if a.chapter_order != b.chapter_order {
            a.chapter_order.cmp(&b.chapter_order)
        } else {
            let a_idx = extract_anchor_index(a.anchor.as_deref());
            let b_idx = extract_anchor_index(b.anchor.as_deref());
            a_idx.cmp(&b_idx)
        }
    });

    Ok(items)
}

/// Compiles all chapter notes, reflections, and quotes across the book into a unified,
/// publication-ready Markdown file: `vault/notes/<book-id>/summary-export.md`.
pub fn compile_and_export_book_summary(book_id: &str) -> Result<String> {
    let items = parse_all_book_notes(book_id)?;

    // Book metadata
    let book_title = if let Ok(meta_json) = read_book_meta_json(book_id) {
        serde_json::from_str::<serde_json::Value>(&meta_json)
            .ok()
            .and_then(|v| v["title"].as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| book_id.to_string())
    } else {
        book_id.to_string()
    };

    let author = if let Ok(meta_json) = read_book_meta_json(book_id) {
        serde_json::from_str::<serde_json::Value>(&meta_json)
            .ok()
            .and_then(|v| v["author"].as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "Local Vault".to_string())
    } else {
        "Local Vault".to_string()
    };

    let mut md = format!("# Executive Reading Summary: {}\n\n", book_title);
    md.push_str(&format!("> **Author:** {}  \n", author));
    md.push_str(&format!("> **Exported:** {} via Book Engine Desktop  \n\n", chrono::Utc::now().format("%Y-%m-%d")));
    md.push_str("---\n\n## Table of Contents\n\n");

    // Group items by chapter
    let mut chapter_map: std::collections::BTreeMap<usize, (String, Vec<&AggregatedNoteItem>)> = std::collections::BTreeMap::new();
    for item in &items {
        chapter_map
            .entry(item.chapter_order)
            .or_insert_with(|| (item.chapter_title.clone(), Vec::new()))
            .1
            .push(item);
    }

    for (_order, (ch_title, ch_items)) in &chapter_map {
        let slug = ch_title.to_lowercase().chars().map(|c| if c.is_alphanumeric() { c } else { '-' }).collect::<String>();
        md.push_str(&format!("- [{}](#{}) ({} items)\n", ch_title, slug, ch_items.len()));
    }
    md.push_str("\n---\n\n");

    for (_order, (ch_title, ch_items)) in &chapter_map {
        md.push_str(&format!("## {}\n\n", ch_title));

        let highlights: Vec<&&AggregatedNoteItem> = ch_items.iter().filter(|i| i.item_type == "highlight").collect();
        let notes: Vec<&&AggregatedNoteItem> = ch_items.iter().filter(|i| i.item_type == "note").collect();

        if !highlights.is_empty() {
            md.push_str("### Key Highlights & Quotes\n\n");
            for hl in highlights {
                let anchor_str = hl.anchor.as_ref().map(|a| format!(" *({})*", a)).unwrap_or_default();
                md.push_str(&format!("- > \"{}\"{}\n", hl.text, anchor_str));
            }
            md.push('\n');
        }

        if !notes.is_empty() {
            md.push_str("### Reflections & Notes\n\n");
            let mut last_heading = String::new();
            for note in notes {
                if let Some(heading) = &note.section_heading {
                    if heading != &last_heading {
                        last_heading = heading.clone();
                        md.push_str(&format!("#### {}\n\n", last_heading));
                    }
                }
                let anchor_str = note.anchor.as_ref().map(|a| format!(" *({})*", a)).unwrap_or_default();
                md.push_str(&format!("- {}{}\n", note.text, anchor_str));
            }
            md.push('\n');
        }

        md.push_str("---\n\n");
    }

    md.push_str("*Generated deterministically by Book Engine*\n");

    write_notes_file(book_id, "summary-export.md", &md)?;
    let vault = find_vault_root()?;
    let exported_path = vault.join("notes").join(book_id).join("summary-export.md");
    Ok(exported_path.to_string_lossy().to_string())
}

/// Exports a single compiled summary markdown file to vault/notes/<book-id>/summary-export.md
pub fn export_summary_file(book_id: &str, content: &str) -> Result<String> {
    write_notes_file(book_id, "summary-export.md", content)?;
    let vault = find_vault_root()?;
    let path = vault.join("notes").join(book_id).join("summary-export.md");
    Ok(path.to_string_lossy().to_string())
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

                results.push(BookMetadata {
                    id,
                    title,
                    author,
                    chapter_count,
                    total_words,
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
