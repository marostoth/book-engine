//! One safe way to write a file into the vault.
//!
//! A plain `fs::write` empties the file first and then fills it. A crash, a closed laptop, or a
//! power cut in between leaves a cut-off or empty file, and a cut-off `_meta.json` makes the book
//! disappear (DS-03). So every vault write goes to a temporary file in the same folder, is flushed
//! to the disk, and is then renamed over the target. A rename is one step, so a reader finds
//! either the whole old file or the whole new file, never something in between.

use anyhow::{anyhow, Context, Result};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

/// A rename fails while another program holds the file open, for example the OneDrive client or a
/// virus scanner. A few short waits turn that into a saved file instead of a lost save.
const RENAME_TRIES: u32 = 4;
const RENAME_WAIT: Duration = Duration::from_millis(25);

/// Keeps two saves that run at the same moment on different temporary names.
static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

/// Writes `bytes` to `path` in one step, creating the folder when it is not there yet.
///
/// At every moment the file at `path` is either the whole old file or the whole new file.
pub fn write_file(path: &Path, bytes: impl AsRef<[u8]>) -> Result<()> {
    let dir = path
        .parent()
        .ok_or_else(|| anyhow!("{} has no folder", path.display()))?;
    fs::create_dir_all(dir).with_context(|| format!("Failed to create folder: {}", dir.display()))?;

    let temp = temp_path(path);
    if let Err(err) = write_and_flush(&temp, bytes.as_ref()) {
        let _ = fs::remove_file(&temp);
        return Err(err).with_context(|| format!("Failed to write {}", path.display()));
    }

    if let Err(err) = rename_over(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(err).with_context(|| format!("Failed to write {}", path.display()));
    }

    Ok(())
}

/// A temporary name in the same folder as the target, so the rename stays on the same disk.
fn temp_path(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let id = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
    path.with_file_name(format!(".{name}.saving-{}-{id}", std::process::id()))
}

/// Writes the whole file and waits until the disk has it, so the rename can never publish
/// bytes that are still only in memory.
fn write_and_flush(temp: &Path, bytes: &[u8]) -> Result<()> {
    let mut file = File::create(temp).with_context(|| format!("Failed to create {}", temp.display()))?;
    file.write_all(bytes)
        .with_context(|| format!("Failed to fill {}", temp.display()))?;
    file.sync_all()
        .with_context(|| format!("Failed to flush {} to the disk", temp.display()))?;
    Ok(())
}

fn rename_over(temp: &Path, path: &Path) -> Result<()> {
    let mut last = None;
    for attempt in 0..RENAME_TRIES {
        match fs::rename(temp, path) {
            Ok(()) => return Ok(()),
            Err(err) => {
                last = Some(err);
                if attempt + 1 < RENAME_TRIES {
                    std::thread::sleep(RENAME_WAIT);
                }
            }
        }
    }
    Err(last.expect("the loop runs at least once")).context("the file may be open in another program")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::Sandbox;

    fn names_in(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .expect("read folder")
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn a_write_creates_the_folder_and_the_file() {
        let sandbox = Sandbox::new();
        let path = sandbox.vault().join("notes").join("sample").join("new.md");

        write_file(&path, "hello").expect("write a new file");

        assert_eq!(fs::read_to_string(&path).expect("read back"), "hello");
        assert_eq!(
            names_in(path.parent().expect("folder")),
            vec!["new.md"],
            "no temporary file may stay"
        );
    }

    #[test]
    fn a_second_write_replaces_the_file_and_leaves_nothing_behind() {
        let sandbox = Sandbox::new();
        let path = sandbox.vault().join("notes").join("sample").join("new.md");

        write_file(&path, "first").expect("first write");
        write_file(&path, "second").expect("second write");

        assert_eq!(fs::read_to_string(&path).expect("read back"), "second");
        assert_eq!(
            names_in(path.parent().expect("folder")),
            vec!["new.md"],
            "no temporary file may stay"
        );
    }

    #[test]
    fn a_failed_write_keeps_the_old_file_and_leaves_nothing_behind() {
        let sandbox = Sandbox::new();
        let dir = sandbox.vault().join("notes").join("sample");
        let path = dir.join("busy.md");
        fs::create_dir_all(&path).expect("make a folder where the file should be");

        let error = write_file(&path, "this cannot replace a folder").expect_err("the write must fail");

        assert!(
            error.to_string().contains("busy.md"),
            "the error must name the file: {error}"
        );
        assert!(path.is_dir(), "what was there must still be there");
        assert_eq!(
            names_in(&dir),
            vec!["busy.md"],
            "no temporary file may stay after a failed write"
        );
    }

    #[test]
    fn two_writes_at_the_same_time_do_not_share_a_temporary_name() {
        let sandbox = Sandbox::new();
        let path = sandbox.vault().join("notes").join("sample").join("new.md");
        assert_ne!(
            temp_path(&path),
            temp_path(&path),
            "each write needs its own temporary name"
        );
    }
}
