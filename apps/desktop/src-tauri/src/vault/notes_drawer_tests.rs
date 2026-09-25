//! What the notes drawer shows of the reader's own notes, next to the old highlights comment (RD-18).
//!
//! The drawer cut the old `<!-- highlights-json ... -->` comment at its first `-->`, which a highlight's words may
//! hold, and showed the rest of the JSON as notes. It also dropped every heading that merely started with
//! `## Highlights`, with everything under it, so `## Highlights of the argument` never reached the drawer or the
//! export. The move to the highlights file (`vault/highlights.rs`) already did both right, so the two read one file
//! two ways.
//!
//! The cases are in `src/lib/notesDrawerCases.json`, which `notesAggregator.test.ts` reads too, so the app and the
//! browser dev mode answer the same cases.

use super::notes::{notes_written_in, parse_all_book_notes};
use crate::test_support::Sandbox;
use crate::vault::{load_chapter_highlights, read_notes_file};

const BOOK: &str = "sample";
const CHAPTER: &str = "ch-01.md";
const NOTES_FILE: &str = "notes/sample/ch-01-notes.md";

#[derive(serde::Deserialize)]
struct Cases {
    cases: Vec<Case>,
}

#[derive(serde::Deserialize)]
struct Case {
    case: String,
    notes: String,
    /// Each note as `[heading, text, anchor]`.
    shows: Vec<(String, String, Option<String>)>,
}

fn cases() -> Vec<Case> {
    let cases: Cases = serde_json::from_str(include_str!("../../../src/lib/notesDrawerCases.json"))
        .expect("read notesDrawerCases.json");
    assert!(
        cases.cases.len() >= 7,
        "the cases file lost cases, so this test proves less"
    );
    cases.cases
}

/// What the drawer shows of some notes, as `[heading, text, anchor]`.
fn shown(notes: &str) -> Vec<(String, String, Option<String>)> {
    notes_written_in(notes)
        .into_iter()
        .map(|note| (note.heading, note.text, note.anchor))
        .collect()
}

#[test]
fn the_drawer_shows_the_notes_the_reader_wrote_in_every_case() {
    let wrong: Vec<String> = cases()
        .into_iter()
        .filter_map(|case| {
            let got = shown(&case.notes);
            (got != case.shows).then(|| format!("{}:\n  shows {:?}\n  wants {:?}", case.case, got, case.shows))
        })
        .collect();
    assert!(wrong.is_empty(), "{}", wrong.join("\n"));
}

/// Opening a chapter moves its old highlights out of the notes. The drawer must not show one thing before that and
/// another after it, so each case goes through the real move in a sandbox.
#[test]
fn the_drawer_shows_the_same_notes_before_the_move_to_the_highlights_file_and_after_it() {
    let mut wrong = Vec::new();
    for case in cases() {
        let sandbox = Sandbox::new();
        sandbox.write(NOTES_FILE, &case.notes);
        let before = shown(&case.notes);

        load_chapter_highlights(BOOK, CHAPTER).expect("move the old highlights");
        let after = shown(&read_notes_file(BOOK, "ch-01-notes.md").expect("read the notes"));

        if before != after {
            wrong.push(format!("{}:\n  before {before:?}\n  after  {after:?}", case.case));
        }
        drop(sandbox);
    }
    assert!(wrong.is_empty(), "{}", wrong.join("\n"));
}

/// The whole drawer, through the command the window calls: the highlight comes from the old comment, whole, and the
/// notes around it are the reader's, with no JSON among them.
#[test]
fn the_whole_drawer_shows_the_highlight_once_and_no_json() {
    let case = cases()
        .into_iter()
        .find(|case| case.case.starts_with("an old comment with no Highlights heading"))
        .expect("the case of a comment with no heading");
    let sandbox = Sandbox::new();
    sandbox.write(NOTES_FILE, &case.notes);

    let items = parse_all_book_notes(BOOK).expect("read the drawer");

    let highlights: Vec<&str> = items
        .iter()
        .filter(|item| item.item_type == "highlight")
        .map(|item| item.text.as_str())
        .collect();
    assert_eq!(highlights.len(), 1, "one highlight is saved: {highlights:?}");
    assert!(
        highlights[0].contains("-->"),
        "the highlight keeps its whole words: {highlights:?}"
    );

    let notes: Vec<&str> = items
        .iter()
        .filter(|item| item.item_type == "note")
        .map(|item| item.text.as_str())
        .collect();
    assert_eq!(notes, vec!["Division raises output"], "the reader wrote one note");
}
