//! One safe way to read a JSON file from the vault.
//!
//! A damaged file must never read as empty data. If it did, the next save would write the
//! empty data back and every saved item would be gone (DS-04). So a damaged file gives an
//! error, and its bytes are first copied to `<file name>.corrupt-<time>`.

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use serde::de::DeserializeOwned;
use std::fs;
use std::path::{Path, PathBuf};

/// Byte order mark that some editors write at the start of a UTF-8 file. It carries no data,
/// so it is removed before parsing.
const BYTE_ORDER_MARK: char = '\u{feff}';

/// Reads and parses a JSON vault file.
///
/// Returns `Ok(None)` when the file does not exist, which callers read as "nothing saved yet".
/// A file that cannot be read gives an error. A file that cannot be parsed also gives an error,
/// and its bytes are kept in a copy named `<file name>.corrupt-<time>` next to it.
pub fn read_json_file<T: DeserializeOwned>(path: &Path) -> Result<Option<T>> {
    if !path.exists() {
        return Ok(None);
    }

    let bytes = fs::read(path).with_context(|| format!("Failed to read {}", path.display()))?;

    let damage = match std::str::from_utf8(&bytes) {
        Err(err) => format!("the file is not UTF-8 text ({err})"),
        Ok(raw) => {
            let text = raw.strip_prefix(BYTE_ORDER_MARK).unwrap_or(raw);
            match serde_json::from_str(text) {
                Ok(parsed) => return Ok(Some(parsed)),
                Err(err) => err.to_string(),
            }
        }
    };

    Err(match keep_damaged_copy(path, &bytes) {
        Ok(copy) => anyhow!(
            "{} is damaged and was left as it is: {}. A copy is at {}.",
            path.display(),
            damage,
            copy.display()
        ),
        Err(copy_err) => anyhow!(
            "{} is damaged and was left as it is: {}. The copy failed as well: {:#}.",
            path.display(),
            damage,
            copy_err
        ),
    })
}

/// Copies damaged bytes to `<file name>.corrupt-<time>` in the same folder and returns that path.
/// The same damaged bytes give one copy only, however many times the file is read.
fn keep_damaged_copy(path: &Path, bytes: &[u8]) -> Result<PathBuf> {
    let dir = path
        .parent()
        .ok_or_else(|| anyhow!("{} has no folder", path.display()))?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| anyhow!("{} has no file name", path.display()))?;
    let prefix = format!("{name}.corrupt-");

    let existing = fs::read_dir(dir).with_context(|| format!("Failed to read {}", dir.display()))?;
    for entry in existing.flatten() {
        let kept = entry.path();
        let is_copy = kept
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.starts_with(&prefix));
        if is_copy && fs::read(&kept).is_ok_and(|already| already == bytes) {
            return Ok(kept);
        }
    }

    let copy = dir.join(format!("{prefix}{}", Utc::now().format("%Y%m%dT%H%M%SZ")));
    super::safe_write::write_file(&copy, bytes)?;
    Ok(copy)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::Sandbox;

    #[derive(serde::Deserialize, PartialEq, Debug)]
    struct Note {
        text: String,
    }

    fn note_path(sandbox: &Sandbox) -> PathBuf {
        sandbox.vault().join("notes").join("sample").join("note.json")
    }

    #[test]
    fn a_missing_file_reads_as_nothing() {
        let sandbox = Sandbox::new();
        let read: Option<Note> = read_json_file(&note_path(&sandbox)).expect("missing is not an error");
        assert_eq!(read, None);
    }

    #[test]
    fn a_byte_order_mark_is_removed_before_parsing() {
        let sandbox = Sandbox::new();
        sandbox.write("notes/sample/note.json", "\u{feff}{\"text\":\"hello\"}");

        let read: Option<Note> = read_json_file(&note_path(&sandbox)).expect("a byte order mark must be allowed");
        assert_eq!(
            read,
            Some(Note {
                text: "hello".to_string()
            })
        );
    }

    #[test]
    fn a_damaged_file_gives_an_error_and_a_copy() {
        let sandbox = Sandbox::new();
        sandbox.write("notes/sample/note.json", "{\"text\":\"hel");

        let error = read_json_file::<Note>(&note_path(&sandbox)).expect_err("damaged must not parse");
        let message = error.to_string();
        assert!(message.contains("note.json"), "the error must name the file: {message}");
        assert!(
            message.contains("A copy is at"),
            "the error must name the copy: {message}"
        );

        let copy = message
            .rsplit("A copy is at ")
            .next()
            .expect("copy path")
            .trim_end_matches('.');
        assert_eq!(fs::read_to_string(copy).expect("read copy"), "{\"text\":\"hel");
    }

    #[test]
    fn bytes_that_are_not_text_are_damaged_too() {
        let sandbox = Sandbox::new();
        let path = note_path(&sandbox);
        fs::create_dir_all(path.parent().expect("folder")).expect("create folder");
        fs::write(&path, [0x7b, 0xff, 0xfe, 0x7d]).expect("write bytes");

        let error = read_json_file::<Note>(&path).expect_err("bytes that are not text must not parse");
        assert!(error.to_string().contains("not UTF-8 text"), "{error}");
    }
}
