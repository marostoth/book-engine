//! Test sandbox: gives each unit test its own temporary vault and cache database.
//!
//! In test builds, `vault::find_vault_root` and `db::get_db_path` resolve paths only
//! through this module. Without an active sandbox they return an error, so a unit test
//! can never read or write the real vault or the real AppData cache. The vault search in
//! `vault/locate.rs` takes only a folder inside the sandbox (`is_inside_sandbox`), so it
//! never finds the real vault above the working folder either.
//! Integration tests (`tests/`) and doc tests do not get this guard.

use std::cell::RefCell;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use anyhow::{anyhow, Result};

use crate::db::card_identity::card_identity;

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
        self.write_sample_deck(1, 1);
        self.write("notes/sample/ch-01-notes.md", SAMPLE_NOTES);
    }

    /// Writes the `sample` practice deck with `clozes` cloze cards and `scenarios` scenario cards.
    /// Every card asks its own question; `cloze_card_id` and `scenario_card_id` give their stored ids.
    pub(crate) fn write_sample_deck(&self, clozes: usize, scenarios: usize) {
        let mut deck = String::from(SAMPLE_DECK_TITLE);
        for n in 1..=clozes {
            deck.push_str(&sample_card(SAMPLE_CLOZE_CARD, SAMPLE_CLOZE_QUESTION, n));
        }
        for n in 1..=scenarios {
            deck.push_str(&sample_card(SAMPLE_SCENARIO_CARD, SAMPLE_SCENARIO_QUESTION, n));
        }
        self.write("notes/sample/practice-deck.md", &deck);
    }

    /// Stored id of cloze card `n` from `write_sample_deck`.
    pub(crate) fn cloze_card_id(&self, n: usize) -> String {
        card_identity("sample", "cloze", &sample_question(SAMPLE_CLOZE_QUESTION, n), "division of labour")
    }

    /// Stored id of scenario card `n` from `write_sample_deck`.
    pub(crate) fn scenario_card_id(&self, n: usize) -> String {
        card_identity(
            "sample",
            "scenario",
            &sample_question(SAMPLE_SCENARIO_QUESTION, n),
            "(A) Output per worker rises.",
        )
    }

    /// Writes the `sample` practice deck with the given cloze cards: (deck id, (cloze text, answer key)).
    pub(crate) fn write_cloze_deck(&self, cards: &[(&str, (&str, &str))]) {
        let mut deck = String::from(SAMPLE_DECK_TITLE);
        for (deck_id, (cloze, answer)) in cards {
            deck.push_str(&format!(
                "\n### {deck_id}\n- **Chapter:** ch-01\n- **Anchor:** ^p-001\n- **Cloze:** {cloze}\n- **Answer Key:** ``{answer}``\n"
            ));
        }
        self.write("notes/sample/practice-deck.md", &deck);
    }

    /// Runs `work` on a new thread that uses this sandbox, for tests where two database users
    /// work at the same time. Join the thread before the sandbox is dropped.
    pub(crate) fn spawn<T: Send + 'static>(
        &self,
        work: impl FnOnce() -> T + Send + 'static,
    ) -> std::thread::JoinHandle<T> {
        let root = self.root.clone();
        std::thread::spawn(move || {
            ACTIVE_ROOT.with(|active| *active.borrow_mut() = Some(root));
            work()
        })
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

/// True when `path` is inside the active sandbox and does not climb out of it with `..`.
/// With no active sandbox, nothing is inside one.
pub(crate) fn is_inside_sandbox(path: &Path) -> bool {
    active_root().is_ok_and(|root| {
        path.starts_with(&root) && !path.components().any(|part| part == Component::ParentDir)
    })
}

/// Settings file path in test builds.
pub(crate) fn settings_path() -> Result<PathBuf> {
    Ok(active_root()?.join("settings.json"))
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

const SAMPLE_DECK_TITLE: &str = "# Practice Deck: Sandbox Economics\n";

const SAMPLE_CLOZE_QUESTION: &str = "The {{c1::division of labour}} raises the productive powers of work.";
const SAMPLE_SCENARIO_QUESTION: &str = "A workshop splits pin making into separate steps. What follows?";

/// Card `n` asks its own question: cards after the first get a label.
/// Card 1 keeps the text in src/lib/practiceContract.json.
fn sample_question(question: &str, n: usize) -> String {
    if n == 1 {
        question.to_string()
    } else {
        format!("Card {n:03}: {question}")
    }
}

/// Fills in a card template: `{n}` is the card number (`001`) and `{question}` is the card's question.
fn sample_card(template: &str, question: &str, n: usize) -> String {
    template.replace("{n}", &format!("{n:03}")).replace("{question}", &sample_question(question, n))
}

const SAMPLE_CLOZE_CARD: &str = r#"
### card-ch-01-{n}
- **Chapter:** ch-01
- **Anchor:** ^p-001
- **Cloze:** {question}
- **Answer Key:** ``division of labour``
"#;

const SAMPLE_SCENARIO_CARD: &str = r#"
### Scenario: sc-ch-01-{n}
- **Chapter:** ch-01
- **Anchor:** ^p-001
**Scenario:** {question}
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
    use super::{is_inside_sandbox, Sandbox};
    use crate::db::get_db_path;
    use crate::vault::find_vault_root;
    use crate::vault::locate::locate_vault;

    #[test]
    fn paths_fail_without_a_sandbox() {
        assert!(find_vault_root().is_err(), "tests must never resolve the real vault");
        assert!(get_db_path().is_err(), "tests must never resolve the real cache database");
        assert_eq!(locate_vault(), None, "tests must never find the real vault");
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

    #[test]
    fn only_a_path_inside_the_active_sandbox_is_inside_it() {
        let working_folder = std::env::current_dir().expect("working folder");
        assert!(!is_inside_sandbox(&working_folder), "with no sandbox, nothing is inside one");

        let sandbox = Sandbox::new();
        assert!(is_inside_sandbox(&sandbox.vault().join("books")));
        assert!(!is_inside_sandbox(&working_folder), "the repository is outside the sandbox");
        assert!(
            !is_inside_sandbox(sandbox.root.parent().expect("temporary folder")),
            "the folder above the sandbox is outside it"
        );
        assert!(
            !is_inside_sandbox(&sandbox.vault().join("..").join("..")),
            "`..` must not climb out of the sandbox"
        );
    }
}
