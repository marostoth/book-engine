//! The book pictures that the app window may load (SEC-02).
//!
//! The reader shows the pictures of a chapter through Tauri's asset protocol. The app config used to let that protocol
//! open every file on the computer (`"scope": ["**"]`), so a script in the window could read any file. Now the config
//! lets it open no file. Each chapter load lets it open the picture folder of each book in the vault
//! (`books/<book>/assets`, where the importer writes the pictures), and nothing else.
//!
//! A book folder or a picture folder that is a link is left out. Tauri follows the link when it allows a folder, so a
//! link to another place would let the window open every file in that place.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use tauri::scope::fs::Scope;

/// The folder in each book that holds its pictures.
pub const PICTURE_FOLDER: &str = "assets";

/// The picture folder of each book in `vault`, `books/<book>/assets`, in name order. Only real folders count, never a
/// link, and a book with no picture folder has none.
pub fn book_picture_folders(vault: &Path) -> Result<Vec<PathBuf>> {
    let books = vault.join("books");
    let entries = std::fs::read_dir(&books).with_context(|| format!("Failed to read {}", books.display()))?;
    let mut folders = Vec::new();
    for entry in entries.flatten() {
        // `file_type` does not follow a link, so a book folder that is a link is not a folder here.
        if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            continue;
        }
        let pictures = entry.path().join(PICTURE_FOLDER);
        if std::fs::symlink_metadata(&pictures).is_ok_and(|meta| meta.is_dir()) {
            folders.push(pictures);
        }
    }
    folders.sort();
    Ok(folders)
}

/// Lets the window load the files in the picture folder of each book in the vault. A book that came into the vault
/// after the last chapter load gets its pictures with the next one.
pub fn allow_book_pictures(scope: &Scope) -> Result<()> {
    let vault = super::find_vault_root()?;
    for folder in book_picture_folders(&vault)? {
        scope
            .allow_directory(&folder, true)
            .with_context(|| format!("Failed to let the window load the pictures in {}", folder.display()))?;
    }
    Ok(())
}
