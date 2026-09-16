//! Tests for the vault writes in `reader.rs`: a save never leaves a half-written file behind.
//! The app no longer writes `_meta.json` at all; `inspectional_tests.rs` checks that (DS-09).

use crate::test_support::Sandbox;
use crate::vault::{read_notes_file, write_notes_file};

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

    assert_eq!(read_notes_file(BOOK, NOTES_FILE).expect("read back"), "# Notes\n\n- second line\n");
    assert_eq!(files_next_to_the_notes(&sandbox), vec![NOTES_FILE], "a finished save must leave only the file itself");
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

    println!("looked at the file {reads} times while it was saved; {} cut-off sizes seen", cut_off.len());
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
