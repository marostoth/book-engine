//! A book that leaves the vault leaves practice and analytics too (LC-02).
//!
//! The app knows a book by the name of its folder in `vault/books/`. A book has left the vault when that folder is
//! gone. A folder that is still there but has no `_meta.json` has not left: the library does not list it and it keeps
//! no search rows, because search is rebuilt from the book files, but its study progress stays (DS-19). A folder can
//! be half-arrived from a cloud client, hand-made, or left by an import that failed before IN-05, and none of those
//! may cost the reader their practice history. The index run (`indexer.rs`) finds the books that really left when the
//! app opens and on "Rescan library", and this module takes their study rows out of the cache:
//!
//! - Their practice cards move to `fsrs_cards_archive` with their progress. A card comes back with that progress when
//!   the book is back and its deck syncs (`deck_sync.rs`).
//! - Their review history and reading time leave the cache. The study log in `vault/notes/<book-id>/` keeps them
//!   (DS-01), and the restore at the next start puts them back when the book is back.
//!
//! Nothing in the vault changes. Before this, the rows stayed, so "All Books" analytics still counted a deleted book.

use std::collections::HashSet;

use anyhow::Result;
use rusqlite::{Connection, TransactionBehavior};

use super::deck_sync::{archive_cards_of_book, BOOK_NOT_IN_VAULT};

/// Takes the study rows of every book that is not in `books_in_vault` out of the cache. Gives the ids of those books.
pub fn set_aside_removed_books(conn: &mut Connection, books_in_vault: &HashSet<String>) -> Result<Vec<String>> {
    let removed = {
        let mut statement = conn.prepare(
            "SELECT book_id FROM fsrs_cards UNION SELECT book_id FROM review_logs UNION SELECT book_id FROM reading_sessions",
        )?;
        let mut removed = Vec::new();
        for book_id in statement.query_map([], |row| row.get::<_, String>(0))? {
            let book_id = book_id?;
            if !books_in_vault.contains(&book_id) {
                removed.push(book_id);
            }
        }
        removed
    };
    if removed.is_empty() {
        return Ok(removed);
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    for book_id in &removed {
        archive_cards_of_book(&tx, book_id, BOOK_NOT_IN_VAULT, now)?;
        tx.execute("DELETE FROM review_logs WHERE book_id = ?1", [book_id])?;
        tx.execute("DELETE FROM reading_sessions WHERE book_id = ?1", [book_id])?;
    }
    tx.commit()?;
    Ok(removed)
}
