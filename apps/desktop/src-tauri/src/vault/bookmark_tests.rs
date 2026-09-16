//! DS-11: where you stopped reading is kept in the vault, one small file per book.

use std::fs;
use std::path::PathBuf;

use crate::test_support::Sandbox;
use crate::vault::bookmark::{last_bookmark, load_bookmark, save_bookmark, BOOKMARK_FILE};

fn bookmark_file(sandbox: &Sandbox, book_id: &str) -> PathBuf {
    sandbox.vault().join("notes").join(book_id).join(BOOKMARK_FILE)
}

/// Writes a bookmark by hand, with a fixed time, as an earlier run of the app would have left it.
fn write_bookmark(sandbox: &Sandbox, book_id: &str, chapter_file: &str, saved_at: &str) {
    sandbox.write(
        &format!("notes/{book_id}/{BOOKMARK_FILE}"),
        &format!("{{\n  \"chapterFile\": \"{chapter_file}\",\n  \"anchor\": \"^p-004\",\n  \"savedAt\": \"{saved_at}\"\n}}"),
    );
}

#[test]
fn a_saved_place_comes_back() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();

    save_bookmark("sample", "ch-03.md", Some("^p-012")).expect("save the place");
    let place = load_bookmark("sample").expect("read the place").expect("a place was saved");

    assert_eq!(place.chapter_file, "ch-03.md", "the book must open at the chapter where the reader stopped");
    assert_eq!(place.anchor.as_deref(), Some("^p-012"), "and at the paragraph where they stopped");
    assert!(bookmark_file(&sandbox, "sample").exists(), "the place must be in the vault, next to the book's notes");
}

#[test]
fn a_book_the_reader_has_not_read_has_no_place() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();

    assert_eq!(load_bookmark("sample").expect("no file is not an error"), None);
    assert_eq!(last_bookmark().expect("no files are not an error"), None, "so the app opens the first book");
}

#[test]
fn a_place_with_no_paragraph_on_screen_saves_the_chapter_only() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();

    save_bookmark("sample", "ch-02.md", Some("  ")).expect("save the place");

    let place = load_bookmark("sample").expect("read").expect("saved");
    assert_eq!(place.chapter_file, "ch-02.md");
    assert_eq!(place.anchor, None, "a blank paragraph is no paragraph");
    let text = fs::read_to_string(bookmark_file(&sandbox, "sample")).expect("read the file");
    assert!(!text.contains("anchor"), "the file must not hold an empty paragraph: {text}");
}

#[test]
fn a_bookmark_needs_a_chapter() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();

    save_bookmark("sample", " ", Some("^p-001")).expect_err("a place with no chapter is not a place");
    assert!(!bookmark_file(&sandbox, "sample").exists(), "nothing may be written");
}

#[test]
fn the_newest_bookmark_names_the_book_to_open() {
    let sandbox = Sandbox::new();
    write_bookmark(&sandbox, "adler", "ch-07.md", "2026-09-15T08:00:00.000Z");
    write_bookmark(&sandbox, "hume", "ch-02.md", "2026-09-16T21:30:00.000Z");
    write_bookmark(&sandbox, "smith", "ch-11.md", "2026-09-16T09:15:00.000Z");

    let last = last_bookmark().expect("find the newest").expect("there are bookmarks");

    assert_eq!(last.book_id, "hume", "the book read last must open");
    assert_eq!(last.bookmark.chapter_file, "ch-02.md");
}

#[test]
fn reading_an_older_book_again_makes_it_the_book_to_open() {
    let sandbox = Sandbox::new();
    // Both times are in the past, so the save below is newer than either of them.
    write_bookmark(&sandbox, "adler", "ch-07.md", "2021-03-01T08:00:00.000Z");
    write_bookmark(&sandbox, "hume", "ch-02.md", "2021-03-02T21:30:00.000Z");

    save_bookmark("adler", "ch-08.md", Some("^p-001")).expect("the reader goes back to Adler");

    let last = last_bookmark().expect("find the newest").expect("there are bookmarks");
    assert_eq!(last.book_id, "adler");
    assert_eq!(last.bookmark.chapter_file, "ch-08.md");
}

#[test]
fn the_newest_bookmark_is_the_newest_moment_not_the_newest_text() {
    let sandbox = Sandbox::new();
    // 09:00 in UTC+2 is 07:00 UTC, which is earlier than 08:00 UTC, although the text sorts later.
    write_bookmark(&sandbox, "adler", "ch-01.md", "2026-09-16T08:00:00.000Z");
    write_bookmark(&sandbox, "hume", "ch-01.md", "2026-09-16T09:00:00.000+02:00");

    let last = last_bookmark().expect("find the newest").expect("there are bookmarks");
    assert_eq!(last.book_id, "adler");
}

#[test]
fn a_damaged_bookmark_is_kept_and_never_saved_over() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    let damaged = "{\"chapterFile\": \"ch-0";
    sandbox.write(&format!("notes/sample/{BOOKMARK_FILE}"), damaged);

    let error = load_bookmark("sample").expect_err("a damaged bookmark must not read as no bookmark");
    assert!(error.to_string().contains(BOOKMARK_FILE), "the error must name the file: {error}");

    save_bookmark("sample", "ch-02.md", Some("^p-003")).expect_err("a save must not write over it");
    assert_eq!(
        fs::read_to_string(bookmark_file(&sandbox, "sample")).expect("read the file"),
        damaged,
        "the damaged bytes must stay as they were"
    );
}

#[test]
fn a_damaged_bookmark_does_not_hide_the_other_books() {
    let sandbox = Sandbox::new();
    write_bookmark(&sandbox, "adler", "ch-07.md", "2026-09-15T08:00:00.000Z");
    sandbox.write(&format!("notes/hume/{BOOKMARK_FILE}"), "not a bookmark");
    write_bookmark(&sandbox, "smith", "ch-11.md", "2026-09-14T09:15:00.000Z");

    let last = last_bookmark().expect("a damaged file must not stop the search").expect("there are bookmarks");
    assert_eq!(last.book_id, "adler", "the newest bookmark that can be read wins");
}

#[test]
fn a_bookmark_with_a_time_that_cannot_be_read_is_passed_over() {
    let sandbox = Sandbox::new();
    write_bookmark(&sandbox, "adler", "ch-07.md", "2026-09-15T08:00:00.000Z");
    write_bookmark(&sandbox, "hume", "ch-02.md", "yesterday");

    let last = last_bookmark().expect("find the newest").expect("there are bookmarks");
    assert_eq!(last.book_id, "adler");
}
