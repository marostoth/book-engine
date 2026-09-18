//! Tests for the vault writes in `reader.rs`: a save never leaves a half-written file behind.
//! The app no longer writes `_meta.json` at all; `inspectional_tests.rs` checks that (DS-09).

use crate::test_support::Sandbox;
use crate::vault::{
    read_book_meta_json, read_chapter_file, read_notes_file, scan_available_books, scan_library_books, write_notes_file,
};

const BOOK: &str = "sample";
const NOTES_FILE: &str = "ch-01-notes.md";

/// Names of the files next to the sample notes file.
fn files_next_to_the_notes(sandbox: &Sandbox) -> Vec<String> {
    let dir = sandbox.vault().join("notes").join(BOOK);
    let mut names: Vec<String> = std::fs::read_dir(&dir)
        .expect("read notes folder")
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    names.sort();
    names
}

#[test]
fn saved_notes_are_read_back_and_leave_no_temp_file_behind() {
    let sandbox = Sandbox::new();

    write_notes_file(BOOK, NOTES_FILE, "# Notes\n\n- first line\n").expect("first write");
    write_notes_file(BOOK, NOTES_FILE, "# Notes\n\n- second line\n").expect("second write");

    assert_eq!(
        read_notes_file(BOOK, NOTES_FILE).expect("read back"),
        "# Notes\n\n- second line\n"
    );
    assert_eq!(
        files_next_to_the_notes(&sandbox),
        vec![NOTES_FILE],
        "a finished save must leave only the file itself"
    );
}

/// While one thread saves the notes, another reads the file over and over. A save must be one
/// step: every read must find either the old notes or the new notes, never a cut-off file.
/// The test compares file sizes, because a plain write empties the file first and then grows it.
#[test]
fn a_reader_never_sees_a_half_written_notes_file() {
    let sandbox = Sandbox::new();
    let old = "# Notes\n\n- the notes that are already saved\n".to_string();
    write_notes_file(BOOK, NOTES_FILE, &old).expect("first write");

    // Big enough that the second save takes long enough for the reader to look many times.
    let new = "# Notes\n\n- a much longer set of notes\n".repeat(120_000);
    let (old_len, new_len) = (old.len() as u64, new.len() as u64);
    assert_ne!(old_len, new_len, "the two versions must have different sizes");

    let path = sandbox.vault().join("notes").join(BOOK).join(NOTES_FILE);
    let writer = sandbox.spawn(move || write_notes_file(BOOK, NOTES_FILE, &new).expect("second write"));

    let mut reads = 0u32;
    let mut cut_off: Vec<u64> = Vec::new();
    while !writer.is_finished() {
        if let Ok(meta) = std::fs::metadata(&path) {
            reads += 1;
            let len = meta.len();
            if len != old_len && len != new_len && !cut_off.contains(&len) {
                cut_off.push(len);
            }
        }
    }
    writer.join().expect("the writing thread");

    println!(
        "looked at the file {reads} times while it was saved; {} cut-off sizes seen",
        cut_off.len()
    );
    assert!(
        cut_off.is_empty(),
        "a reader saw a file that is neither the old notes ({old_len} bytes) nor the new notes ({new_len} bytes): {cut_off:?}"
    );
    assert_eq!(
        std::fs::metadata(&path).expect("final look").len(),
        new_len,
        "the new notes must be there when the save finishes"
    );
}

/// A book is known by the name of its folder, which every file read uses. The library used to take the `book_id` in
/// `_meta.json`, so a renamed folder was listed under a name that no file read could find (LC-02).
#[test]
fn a_renamed_book_folder_opens_under_its_folder_name() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    std::fs::rename(
        sandbox.vault().join("books/sample"),
        sandbox.vault().join("books/economics"),
    )
    .expect("rename the book folder");

    let library = scan_library_books().expect("read the library");
    let ids: Vec<&str> = library.iter().map(|book| book.id.as_str()).collect();
    assert_eq!(ids, ["economics"], "the library names the book by its folder");
    let listed: Vec<String> = scan_available_books()
        .expect("list the books")
        .into_iter()
        .map(|book| book.book_id)
        .collect();
    assert_eq!(listed, ["economics"], "list_books names it the same way");

    let chapter = read_chapter_file(ids[0], "ch-01.md").expect("the chapter opens under the name the library gives");
    assert!(chapter.contains("division of labour"));
    read_book_meta_json(ids[0]).expect("and so does its _meta.json");
}

/// On Windows the importer wrote chapters and notes with `\r\n` line endings. The reader finds paragraphs and footnotes
/// at `\n`, so it lost footnotes of such a chapter, and the notes preview showed the notes as one heading (IN-06).
#[test]
fn a_chapter_and_its_notes_are_read_with_unix_line_endings() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    let chapter =
        "# Chapter 1\n\nThe tide turns at noon.[^1] ^p-001\n\n[^1]: The port office prints the tide tables. ^p-002\n";
    let notes = "# Reflections: Chapter 1\n\n## Key Takeaways\n\n- \n";
    for (name, line_ending) in [("windows", "\r\n"), ("old mac", "\r")] {
        sandbox.write("books/sample/ch-01.md", &chapter.replace('\n', line_ending));
        sandbox.write("notes/sample/ch-01-notes.md", &notes.replace('\n', line_ending));

        assert_eq!(
            read_chapter_file(BOOK, "ch-01.md").expect("read the chapter"),
            chapter,
            "{name} line endings"
        );
        assert_eq!(
            read_notes_file(BOOK, NOTES_FILE).expect("read the notes"),
            notes,
            "{name} line endings"
        );
    }
}
