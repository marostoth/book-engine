use anyhow::{Context, Result};
use super::json_store::read_json_file;
use super::models::VocabularyEntry;

/// Returns all saved vocabulary terms for the specified book from `vault/notes/<book-id>/vocabulary.json`.
/// A book with no file yet has no terms. A damaged file gives an error, never an empty list.
pub fn get_book_vocabulary(book_id: &str) -> Result<Vec<VocabularyEntry>> {
    let vocab_file = super::paths::notes_file(book_id, "vocabulary.json")?;

    Ok(read_json_file(&vocab_file)?.unwrap_or_default())
}

/// Appends or updates a vocabulary term in `vault/notes/<book-id>/vocabulary.json`.
/// Applies case-insensitive deduplication: if the term already exists, updates definition,
/// anchor, and savedAt in place.
///
/// The whole list is written back, so a damaged file stops the save instead of replacing
/// every saved term with this one (DS-04).
pub fn save_vocabulary_term(book_id: &str, entry: VocabularyEntry) -> Result<()> {
    let vocab_file = super::paths::notes_file(book_id, "vocabulary.json")?;

    let mut entries: Vec<VocabularyEntry> = read_json_file(&vocab_file)?.unwrap_or_default();

    let target_key = entry.word.trim().to_lowercase();
    let mut updated = false;

    for existing in entries.iter_mut() {
        if existing.word.trim().to_lowercase() == target_key {
            existing.definition = entry.definition.clone();
            existing.anchor = entry.anchor.clone();
            existing.saved_at = entry.saved_at.clone();
            updated = true;
            break;
        }
    }

    if !updated {
        entries.push(entry);
    }

    let serialized = serde_json::to_string_pretty(&entries)
        .context("Failed to serialize vocabulary list to JSON")?;

    super::safe_write::write_file(&vocab_file, &serialized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use crate::test_support::Sandbox;

    const VOCAB_FILE: &str = "notes/sample/vocabulary.json";
    const TRUNCATED: &str = r#"[{"word":"pin","definition":"a small metal p"#;
    const ONE_TERM: &str = r#"[{"word":"pin","definition":"a small metal pin","anchor":"^p-001","savedAt":"2026-09-14T00:00:00Z"}]"#;

    fn entry(word: &str) -> VocabularyEntry {
        VocabularyEntry {
            word: word.to_string(),
            definition: format!("definition of {word}"),
            chapter_file: "ch-01.md".to_string(),
            anchor: "^p-001".to_string(),
            saved_at: "2026-09-16T00:00:00Z".to_string(),
        }
    }

    /// Names of the `.corrupt-` copies next to the sample vocabulary file.
    fn corrupt_copies(sandbox: &Sandbox) -> Vec<String> {
        let dir = sandbox.vault().join("notes").join("sample");
        let mut names: Vec<String> = fs::read_dir(&dir)
            .expect("read notes dir")
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.starts_with("vocabulary.json.corrupt-"))
            .collect();
        names.sort();
        names
    }

    fn saved_words(book_id: &str) -> Vec<String> {
        get_book_vocabulary(book_id)
            .expect("read vocabulary back")
            .iter()
            .map(|e| e.word.clone())
            .collect()
    }

    #[test]
    fn a_damaged_vocabulary_file_is_never_saved_over() {
        let sandbox = Sandbox::new();
        sandbox.write(VOCAB_FILE, TRUNCATED);

        let error = save_vocabulary_term("sample", entry("labour"))
            .expect_err("a damaged vocabulary file must refuse the save");

        assert!(error.to_string().contains("vocabulary.json"), "the error must name the file: {error}");
        let on_disk = fs::read_to_string(sandbox.vault().join(VOCAB_FILE)).expect("read vocabulary file");
        assert_eq!(on_disk, TRUNCATED, "the damaged file must stay exactly as it was");
    }

    #[test]
    fn a_damaged_vocabulary_file_is_not_read_as_empty() {
        let sandbox = Sandbox::new();
        sandbox.write(VOCAB_FILE, TRUNCATED);

        let error = get_book_vocabulary("sample").expect_err("a damaged file must not read as no terms");
        assert!(error.to_string().contains("vocabulary.json"), "the error must name the file: {error}");
    }

    #[test]
    fn a_damaged_vocabulary_file_is_copied_aside() {
        let sandbox = Sandbox::new();
        sandbox.write(VOCAB_FILE, TRUNCATED);

        save_vocabulary_term("sample", entry("labour")).expect_err("save must fail");

        let copies = corrupt_copies(&sandbox);
        assert_eq!(copies.len(), 1, "expected one copy of the damaged file, found {copies:?}");
        let copy = sandbox.vault().join("notes").join("sample").join(&copies[0]);
        assert_eq!(fs::read_to_string(copy).expect("read copy"), TRUNCATED);
    }

    #[test]
    fn the_same_damaged_file_is_copied_only_once() {
        let sandbox = Sandbox::new();
        sandbox.write(VOCAB_FILE, TRUNCATED);

        for _ in 0..3 {
            save_vocabulary_term("sample", entry("labour")).expect_err("save must fail");
        }

        assert_eq!(corrupt_copies(&sandbox).len(), 1, "one damaged file must give one copy");
    }

    #[test]
    fn a_byte_order_mark_keeps_the_saved_terms() {
        let sandbox = Sandbox::new();
        sandbox.write(VOCAB_FILE, &format!("\u{feff}{ONE_TERM}"));

        save_vocabulary_term("sample", entry("labour")).expect("a file with a byte order mark must save");

        assert_eq!(saved_words("sample"), vec!["pin", "labour"], "the old term must stay");
    }

    #[test]
    fn a_missing_saved_at_keeps_the_saved_terms() {
        let sandbox = Sandbox::new();
        sandbox.write(VOCAB_FILE, r#"[{"word":"pin","definition":"a small metal pin","anchor":"^p-001"}]"#);

        save_vocabulary_term("sample", entry("labour")).expect("a term without savedAt must save");

        let saved = get_book_vocabulary("sample").expect("read vocabulary back");
        assert_eq!(saved.len(), 2, "the old term must stay");
        assert_eq!(saved[0].saved_at, "", "an unknown save time reads as empty");
    }

    #[test]
    fn a_snake_case_saved_at_keeps_its_value() {
        let sandbox = Sandbox::new();
        sandbox.write(
            VOCAB_FILE,
            r#"[{"word":"pin","definition":"a small metal pin","anchor":"^p-001","saved_at":"2026-09-14T00:00:00Z"}]"#,
        );

        let saved = get_book_vocabulary("sample").expect("read vocabulary back");
        assert_eq!(saved[0].saved_at, "2026-09-14T00:00:00Z", "the save time must not be dropped");
    }

    /// A word saved before the app kept the chapter of a word still reads, and keeps its place (RD-04).
    #[test]
    fn a_term_saved_without_a_chapter_reads_as_an_empty_chapter() {
        let sandbox = Sandbox::new();
        sandbox.write(
            VOCAB_FILE,
            r#"[{"word":"pin","definition":"a small metal pin","anchor":"^p-001","savedAt":"2026-09-14T00:00:00Z"}]"#,
        );

        save_vocabulary_term("sample", entry("labour")).expect("a term without a chapter must save");

        let saved = get_book_vocabulary("sample").expect("read vocabulary back");
        assert_eq!(saved.len(), 2, "the old term must stay");
        assert_eq!(saved[0].chapter_file, "", "an unknown chapter reads as empty");
        assert_eq!(saved[0].anchor, "^p-001", "the anchor of the old term must not be dropped");
        assert_eq!(saved[1].chapter_file, "ch-01.md", "a new term keeps its chapter");
    }

    #[test]
    fn a_good_file_still_adds_and_updates_terms() {
        let _sandbox = Sandbox::new();

        save_vocabulary_term("sample", entry("pin")).expect("first save");
        save_vocabulary_term("sample", entry("labour")).expect("second save");

        let mut changed = entry("Pin");
        changed.definition = "a changed definition".to_string();
        save_vocabulary_term("sample", changed).expect("update save");

        let saved = get_book_vocabulary("sample").expect("read vocabulary back");
        assert_eq!(saved.len(), 2, "the same word must not be added twice");
        assert_eq!(saved[0].definition, "a changed definition");
    }

    #[test]
    fn a_missing_file_reads_as_no_terms() {
        let _sandbox = Sandbox::new();
        assert!(get_book_vocabulary("sample").expect("missing file is not an error").is_empty());
    }
}
