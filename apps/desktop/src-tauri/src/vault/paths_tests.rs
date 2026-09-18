//! Tests for `paths.rs`: the rules for the names that the page sends, and the vault paths made from them (SEC-03).

use crate::db::{backfill_vault_blocking, restore_progress_blocking};
use crate::test_support::Sandbox;
use crate::vault::bookmark::last_bookmark;
use crate::vault::paths::{
    chapter_highlights_path, chapter_notes_path, chapter_path, check_book_id, check_chapter_file, check_notes_file,
    check_topic_id, notes_file, topic_path, topic_report_path,
};
use crate::vault::study_log::books_with_notes;
use crate::vault::topic_id_from_title;

/// Names that a path gives a meaning to, and names with a character that no book id or topic id has.
fn names_that_are_no_id() -> Vec<String> {
    let mut names: Vec<String> = [
        "",
        ".",
        "..",
        "../sample",
        "..\\sample",
        "sample/..",
        "a/b",
        "a\\b",
        "/sample",
        "\\sample",
        "C:\\Windows\\win.ini",
        "C:",
        "c:sample",
        "\\\\?\\C:\\vault",
        "\\\\server\\share",
        "Sample",
        "a b",
        "a.b",
        "-sample",
        "sample\0",
        "sample\n",
        "caf\u{e9}",
    ]
    .iter()
    .map(|name| name.to_string())
    .collect();
    names.push("a".repeat(256));
    names
}

#[test]
fn every_book_id_the_importer_makes_is_a_book_id() {
    let ids = [
        // The books in the vault today.
        "sample",
        "wealth-of-nations",
        "principles-of-marketing-19ed",
        "dalton-j-mind-over-markets-power-trading-with-market-generated-information-updated-edition",
        // A PDF with no name to use, and EPUB file names, which keep `_`.
        "unnamed-book",
        "my_book",
        "_private",
    ];
    for id in ids {
        assert!(check_book_id(id).is_ok(), "{id} must be a book id");
    }
    assert!(
        check_book_id(&"a".repeat(255)).is_ok(),
        "a folder name can have 255 characters"
    );
}

#[test]
fn a_name_that_could_leave_its_folder_is_no_book_id_and_no_topic_id() {
    for name in names_that_are_no_id() {
        assert!(check_book_id(&name).is_err(), "{name:?} must not be a book id");
        assert!(check_topic_id(&name).is_err(), "{name:?} must not be a topic id");
    }
}

#[test]
fn every_topic_id_the_app_makes_is_a_topic_id() {
    for title in [
        "Division of Labor",
        "Is Capitalism Fair?",
        "\u{dc}ber Arbeit 2",
        "__Private__",
    ] {
        let id = topic_id_from_title(title);
        assert!(
            check_topic_id(&id).is_ok(),
            "the id {id:?} of the title {title:?} must be a topic id"
        );
    }
    assert!(
        check_topic_id("topic-1").is_ok(),
        "the id of a title with no letter or digit"
    );
}

#[test]
fn a_chapter_file_is_named_as_the_importer_names_chapters() {
    for name in ["ch-01.md", "ch-37.md", "ch-100.md"] {
        assert!(check_chapter_file(name).is_ok(), "{name} must be a chapter file");
    }
    let refused = [
        "",
        "ch-1.md",
        "ch-01",
        "ch-01.MD",
        "CH-01.md",
        "ch-01.md.bak",
        "ch-01-notes.md",
        "ch-ab.md",
        "ch-.md",
        "_meta.json",
        "../ch-01.md",
        "ch-01.md/../../x.md",
        "sub/ch-01.md",
        "C:\\ch-01.md",
        " ch-01.md",
        "ch-01.md\0",
        "ch-\u{661}\u{662}.md",
    ];
    for name in refused {
        assert!(check_chapter_file(name).is_err(), "{name:?} must not be a chapter file");
    }
}

#[test]
fn a_notes_file_is_the_notes_file_of_a_chapter() {
    for name in ["ch-01-notes.md", "ch-100-notes.md"] {
        assert!(check_notes_file(name).is_ok(), "{name} must be a notes file");
    }
    let refused = [
        "",
        "ch-01.md",
        "summary-export.md",
        "practice-deck.md",
        "analytical.json",
        "bookmark.json",
        "ch-1-notes.md",
        "../ch-01-notes.md",
        "ch-01-notes.md/..",
        "C:\\ch-01-notes.md",
        "ch-01-notes.markdown",
    ];
    for name in refused {
        assert!(check_notes_file(name).is_err(), "{name:?} must not be a notes file");
    }
}

/// A path keeps the form the vault folder was found in, so a path that the app shows, such as the place of an exported
/// summary, does not change. A folder that is not there yet is still in the vault.
#[test]
fn a_path_in_the_vault_keeps_the_form_of_the_vault_folder() {
    let sandbox = Sandbox::new();
    let notes = sandbox.vault().join("notes").join("sample");
    let syntopicon = sandbox.vault().join("syntopicon");

    let path = |made: anyhow::Result<std::path::PathBuf>| made.expect("a path in the vault");
    assert_eq!(
        path(chapter_path("sample", "ch-01.md")),
        sandbox.vault().join("books").join("sample").join("ch-01.md")
    );
    assert_eq!(
        path(chapter_notes_path("sample", "ch-01-notes.md")),
        notes.join("ch-01-notes.md")
    );
    assert_eq!(
        path(chapter_highlights_path("sample", "ch-01.md")),
        notes.join("ch-01-highlights.json")
    );
    assert_eq!(path(notes_file("sample", "bookmark.json")), notes.join("bookmark.json"));
    assert_eq!(
        path(topic_path("division-of-labor")),
        syntopicon.join("topics").join("division-of-labor.json")
    );
    assert_eq!(
        path(topic_report_path("division-of-labor")),
        syntopicon.join("reports").join("division-of-labor-synthesis.md")
    );
}

/// A notes folder whose name is no book id is no book to the jobs that read every book: the copy of an older cache into
/// the vault, the restore at startup, and the newest bookmark. So it cannot stop them for the other books.
#[test]
fn a_notes_folder_whose_name_is_no_book_id_does_not_stop_the_jobs_that_read_every_book() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    sandbox.write(
        "notes/sample/bookmark.json",
        r#"{"chapterFile":"ch-01.md","savedAt":"2026-09-16T10:00:00.000Z"}"#,
    );
    sandbox.write(
        "notes/Old Notes/bookmark.json",
        r#"{"chapterFile":"ch-01.md","savedAt":"2026-09-17T10:00:00.000Z"}"#,
    );

    assert_eq!(books_with_notes().expect("list the books with notes"), ["sample"]);
    backfill_vault_blocking().expect("the copy of an older cache must run");
    restore_progress_blocking().expect("the restore must run");
    let newest = last_bookmark().expect("find the newest bookmark").expect("a bookmark");
    assert_eq!(newest.book_id, "sample");
}

/// A notes folder that is a link is no book to those jobs either, so they never write through the link.
#[cfg(windows)]
#[test]
fn a_notes_folder_that_is_a_link_is_no_book_to_the_jobs_that_read_every_book() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    let outside = sandbox.vault().parent().expect("the sandbox folder").join("outside");
    std::fs::create_dir_all(&outside).expect("create the folder outside the vault");
    let linked = sandbox.vault().join("notes").join("linked");
    crate::test_support::junction(&linked, &outside);

    let books = books_with_notes();
    let copied = backfill_vault_blocking();

    // The junction goes first, so the sandbox clean-up never reaches the folder it points at.
    std::fs::remove_dir(&linked).expect("remove a junction");
    assert_eq!(books.expect("list the books with notes"), ["sample"]);
    copied.expect("the copy of an older cache must run");
}
