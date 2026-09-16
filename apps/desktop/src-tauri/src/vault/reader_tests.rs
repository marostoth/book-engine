//! Tests for the vault writes in `reader.rs`: a save never leaves a half-written file behind,
//! and rewriting `_meta.json` keeps the key order the file already had.

use crate::test_support::Sandbox;
use crate::vault::models::ExitAssessmentPayload;
use crate::vault::{read_notes_file, save_inspectional_exit_assessment, write_notes_file};

const BOOK: &str = "sample";
const NOTES_FILE: &str = "ch-01-notes.md";

/// A book file with the key order the real books use: `book_id` first, `created_at` last.
const META: &str = r#"{
  "book_id": "sample",
  "title": "Sandbox Economics",
  "author": "Test Author",
  "language": "en",
  "total_words": 22,
  "total_chapters": 1,
  "toc": [],
  "spine": [],
  "created_at": "2026-09-01T00:00:00Z"
}"#;

/// Top level keys of a pretty printed JSON object, in the order the text has them.
/// The test reads the text, not a parsed value, because that is the order a person sees.
fn top_level_keys(text: &str) -> Vec<String> {
    text.lines()
        .filter_map(|line| line.strip_prefix("  \""))
        .filter_map(|rest| rest.split_once("\":"))
        .map(|(key, _)| key.to_string())
        .collect()
}

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

fn assessment() -> ExitAssessmentPayload {
    ExitAssessmentPayload {
        classification: "practical".to_string(),
        unity_statement: "The book argues that specialization raises output.".to_string(),
        parts_structure: vec!["Part 1: the pin factory".to_string()],
        completed_at: "2026-09-16T00:00:00Z".to_string(),
    }
}

#[test]
fn a_saved_exit_assessment_keeps_the_meta_key_order() {
    let sandbox = Sandbox::new();
    sandbox.write("books/sample/_meta.json", META);

    save_inspectional_exit_assessment(BOOK, assessment()).expect("save the exit assessment");

    let written = std::fs::read_to_string(sandbox.vault().join("books").join(BOOK).join("_meta.json"))
        .expect("read _meta.json");
    assert_eq!(
        top_level_keys(&written),
        vec![
            "book_id",
            "title",
            "author",
            "language",
            "total_words",
            "total_chapters",
            "toc",
            "spine",
            "created_at",
            "inspectional_blueprint",
        ],
        "the keys the file already had must keep their order, and the new key is added at the end"
    );
    assert!(written.contains("The book argues that specialization raises output."), "the assessment must be saved");
}

#[test]
fn a_saved_exit_assessment_leaves_no_temp_file_behind() {
    let sandbox = Sandbox::new();
    sandbox.write("books/sample/_meta.json", META);

    save_inspectional_exit_assessment(BOOK, assessment()).expect("save the exit assessment");

    let dir = sandbox.vault().join("books").join(BOOK);
    let names: Vec<String> = std::fs::read_dir(&dir)
        .expect("read book folder")
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    assert_eq!(names, vec!["_meta.json"], "a finished save must leave only the file itself");
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

/// Counts the line endings of a file: (whole CRLF pairs, LF that stand alone).
fn line_endings(text: &str) -> (usize, usize) {
    let pairs = text.matches("\r\n").count();
    (pairs, text.matches('\n').count() - pairs)
}

#[test]
fn a_saved_exit_assessment_keeps_windows_line_endings() {
    let sandbox = Sandbox::new();
    sandbox.write("books/sample/_meta.json", &META.replace('\n', "\r\n"));

    save_inspectional_exit_assessment(BOOK, assessment()).expect("save the exit assessment");

    let written = std::fs::read_to_string(sandbox.vault().join("books").join(BOOK).join("_meta.json"))
        .expect("read _meta.json");
    let (pairs, alone) = line_endings(&written);
    assert!(pairs > 0, "the file must still use Windows line endings");
    assert_eq!(alone, 0, "no line may be left with a bare newline");
}

#[test]
fn a_saved_exit_assessment_keeps_plain_line_endings() {
    let sandbox = Sandbox::new();
    sandbox.write("books/sample/_meta.json", META);

    save_inspectional_exit_assessment(BOOK, assessment()).expect("save the exit assessment");

    let written = std::fs::read_to_string(sandbox.vault().join("books").join(BOOK).join("_meta.json"))
        .expect("read _meta.json");
    let (pairs, alone) = line_endings(&written);
    assert_eq!(pairs, 0, "a file with plain newlines must not gain Windows line endings");
    assert!(alone > 0, "the file must still have its lines");
}
