//! Test sandbox: gives each unit test its own temporary vault and cache database.
//!
//! In test builds, `vault::find_vault_root` and `db::get_db_path` resolve paths only
//! through this module. Without an active sandbox they return an error, so a unit test
//! can never read or write the real vault or the real AppData cache.
//! Integration tests (`tests/`) and doc tests do not get this guard.

use std::cell::RefCell;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

use anyhow::{anyhow, Result};

thread_local! {
    static ACTIVE_ROOT: RefCell<Option<PathBuf>> = const { RefCell::new(None) };
}

static NEXT_ID: AtomicUsize = AtomicUsize::new(0);

/// A temporary folder with `vault/` and `app_cache/`, active on the current test thread.
/// Dropping it deactivates the paths and deletes the folder.
pub(crate) struct Sandbox {
    root: PathBuf,
}

impl Sandbox {
    pub(crate) fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "book-engine-test-{}-{}",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::Relaxed)
        ));
        // A folder can survive from a crashed run that had the same process id.
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("vault").join("books")).expect("create sandbox vault");
        ACTIVE_ROOT.with(|active| {
            let mut active = active.borrow_mut();
            assert!(active.is_none(), "a test sandbox is already active on this thread");
            *active = Some(root.clone());
        });
        Sandbox { root }
    }

    pub(crate) fn vault(&self) -> PathBuf {
        self.root.join("vault")
    }

    /// Writes a file at a path relative to the sandbox vault, creating parent folders.
    pub(crate) fn write(&self, relative: &str, content: &str) {
        let path = self.vault().join(relative);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create sandbox folder");
        }
        std::fs::write(&path, content).expect("write sandbox file");
    }

    /// Writes the one-chapter book `sample` with a practice deck (1 cloze, 1 scenario) and chapter notes.
    pub(crate) fn write_sample_book(&self) {
        self.write("books/sample/_meta.json", SAMPLE_META);
        self.write("books/sample/ch-01.md", SAMPLE_CHAPTER);
        self.write("notes/sample/practice-deck.md", SAMPLE_DECK);
        self.write("notes/sample/ch-01-notes.md", SAMPLE_NOTES);
    }
}

impl Drop for Sandbox {
    fn drop(&mut self) {
        ACTIVE_ROOT.with(|active| *active.borrow_mut() = None);
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn active_root() -> Result<PathBuf> {
    ACTIVE_ROOT.with(|active| active.borrow().clone()).ok_or_else(|| {
        anyhow!("no test sandbox is active: create test_support::Sandbox before using the vault or the cache database")
    })
}

/// Vault root in test builds.
pub(crate) fn vault_root() -> Result<PathBuf> {
    Ok(active_root()?.join("vault"))
}

/// Cache database path in test builds.
pub(crate) fn db_path() -> Result<PathBuf> {
    let cache_dir = active_root()?.join("app_cache");
    std::fs::create_dir_all(&cache_dir)?;
    Ok(cache_dir.join("index.db"))
}

const SAMPLE_META: &str = r#"{
  "book_id": "sample",
  "title": "Sandbox Economics",
  "author": "Test Author",
  "total_words": 22,
  "total_chapters": 1,
  "spine": [
    { "id": "ch-01", "title": "Chapter 1: Division of Labour", "file_path": "ch-01.md", "order": 1 }
  ]
}"#;

const SAMPLE_CHAPTER: &str = r#"# Chapter 1: Division of Labour

The division of labour raises the productive powers of work. ^p-001

A pin maker working alone can make few pins in a day. ^p-002
"#;

const SAMPLE_DECK: &str = r#"# Practice Deck: Sandbox Economics

### card-ch-01-001
- **Chapter:** ch-01
- **Anchor:** ^p-001
- **Cloze:** The {{c1::division of labour}} raises the productive powers of work.
- **Answer Key:** ``division of labour``

### Scenario: sc-ch-01-001
- **Chapter:** ch-01
- **Anchor:** ^p-001
**Scenario:** A workshop splits pin making into separate steps. What follows?
- [x] (A) Output per worker rises.
- [ ] (B) Output per worker falls.
- [ ] (C) Output per worker stays the same.
> **Rationale:** The text states: "The division of labour raises the productive powers of work."
"#;

const SAMPLE_NOTES: &str = r#"# Notes: sample

## Key Reflections

- Specialization multiplies output (^p-001)
"#;

mod tests {
    use super::Sandbox;
    use crate::db::get_db_path;
    use crate::vault::find_vault_root;

    #[test]
    fn paths_fail_without_a_sandbox() {
        assert!(find_vault_root().is_err(), "tests must never resolve the real vault");
        assert!(get_db_path().is_err(), "tests must never resolve the real cache database");
    }

    #[test]
    fn paths_stay_inside_the_active_sandbox() {
        let sandbox = Sandbox::new();
        assert_eq!(find_vault_root().expect("sandbox vault"), sandbox.vault());
        let db = get_db_path().expect("sandbox database");
        assert!(db.starts_with(&sandbox.root), "database must live in the sandbox: {}", db.display());

        drop(sandbox);
        assert!(find_vault_root().is_err(), "paths must stop working when the sandbox ends");
    }
}
