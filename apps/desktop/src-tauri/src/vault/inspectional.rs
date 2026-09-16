//! Your answers at the inspectional level, kept with your notes: `vault/notes/<book-id>/inspectional.json`.
//!
//! The exit assessment used to be saved inside `vault/books/<book-id>/_meta.json`. The importer makes that file, so
//! importing the book again wrote `exit_assessment: null` over the reader's answers. A save for a book whose
//! `_meta.json` had no blueprint also wrote an empty blueprint into it, which hid the blueprint the app builds for
//! such a book (DS-09). The app now writes nothing into a file that the importer makes.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::json_store::read_json_file;
use super::models::ExitAssessmentPayload;
use super::reader::{find_vault_root, read_book_meta_json};
use super::safe_write::write_file;

/// The name of the file, in `vault/notes/<book-id>/`.
pub const INSPECTIONAL_FILE: &str = "inspectional.json";

/// What `inspectional.json` holds.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InspectionalFile {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    exit_assessment: Option<ExitAssessmentPayload>,
    /// Keys that a newer build saved, kept as they are.
    #[serde(flatten)]
    other: Map<String, Value>,
}

fn inspectional_path(book_id: &str) -> Result<PathBuf> {
    Ok(find_vault_root()?.join("notes").join(book_id).join(INSPECTIONAL_FILE))
}

/// The exit assessment of a book, or `None` when the reader has not written one. A damaged file gives an error and
/// is copied, never read as no assessment (DS-04).
///
/// An assessment that an older build saved inside `_meta.json` is copied into `inspectional.json` the first time it
/// is read, so the next import cannot take it away. `_meta.json` itself is not changed.
pub fn load_exit_assessment(book_id: &str) -> Result<Option<ExitAssessmentPayload>> {
    let path = inspectional_path(book_id)?;
    let file = read_json_file::<InspectionalFile>(&path)?;
    if let Some(assessment) = file.as_ref().and_then(|saved| saved.exit_assessment.clone()) {
        return Ok(Some(assessment));
    }
    let Some(older) = assessment_in_book_file(book_id) else {
        return Ok(None);
    };
    let mut file = file.unwrap_or_default();
    file.exit_assessment = Some(older.clone());
    if let Err(err) = write_inspectional_file(&path, &file) {
        eprintln!("Warning: the exit assessment of {book_id} is still only in _meta.json: {err:#}");
    }
    Ok(Some(older))
}

/// Saves the exit assessment of a book next to its notes. `_meta.json` is never written. A damaged
/// `inspectional.json` is kept as it is and stops the save (DS-04).
pub fn save_exit_assessment(book_id: &str, assessment: ExitAssessmentPayload) -> Result<()> {
    let path = inspectional_path(book_id)?;
    let mut file = read_json_file::<InspectionalFile>(&path)?.unwrap_or_default();
    file.exit_assessment = Some(assessment);
    write_inspectional_file(&path, &file)
}

fn write_inspectional_file(path: &Path, file: &InspectionalFile) -> Result<()> {
    let text = serde_json::to_string_pretty(file).context("Failed to write the inspectional answers as JSON")?;
    write_file(path, text)
}

/// An exit assessment that an older build saved in `_meta.json`, under `inspectional_blueprint.exit_assessment`.
/// A book file that cannot be read, or that holds no assessment in this shape, gives none.
fn assessment_in_book_file(book_id: &str) -> Option<ExitAssessmentPayload> {
    let text = read_book_meta_json(book_id).ok()?;
    let meta: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    let saved = meta.get("inspectional_blueprint")?.get("exit_assessment")?;
    serde_json::from_value(saved.clone()).ok()
}
