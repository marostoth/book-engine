//! Finds the vault folder, and remembers the one the reader picked.
//!
//! The vault used to be found only through the `BOOK_ENGINE_VAULT` variable or by searching up from the
//! working folder. An installer starts the app in its own install folder, so an installed copy found
//! nothing and every read and write failed (LC-01). Only a dev run from the repository worked.
//!
//! The order is now:
//!
//! 1. the folder the reader picked, saved in `%APPDATA%\book-engine\settings.json`;
//! 2. the `BOOK_ENGINE_VAULT` variable, for a run from a script;
//! 3. `vault` next to the program, and next to its parent folder, for a copy carried on a stick;
//! 4. `vault` up to six folders above the working folder, which is the dev run from the repository.
//!
//! A folder counts as a vault only when it has a `books` folder inside. The reader can point the app at a
//! folder that is not a vault, and a folder that is only nearly right must not be taken: the app would
//! then look empty and every save would go to the wrong place.

use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

/// What the app remembers between runs.
#[derive(Debug, Default, Serialize, Deserialize)]
struct Settings {
    /// The vault folder the reader picked, if they have picked one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    vault_path: Option<String>,
}

/// How the vault folder was found, for the message the reader sees.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FoundBy {
    /// The folder the reader picked.
    Saved,
    /// The `BOOK_ENGINE_VAULT` variable.
    Variable,
    /// A `vault` folder beside the program.
    NextToTheProgram,
    /// A `vault` folder at or above the working folder.
    NearTheWorkingFolder,
}

/// The settings file, in the same folder as the cache.
#[cfg(not(test))]
fn settings_file() -> Result<PathBuf> {
    let cache = crate::db::schema::get_db_path()?;
    let folder = cache
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| anyhow!("The application data folder has no parent"))?;
    std::fs::create_dir_all(folder).with_context(|| format!("Failed to create {}", folder.display()))?;
    Ok(folder.join("settings.json"))
}

/// Test builds keep the settings inside the active sandbox.
#[cfg(test)]
fn settings_file() -> Result<PathBuf> {
    crate::test_support::settings_path()
}

fn read_settings() -> Settings {
    let Ok(path) = settings_file() else {
        return Settings::default();
    };
    let Ok(text) = std::fs::read_to_string(&path) else {
        return Settings::default();
    };
    // A settings file that cannot be read is not worth stopping for: the search below still finds a vault
    // beside the program or above the working folder, and picking a folder writes the file again.
    serde_json::from_str(&text).unwrap_or_else(|err| {
        eprintln!(
            "Warning: {} could not be read ({err}), so no saved vault folder is used.",
            path.display()
        );
        Settings::default()
    })
}

fn write_settings(settings: &Settings) -> Result<()> {
    let path = settings_file()?;
    let text = serde_json::to_string_pretty(settings).context("Failed to write the settings")?;
    super::safe_write::write_file(&path, text)
}

/// True when `folder` holds a vault: a folder with `books` inside it.
pub fn is_vault(folder: &Path) -> bool {
    folder.is_dir() && folder.join("books").is_dir()
}

/// The folder the reader picked, when it is still a vault.
fn saved_vault() -> Option<PathBuf> {
    let saved = PathBuf::from(read_settings().vault_path?);
    if is_vault(&saved) {
        return Some(saved);
    }
    eprintln!(
        "Warning: the saved vault folder {} is gone or is not a vault any more.",
        saved.display()
    );
    None
}

/// `folder`, when it is a vault.
#[cfg(not(test))]
fn searched_vault(folder: PathBuf) -> Option<PathBuf> {
    is_vault(&folder).then_some(folder)
}

/// Test builds take only a vault inside the active sandbox. The tests run inside the repository, so the
/// search would otherwise find the real vault above the working folder (DS-10).
#[cfg(test)]
fn searched_vault(folder: PathBuf) -> Option<PathBuf> {
    (crate::test_support::is_inside_sandbox(&folder) && is_vault(&folder)).then_some(folder)
}

/// `vault` beside the program, and beside the folder above it.
fn vault_near_the_program() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let beside = exe.parent()?;
    for folder in [beside, beside.parent()?] {
        if let Some(vault) = searched_vault(folder.join("vault")) {
            return Some(vault);
        }
    }
    None
}

/// `vault` at or above the working folder, up to six levels. This is the dev run from the repository.
fn vault_near_the_working_folder() -> Option<PathBuf> {
    let mut current = std::env::current_dir().ok()?;
    for _ in 0..6 {
        if let Some(vault) = searched_vault(current.join("vault")) {
            return Some(vault);
        }
        if !current.pop() {
            break;
        }
    }
    None
}

/// The vault folder and how it was found, or `None` when there is none to find.
pub fn locate_vault() -> Option<(PathBuf, FoundBy)> {
    if let Some(folder) = saved_vault() {
        return Some((folder, FoundBy::Saved));
    }
    if let Ok(from_variable) = std::env::var("BOOK_ENGINE_VAULT") {
        if let Some(folder) = searched_vault(PathBuf::from(from_variable)) {
            return Some((folder, FoundBy::Variable));
        }
    }
    if let Some(folder) = vault_near_the_program() {
        return Some((folder, FoundBy::NextToTheProgram));
    }
    vault_near_the_working_folder().map(|folder| (folder, FoundBy::NearTheWorkingFolder))
}

/// The message shown when no vault can be found.
pub fn not_found_message() -> String {
    "Your vault folder was not found. Choose it in the app: it is the folder that has a \"books\" folder \
     inside it."
        .to_string()
}

/// Saves the folder the reader picked, after checking that it really is a vault.
///
/// A folder with no `books` inside is refused. Taking it would make the app look empty and send every save
/// to the wrong place, and the reader would think their books were gone (LC-01).
pub fn remember_vault(folder: &Path) -> Result<PathBuf> {
    if !folder.is_dir() {
        return Err(anyhow!("{} is not a folder.", folder.display()));
    }
    if !is_vault(folder) {
        return Err(anyhow!(
            "{} is not a vault folder. A vault has a \"books\" folder inside it, with one folder per book. \
             Choose the folder that holds \"books\".",
            folder.display()
        ));
    }
    let folder = std::fs::canonicalize(folder)
        .with_context(|| format!("Failed to read the full path of {}", folder.display()))?;

    let mut settings = read_settings();
    settings.vault_path = Some(folder.to_string_lossy().to_string());
    write_settings(&settings)
        .with_context(|| format!("Failed to remember {} as your vault folder", folder.display()))?;
    Ok(folder)
}

/// Forgets the saved folder, so the search starts again from the beginning.
pub fn forget_vault() -> Result<()> {
    let mut settings = read_settings();
    settings.vault_path = None;
    write_settings(&settings)
}
