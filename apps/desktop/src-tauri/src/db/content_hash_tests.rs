//! The hash that decides whether a chapter changed gives the same answer for ever (SI-06).
//!
//! The index saves a hash of every chapter it wrote, and skips that chapter next time when the text still gives the
//! same answer. The function that made it was called `md5_hash` and was not MD5: it was
//! `std::collections::hash_map::DefaultHasher`, which promises nothing about its output. The standard library may
//! change it in any release. The day it changed, every chapter of every book would be read and written again, in
//! silence, and the first run after a Rust update would simply be slow for no reason anyone could name.
//!
//! It is SHA-256 now, and the first test below pins it to a number published in FIPS 180-4. A future change to the
//! algorithm cannot pass that test quietly: it has to be a deliberate edit, and then every saved hash is stale and
//! every chapter really is read again once, which is what `SEARCH_ROWS_FORM` is for.

use crate::db::{index_vault_blocking, sha256_of, IndexSummary};
use crate::test_support::Sandbox;

/// The SHA-256 of "abc", from FIPS 180-4 appendix B.1. Every SHA-256 in the world gives this.
const SHA256_OF_ABC: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

/// The SHA-256 of the empty string, the other published vector.
const SHA256_OF_NOTHING: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

fn index() -> IndexSummary {
    index_vault_blocking().unwrap_or_else(|e| panic!("the index returned an error: {e:#}"))
}

/// Writes a book of one chapter, whose text is `text`.
fn write_chapter(sandbox: &Sandbox, text: &str) {
    sandbox.write(
        "books/smith/_meta.json",
        r#"{ "book_id": "smith", "title": "Book smith", "author": "Test Author",
             "spine": [ { "id": "ch-01", "title": "Chapter 1", "file_path": "ch-01.md", "order": 1 } ] }"#,
    );
    sandbox.write("books/smith/ch-01.md", &format!("{text}\n^p-001\n"));
}

#[test]
fn the_hash_is_the_sha_256_that_every_other_tool_gives() {
    assert_eq!(sha256_of("abc"), SHA256_OF_ABC, "this is not SHA-256 any more");
    assert_eq!(sha256_of(""), SHA256_OF_NOTHING, "this is not SHA-256 any more");
}

#[test]
fn the_hash_is_sixty_four_lower_case_hex_characters() {
    // It is saved in a TEXT column and compared as a string, so its shape must not drift either.
    let hash = sha256_of("The Wealth of Nations");
    assert_eq!(hash.len(), 64, "a SHA-256 in hex is 64 characters: {hash}");
    assert!(
        hash.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()),
        "the hash holds something that is not lower-case hex: {hash}"
    );
}

#[test]
fn the_same_text_always_gives_the_same_answer_and_other_text_does_not() {
    assert_eq!(sha256_of("the division of labour"), sha256_of("the division of labour"));
    assert_ne!(sha256_of("the division of labour"), sha256_of("the division of labor"));
    // One letter more, and one letter of case: a chapter edited in the smallest way is still seen as edited.
    assert_ne!(sha256_of("a rent of land"), sha256_of("a rent of lands"));
    assert_ne!(sha256_of("a rent of land"), sha256_of("A rent of land"));
}

#[test]
fn a_chapter_that_did_not_change_is_not_read_again() {
    // This is the whole reason the hash exists, and nothing tested it before.
    let sandbox = Sandbox::new();
    write_chapter(&sandbox, "The annual labour of every nation.");

    let first = index();
    assert_eq!(first.chapters_indexed, 1, "the first run did not read the chapter");

    let second = index();
    assert_eq!(
        second.chapters_indexed, 0,
        "a chapter nobody touched was read and written again, so the hash decided nothing"
    );
}

#[test]
fn a_chapter_that_changed_is_read_again() {
    let sandbox = Sandbox::new();
    write_chapter(&sandbox, "The annual labour of every nation.");
    index();

    write_chapter(&sandbox, "The annual labour of every nation supplies it.");
    let after = index();
    assert_eq!(
        after.chapters_indexed, 1,
        "an edited chapter was passed over, so the edit never reaches search"
    );
}
