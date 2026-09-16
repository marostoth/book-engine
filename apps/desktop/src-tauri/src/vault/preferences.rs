//! Your reader settings, kept in the vault: `vault/preferences.json`.
//!
//! The settings used to live only in the browser storage of the app window, so a release build, a new PC or
//! a reinstall started from the default settings, and the reading theme was never kept at all (DS-11). In the
//! vault they go wherever the vault goes.
//!
//! The app owns the shape of the settings (`src/lib/preferences.ts`), so this module keeps whatever object it
//! is given, key for key. A setting this build does not know is kept, so an older build never drops what a
//! newer build saved.

use std::path::PathBuf;

use anyhow::{Context, Result};
use serde_json::{Map, Value};

use super::json_store::read_json_file;
use super::reader::find_vault_root;
use super::safe_write::write_file;

/// The settings file, at the top of the vault.
pub const PREFERENCES_FILE: &str = "preferences.json";

/// Reader settings: one JSON object, whose shape the app owns.
pub type Preferences = Map<String, Value>;

fn preferences_path() -> Result<PathBuf> {
    Ok(find_vault_root()?.join(PREFERENCES_FILE))
}

/// The saved settings, or `None` when none are saved yet. A file that is damaged, or that does not hold one
/// JSON object, gives an error and is copied, never read as no settings (DS-04).
pub fn load_preferences() -> Result<Option<Preferences>> {
    read_json_file(&preferences_path()?)
}

/// Saves the settings. A damaged settings file is kept as it is and stops the save.
pub fn save_preferences(preferences: &Preferences) -> Result<()> {
    let path = preferences_path()?;
    read_json_file::<Preferences>(&path)?;
    let text = serde_json::to_string_pretty(preferences).context("Failed to write the settings as JSON")?;
    write_file(&path, text)
}
