//! No name that the app page sends reads or writes a file outside the vault (SEC-03).
//!
//! The commands give the book id, the chapter file, the notes file and the topic id of the page to these functions. Each
//! test gives them names that climb out with `..`, absolute paths, and folders that are links to a place outside the
//! vault. That place is a folder in the test sandbox, so a run without the fix changes nothing but the sandbox.

use std::fs;
use std::path::{Path, PathBuf};

use crate::db::{get_study_analytics_blocking, record_reading_session_blocking, sync_practice_deck_blocking};
use crate::test_support::Sandbox;
use crate::vault::bookmark::save_bookmark;
use crate::vault::inspectional::save_exit_assessment;
use crate::vault::models::{AnalyticalStore, ExitAssessmentPayload, VocabularyEntry};
use crate::vault::syntopicon_models::SyntopicTopic;
use crate::vault::{
    compile_and_export_book_summary, export_syntopic_report, get_inspectional_blueprint, load_analytical_store,
    load_chapter_highlights, load_syntopic_topic, read_book_meta_json, read_chapter_file, read_notes_file,
    save_analytical_store, save_chapter_highlights, save_syntopic_topic, save_vocabulary_term, scan_all_notes,
    write_notes_file,
};

/// A book file outside the vault, with a word count that a test can tell apart.
const OUTSIDE_META: &str = r#"{ "title": "Outside", "author": "Someone Else", "total_words": 4242, "spine": [] }"#;
const OUTSIDE_WORDS: usize = 4242;
const OUTSIDE_TEXT: &str = "Text from outside the vault.";

/// `<sandbox>/outside`: next to the vault, not in it.
fn outside(sandbox: &Sandbox) -> PathBuf {
    let outside = sandbox.vault().parent().expect("the sandbox folder").join("outside");
    fs::create_dir_all(&outside).expect("create the folder outside the vault");
    outside
}

/// The names that lead from `folder` to `target`: `..` parts with `/`, `..` parts with `\` on Windows, and the absolute
/// path. They are worked out from the two paths, so none of them can lead out of the sandbox.
fn names_to(folder: &Path, target: &Path) -> Vec<String> {
    let from: Vec<_> = folder.components().collect();
    let to: Vec<_> = target.components().collect();
    let shared = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    let mut parts = vec!["..".to_string(); from.len() - shared];
    parts.extend(to[shared..].iter().map(|part| part.as_os_str().to_string_lossy().to_string()));

    let mut names = vec![parts.join("/")];
    if cfg!(windows) {
        names.push(parts.join("\\"));
    }
    names.push(target.to_string_lossy().to_string());
    names
}

/// The calls that used the place outside the vault, so a failing run names every one of them.
#[derive(Default)]
struct NotRefused(Vec<String>);

impl NotRefused {
    /// Notes the call when it did not fail.
    fn check<T>(&mut self, call: &str, name: &str, result: anyhow::Result<T>) {
        self.note(call, name, result.is_ok());
    }

    /// Notes the call when it used the place outside the vault.
    fn note(&mut self, call: &str, name: &str, used_outside: bool) {
        if used_outside {
            self.0.push(format!("{call} with {name:?}"));
        }
    }

    fn assert_none(self) {
        assert!(self.0.is_empty(), "these calls were not refused:\n{}", self.0.join("\n"));
    }
}

/// The names of the files in `folder`.
fn files_in(folder: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(folder)
        .expect("read the folder")
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect();
    names.sort();
    names
}

fn assessment() -> ExitAssessmentPayload {
    ExitAssessmentPayload {
        classification: "Practical".to_string(),
        unity_statement: "A test answer.".to_string(),
        parts_structure: Vec::new(),
        completed_at: "2026-09-17T00:00:00.000Z".to_string(),
    }
}

fn term() -> VocabularyEntry {
    VocabularyEntry {
        word: "pin".to_string(),
        definition: "a small metal pin".to_string(),
        chapter_file: "ch-01.md".to_string(),
        anchor: "^p-002".to_string(),
        saved_at: "2026-09-17T00:00:00.000Z".to_string(),
    }
}

/// `load_chapter`, `load_book_meta`, `get_inspectional_blueprint`, `load_notes`, `get_all_book_notes`,
/// `get_chapter_highlights` and `get_analytical_data` read no file outside the vault.
#[test]
fn a_file_outside_the_vault_is_not_read() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    let outside = outside(&sandbox);
    fs::write(outside.join("_meta.json"), OUTSIDE_META).expect("write a book file outside the vault");
    for file in ["ch-01.md", "secret.md", "ch-01-notes.md", "secret-notes.md"] {
        fs::write(outside.join(file), OUTSIDE_TEXT).expect("write a file outside the vault");
    }
    fs::write(outside.join("ch-01-highlights.json"), "[]").expect("write highlights outside the vault");
    fs::write(outside.join("analytical.json"), "{}").expect("write a store outside the vault");
    let books = sandbox.vault().join("books");
    let notes = sandbox.vault().join("notes");
    let mut not_refused = NotRefused::default();

    for name in names_to(&books.join("sample"), &outside.join("secret.md")) {
        not_refused.check("read_chapter_file", &name, read_chapter_file("sample", &name));
    }
    for id in names_to(&books, &outside) {
        not_refused.check("read_chapter_file", &id, read_chapter_file(&id, "ch-01.md"));
        not_refused.check("read_book_meta_json", &id, read_book_meta_json(&id));
        not_refused.check("get_inspectional_blueprint", &id, get_inspectional_blueprint(&id));
    }
    for name in names_to(&notes.join("sample"), &outside.join("secret-notes.md")) {
        not_refused.check("read_notes_file", &name, read_notes_file("sample", &name));
    }
    for id in names_to(&notes, &outside) {
        not_refused.check("read_notes_file", &id, read_notes_file(&id, "ch-01-notes.md"));
        not_refused.check("scan_all_notes", &id, scan_all_notes(&id));
        not_refused.check("load_chapter_highlights", &id, load_chapter_highlights(&id, "ch-01.md"));
        not_refused.check("load_analytical_store", &id, load_analytical_store(&id));
    }

    not_refused.assert_none();
}

/// `save_notes`, `save_chapter_highlights`, `save_bookmark`, `save_inspectional_exit_assessment`,
/// `save_book_vocabulary`, `save_analytical_data`, `export_book_summary` and `record_reading_progress` write no file
/// outside the vault.
#[test]
fn a_file_outside_the_vault_is_not_written() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    let outside = outside(&sandbox);
    let notes = sandbox.vault().join("notes");
    let mut not_refused = NotRefused::default();

    for name in names_to(&notes.join("sample"), &outside.join("escaped-notes.md")) {
        not_refused.check("write_notes_file", &name, write_notes_file("sample", &name, "written"));
    }
    // The highlights of a chapter `escaped.md` are in `escaped-highlights.json`.
    for name in names_to(&notes.join("sample"), &outside.join("escaped.md")) {
        not_refused.check("save_chapter_highlights", &name, save_chapter_highlights("sample", &name, Vec::new()));
    }
    for id in names_to(&notes, &outside) {
        let id = id.as_str();
        not_refused.check("write_notes_file", id, write_notes_file(id, "ch-01-notes.md", "written"));
        not_refused.check("save_chapter_highlights", id, save_chapter_highlights(id, "ch-01.md", Vec::new()));
        not_refused.check("save_bookmark", id, save_bookmark(id, "ch-01.md", None));
        not_refused.check("save_exit_assessment", id, save_exit_assessment(id, assessment()));
        not_refused.check("save_vocabulary_term", id, save_vocabulary_term(id, term()));
        not_refused.check("save_analytical_store", id, save_analytical_store(id, AnalyticalStore::default()));
        not_refused.check("compile_and_export_book_summary", id, compile_and_export_book_summary(id));
        not_refused.check("record_reading_session", id, record_reading_session_blocking(id, "ch-01.md", 60, false));
    }

    let written = files_in(&outside);
    not_refused.assert_none();
    assert!(written.is_empty(), "no file may be written outside the vault: {written:?}");
}

/// `sync_practice_deck` makes no cards from a deck outside the vault, and `get_study_analytics` does not count the words
/// of a book outside the vault.
#[test]
fn practice_and_analytics_use_no_book_outside_the_vault() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    let outside = outside(&sandbox);
    fs::copy(sandbox.vault().join("books/sample/ch-01.md"), outside.join("ch-01.md")).expect("copy the chapter");
    fs::copy(sandbox.vault().join("notes/sample/practice-deck.md"), outside.join("practice-deck.md"))
        .expect("copy the deck");
    fs::write(outside.join("_meta.json"), OUTSIDE_META).expect("write a book file outside the vault");
    let mut not_refused = NotRefused::default();

    for id in names_to(&sandbox.vault().join("notes"), &outside) {
        not_refused.check("sync_practice_deck", &id, sync_practice_deck_blocking(&id));
        let counted = get_study_analytics_blocking(Some(&id)).is_ok_and(|a| a.total_vault_words == OUTSIDE_WORDS);
        not_refused.note("get_study_analytics", &id, counted);
    }

    not_refused.assert_none();
}

/// `get_syntopic_topic`, `save_syntopic_topic` and `export_syntopic_report` read and write no topic outside the vault,
/// also when the id inside a topic file leads out of it.
#[test]
fn a_topic_outside_the_vault_is_not_read_or_written() {
    let sandbox = Sandbox::new();
    let outside = outside(&sandbox);
    let syntopicon = sandbox.vault().join("syntopicon");
    let topic = |id: &str| SyntopicTopic {
        id: id.to_string(),
        title: "Outside".to_string(),
        created_at: "2026-09-17T00:00:00.000Z".to_string(),
        ..Default::default()
    };
    let as_json = |topic: &SyntopicTopic| serde_json::to_string(topic).expect("topic JSON");
    fs::write(outside.join("secret.json"), as_json(&topic("secret"))).expect("write a topic outside the vault");
    // A topic in the vault whose id leads to `<sandbox>/outside/inside-synthesis.md`.
    let leading_out = names_to(&syntopicon.join("reports"), &outside.join("inside")).remove(0);
    sandbox.write("syntopicon/topics/inside.json", &as_json(&topic(&leading_out)));
    let mut not_refused = NotRefused::default();

    for id in names_to(&syntopicon.join("topics"), &outside.join("secret")) {
        not_refused.check("load_syntopic_topic", &id, load_syntopic_topic(&id));
        not_refused.check("export_syntopic_report", &id, export_syntopic_report(&id));
    }
    for id in names_to(&syntopicon.join("topics"), &outside.join("escaped")) {
        not_refused.check("save_syntopic_topic", &id, save_syntopic_topic(topic(&id)));
    }
    not_refused.check("export_syntopic_report", "inside", export_syntopic_report("inside"));

    let written = files_in(&outside);
    not_refused.assert_none();
    assert_eq!(written, ["secret.json"], "no topic or report may be written outside the vault");
}

/// A book folder or a notes folder that is a link to a place outside the vault is not used: the link is followed
/// before the path is checked.
#[cfg(windows)]
#[test]
fn a_book_or_notes_folder_that_is_a_link_out_of_the_vault_is_not_used() {
    let sandbox = Sandbox::new();
    let outside = outside(&sandbox);
    fs::write(outside.join("ch-01.md"), OUTSIDE_TEXT).expect("write a chapter outside the vault");
    fs::create_dir_all(sandbox.vault().join("notes")).expect("create the notes folder");
    let linked_book = sandbox.vault().join("books").join("linked");
    let linked_notes = sandbox.vault().join("notes").join("linked");
    crate::test_support::junction(&linked_book, &outside);
    crate::test_support::junction(&linked_notes, &outside);

    let chapter = read_chapter_file("linked", "ch-01.md");
    let saved = save_analytical_store("linked", AnalyticalStore::default());
    let written = files_in(&outside);

    // The junctions go first, so the sandbox clean-up never reaches the folder they point at.
    fs::remove_dir(&linked_book).expect("remove a junction");
    fs::remove_dir(&linked_notes).expect("remove a junction");
    assert!(chapter.is_err(), "a chapter in a linked book folder must not be read");
    assert!(saved.is_err(), "a store in a linked notes folder must not be written");
    assert_eq!(written, ["ch-01.md"], "no file may be written through a link");
}
