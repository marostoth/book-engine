use super::models::{AggregatedNoteItem, ChapterNoteFile};
use super::reader::read_book_meta_json;
use anyhow::{Context, Result};

/// The summary that the app exports, in `vault/notes/<book-id>/`.
const SUMMARY_EXPORT_FILE: &str = "summary-export.md";

/// The markers that start a line of Markdown but say nothing the notes drawer has to show.
const LINE_MARKERS: [char; 4] = ['-', '*', '\u{2022}', '>'];

/// Quote marks that come in pairs, as `"a" b"` must keep both of its own.
const QUOTE_PAIRS: [(char, char); 4] = [
    ('"', '"'),
    ('\u{201c}', '\u{201d}'),
    ('\'', '\''),
    ('\u{2018}', '\u{2019}'),
];

/// The label the pane writes above the empty line it leaves for the reader's own thought.
const REFLECTION_LABEL: &str = "reflection:";

/// The text and the paragraph anchor of one note line, as the drawer must show them, or `None` when the line has
/// nothing to show (RD-08).
///
/// The notes pane writes a saved quote as `> "the sentence" (#^p-001)`, and an empty `- Reflection: ` line under it
/// for the reader's own thought (`lib/notesQuote.ts`). The drawer showed that as `> "the sentence" (#` and a bare
/// `Reflection:`, because the parser stripped only `-`, `*` and `\u{2022}`, then trimmed one `(` that was never the
/// last character: the `#` was.
///
/// Two more faults went with it, neither of them in the finding. Text after an anchor was dropped, so a note reading
/// `See ^p-012 for the rest` showed as `See`. And `lib/notesAggregator.ts`, which answers for the backend in browser
/// dev mode, got a DIFFERENT wrong answer for the same line, `> "the sentence" (#)`, so the two could never be told
/// apart by looking at one of them. `tests/test_one_note_format.py` now holds them to the same answers.
pub fn note_text_and_anchor(line: &str) -> Option<(String, Option<String>)> {
    let mut text = line.trim().to_string();

    // `- > "a quote"` and `> - "a quote"` both read as one quote, so strip markers until none is left.
    loop {
        let without = text.trim_start_matches(LINE_MARKERS).trim_start();
        if without.len() == text.len() {
            break;
        }
        text = without.to_string();
    }

    let anchor = take_anchor(&mut text);
    text = without_wrapping_quotes(text.trim());

    // An empty `Reflection:` is the prompt itself, not a note. One with words after it keeps the words: the card
    // already prints the section heading as its own label, so repeating it in the body says nothing twice.
    if let Some(rest) = strip_label(&text, REFLECTION_LABEL) {
        text = without_wrapping_quotes(rest.trim());
    }

    if text.is_empty() {
        return None;
    }
    Some((text, anchor))
}

/// Takes the last `^p-NNN` out of `text` and returns it, keeping whatever was written on either side.
///
/// The bracket the pane writes around it, `(#...)`, goes too. An earlier version dropped everything after the
/// anchor, so `See ^p-012 for the rest` became `See`.
fn take_anchor(text: &mut String) -> Option<String> {
    let start = text.rfind("^p-")?;
    #[expect(
        clippy::string_slice,
        reason = "rfind returns the byte index where ^p- starts, so both cuts are on a character boundary"
    )]
    let anchor: String = text[start..]
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '^' || *c == 'p' || *c == '-')
        .collect();

    #[expect(
        clippy::string_slice,
        reason = "same boundary, and anchor is a prefix of the text from start"
    )]
    let before = text[..start].trim_end().trim_end_matches(['(', '#', ' ']).to_string();
    #[expect(
        clippy::string_slice,
        reason = "anchor was taken from the front of this slice, so its length is a boundary"
    )]
    let after = text[start + anchor.len()..]
        .trim_start_matches([')', ' '])
        .trim()
        .to_string();

    *text = if after.is_empty() {
        before
    } else if before.is_empty() {
        after
    } else {
        format!("{before} {after}")
    };
    Some(anchor)
}

/// `text` without one matching pair of quote marks around the whole of it.
///
/// Only a pair is taken, so a note that holds one quote mark of its own keeps it.
fn without_wrapping_quotes(text: &str) -> String {
    for (open, close) in QUOTE_PAIRS {
        if let Some(inner) = text.strip_prefix(open).and_then(|rest| rest.strip_suffix(close)) {
            return inner.trim().to_string();
        }
    }
    text.to_string()
}

/// What follows `label:` at the start of `text`, whatever its case, or `None` when the label is not there.
fn strip_label(text: &str, label: &str) -> Option<String> {
    let start: String = text.chars().take(label.chars().count()).collect();
    if start.to_lowercase() != label {
        return None;
    }
    Some(text.chars().skip(label.chars().count()).collect())
}

/// Helper: extracts numeric index from paragraph anchor like "^p-042" -> 42
pub fn extract_anchor_index(anchor_opt: Option<&str>) -> usize {
    if let Some(anchor) = anchor_opt {
        let digits: String = anchor.chars().filter(|c| c.is_ascii_digit()).collect();
        digits.parse::<usize>().unwrap_or(usize::MAX)
    } else {
        usize::MAX
    }
}

/// Scans vault/notes/<book-id>/ for all ch-*-notes.md files in read-only mode and returns their contents.
pub fn scan_all_notes(book_id: &str) -> Result<Vec<ChapterNoteFile>> {
    let notes_dir = super::paths::notes_folder(book_id)?;
    let mut entries = Vec::new();

    if !notes_dir.exists() {
        return Ok(entries);
    }

    let dir_entries =
        std::fs::read_dir(&notes_dir).with_context(|| format!("Failed to read notes dir: {}", notes_dir.display()))?;

    for entry in dir_entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                eprintln!("Warning: Skipping unreadable entry in notes dir: {e}");
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
#[expect(
    clippy::string_slice,
    reason = "every position comes from `find` or `rfind`, plus the length of an ASCII marker"
)]
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

        // 1. Highlights live in their own file (vault/highlights.rs). A chapter that was not moved
        // over yet still keeps them in the old comment, and reading here never changes a file.
        match super::highlights::read_chapter_highlights(book_id, &file.chapter_file) {
            Err(err) => eprintln!("Warning: {err:#}"),
            Ok(highlights) => {
                for (index, hl) in highlights.into_iter().enumerate() {
                    if hl.exact.is_empty() {
                        continue;
                    }
                    items.push(AggregatedNoteItem {
                        id: if hl.id.is_empty() { format!("hl-{index}") } else { hl.id },
                        item_type: "highlight".to_string(),
                        chapter_file: file.chapter_file.clone(),
                        chapter_title: ch_title.clone(),
                        chapter_order: ch_order,
                        anchor: hl.anchor,
                        text: hl.exact,
                        color: hl.color,
                        section_heading: None,
                        created_at: Some(hl.created_at),
                    });
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

            // One rule for the markers, the anchor, the quote marks and the empty prompt (RD-08).
            let Some((text, anchor)) = note_text_and_anchor(line) else {
                continue;
            };

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

    let mut md = format!("# Executive Reading Summary: {book_title}\n\n");
    md.push_str(&format!("> **Author:** {author}  \n"));
    md.push_str(&format!(
        "> **Exported:** {} via Book Engine Desktop  \n\n",
        chrono::Utc::now().format("%Y-%m-%d")
    ));
    md.push_str("---\n\n## Table of Contents\n\n");

    // Group items by chapter
    let mut chapter_map: std::collections::BTreeMap<usize, (String, Vec<&AggregatedNoteItem>)> =
        std::collections::BTreeMap::new();
    for item in &items {
        chapter_map
            .entry(item.chapter_order)
            .or_insert_with(|| (item.chapter_title.clone(), Vec::new()))
            .1
            .push(item);
    }

    for (ch_title, ch_items) in chapter_map.values() {
        let slug = ch_title
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>();
        md.push_str(&format!("- [{}](#{}) ({} items)\n", ch_title, slug, ch_items.len()));
    }
    md.push_str("\n---\n\n");

    for (ch_title, ch_items) in chapter_map.values() {
        md.push_str(&format!("## {ch_title}\n\n"));

        let highlights: Vec<&&AggregatedNoteItem> = ch_items.iter().filter(|i| i.item_type == "highlight").collect();
        let notes: Vec<&&AggregatedNoteItem> = ch_items.iter().filter(|i| i.item_type == "note").collect();

        if !highlights.is_empty() {
            md.push_str("### Key Highlights & Quotes\n\n");
            for hl in highlights {
                let anchor_str = hl.anchor.as_ref().map(|a| format!(" *({a})*")).unwrap_or_default();
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
                        md.push_str(&format!("#### {last_heading}\n\n"));
                    }
                }
                let anchor_str = note.anchor.as_ref().map(|a| format!(" *({a})*")).unwrap_or_default();
                md.push_str(&format!("- {}{}\n", note.text, anchor_str));
            }
            md.push('\n');
        }

        md.push_str("---\n\n");
    }

    md.push_str("*Generated deterministically by Book Engine*\n");

    let exported_path = super::paths::notes_file(book_id, SUMMARY_EXPORT_FILE)?;
    super::safe_write::write_file(&exported_path, &md)?;
    Ok(exported_path.to_string_lossy().to_string())
}

// `export_summary_file` was deleted here (LC-03). It wrote the same `summary-export.md` as the function above, but
// with whatever text the window sent, and the only caller was the `export_summary` command, which was never
// registered. The window asks for `export_book_summary` now, which compiles the file here.
