use anyhow::{Context, Result};
use std::fs;
use super::models::VocabularyEntry;
use super::reader::find_vault_root;

/// Returns all saved vocabulary terms for the specified book from `vault/notes/<book-id>/vocabulary.json`.
pub fn get_book_vocabulary(book_id: &str) -> Result<Vec<VocabularyEntry>> {
    let vault = find_vault_root()?;
    let vocab_file = vault.join("notes").join(book_id).join("vocabulary.json");

    if !vocab_file.exists() {
        return Ok(Vec::new());
    }

    let raw = fs::read_to_string(&vocab_file)
        .with_context(|| format!("Failed to read vocabulary file: {}", vocab_file.display()))?;

    let entries: Vec<VocabularyEntry> = serde_json::from_str(&raw)
        .with_context(|| format!("Failed to parse vocabulary JSON: {}", vocab_file.display()))?;

    Ok(entries)
}

/// Appends or updates a vocabulary term in `vault/notes/<book-id>/vocabulary.json`.
/// Applies case-insensitive deduplication: if the term already exists, updates definition,
/// anchor, and savedAt in place.
pub fn save_vocabulary_term(book_id: &str, entry: VocabularyEntry) -> Result<()> {
    let vault = find_vault_root()?;
    let notes_dir = vault.join("notes").join(book_id);

    if !notes_dir.exists() {
        fs::create_dir_all(&notes_dir)
            .with_context(|| format!("Failed to create notes dir: {}", notes_dir.display()))?;
    }

    let vocab_file = notes_dir.join("vocabulary.json");
    let mut entries: Vec<VocabularyEntry> = if vocab_file.exists() {
        match fs::read_to_string(&vocab_file) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    } else {
        Vec::new()
    };

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

    fs::write(&vocab_file, serialized)
        .with_context(|| format!("Failed to write vocabulary file: {}", vocab_file.display()))?;

    Ok(())
}
