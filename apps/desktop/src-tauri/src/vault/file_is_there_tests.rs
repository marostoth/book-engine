//! DS-16: a file that cannot be read must never look like a file with nothing in it.
//!
//! `Path::exists` is `fs::metadata(..).is_ok()`, so it answers "no" for a file that is only locked, offline or
//! not allowed. The caller reads that as "nothing saved yet" and the next save writes over the reader's work.
//!
//! A file cannot be made unreadable inside a test without changing what the machine allows, which no test of
//! this repository may do. A name with a zero byte in it asks the same question another way: Rust refuses the
//! name before it reaches the disk, so `try_exists` gives an **error** where a missing file gives `Ok(false)`.
//! Every test below that uses such a path first checks that the two answers really are different, so a fixture
//! that has stopped reproducing the fault cannot pass quietly.
//!
//! `packages/ingestion/tests/test_a_file_that_cannot_be_read.py` is the other half of the proof: it names every
//! place that asks this question, and every place that is allowed to ask it the plain way.

use std::path::PathBuf;

use crate::test_support::Sandbox;
use crate::vault::file_is_there::file_is_there;
use crate::vault::json_store::read_json_file;
use crate::vault::syntopicon::{load_syntopic_topic, save_syntopic_topic};
use crate::vault::syntopicon_models::SyntopicTopic;

/// A topic file with work in it, as the reader left it.
const SAVED_TOPIC: &str = r#"{
  "id": "division-of-labor",
  "title": "Division of Labor",
  "description": "How work is split, and what that does.",
  "neutralTerms": [],
  "controversies": [],
  "synthesisNotes": "Ten hours of reading are in this line.",
  "createdAt": "2026-01-01T00:00:00Z"
}"#;

/// A path the system cannot look at, on any machine: a file name with a zero byte in it.
fn a_path_that_cannot_be_looked_at(sandbox: &Sandbox) -> PathBuf {
    let mut name = b"settings".to_vec();
    name.push(0);
    name.extend_from_slice(b".json");
    let name = String::from_utf8(name).expect("a zero byte is still UTF-8");
    sandbox.vault().join(name)
}

/// Checks that the path really does part the two answers, so a test below cannot pass on a broken fixture.
fn check_the_fixture(path: &std::path::Path) {
    assert!(
        !path.exists(),
        "the plain way must answer 'nothing is there' for this path, or this test proves nothing"
    );
    assert!(
        path.try_exists().is_err(),
        "the system must refuse to look at this path, or this test proves nothing"
    );
}

#[test]
fn a_file_that_is_saved_is_there() {
    let sandbox = Sandbox::new();
    sandbox.write("notes/sample/ch-01-notes.md", "Something the reader wrote.");
    assert!(file_is_there(&sandbox.vault().join("notes/sample/ch-01-notes.md")));
}

#[test]
fn a_file_that_was_never_saved_is_not_there() {
    let sandbox = Sandbox::new();
    assert!(
        !file_is_there(&sandbox.vault().join("notes/sample/ch-99-notes.md")),
        "a file nobody has written must still read as nothing saved yet"
    );
}

#[test]
fn a_file_the_system_cannot_look_at_counts_as_there() {
    let sandbox = Sandbox::new();
    let path = a_path_that_cannot_be_looked_at(&sandbox);
    check_the_fixture(&path);
    assert!(
        file_is_there(&path),
        "an answer that could not be got means the file is there, exactly as `is_taken` reads it (DS-16)"
    );
}

#[test]
fn a_json_file_that_cannot_be_looked_at_does_not_read_as_nothing_saved() {
    let sandbox = Sandbox::new();
    let path = a_path_that_cannot_be_looked_at(&sandbox);
    check_the_fixture(&path);

    let read = read_json_file::<serde_json::Value>(&path);
    assert!(
        read.is_err(),
        "a file that cannot be looked at must give an error. It gave {read:?}, which every caller reads as \
         'nothing saved yet', and the next save writes over the file (DS-16)"
    );
}

#[test]
fn a_json_file_that_was_never_saved_still_reads_as_nothing_saved() {
    let sandbox = Sandbox::new();
    let read = read_json_file::<serde_json::Value>(&sandbox.vault().join("notes/sample/bookmark.json"))
        .expect("a missing file is not an error");
    assert!(read.is_none(), "a file nobody has written holds nothing");
}

#[test]
fn a_topic_that_was_never_saved_comes_back_empty_under_its_own_id() {
    let _sandbox = Sandbox::new();
    let topic = load_syntopic_topic("a-topic-nobody-made").expect("an empty topic is not an error");
    assert_eq!(topic.id, "a-topic-nobody-made");
    assert!(topic.title.is_empty());
}

#[test]
fn a_saved_topic_comes_back_whole() {
    let sandbox = Sandbox::new();
    sandbox.write("syntopicon/topics/division-of-labor.json", SAVED_TOPIC);
    let topic = load_syntopic_topic("division-of-labor").expect("read the saved topic");
    assert_eq!(topic.title, "Division of Labor");
    assert_eq!(
        topic.synthesis_notes.as_deref(),
        Some("Ten hours of reading are in this line.")
    );
}

#[test]
fn a_topic_file_that_is_damaged_is_not_read_as_an_empty_topic() {
    let sandbox = Sandbox::new();
    sandbox.write("syntopicon/topics/division-of-labor.json", "{ this is not JSON");

    let read = load_syntopic_topic("division-of-labor");
    assert!(
        read.is_err(),
        "a damaged topic file must give an error, not an empty topic"
    );

    let kept: Vec<_> = std::fs::read_dir(sandbox.vault().join("syntopicon").join("topics"))
        .expect("read the topics folder")
        .flatten()
        .filter(|entry| entry.file_name().to_string_lossy().contains(".corrupt-"))
        .collect();
    assert_eq!(
        kept.len(),
        1,
        "the damaged bytes must be kept in a copy next to the file, as every other vault file does (DS-04)"
    );
}

#[test]
fn a_topic_file_that_is_damaged_is_never_written_over() {
    let sandbox = Sandbox::new();
    let damaged = "{ this is not JSON, and it is the only copy of the reader's work";
    sandbox.write("syntopicon/topics/division-of-labor.json", damaged);
    let path = sandbox.vault().join("syntopicon/topics/division-of-labor.json");

    let saved = save_syntopic_topic(SyntopicTopic {
        id: "division-of-labor".into(),
        title: "Division of Labor".into(),
        ..Default::default()
    });

    assert!(
        saved.is_err(),
        "a save must stop at a topic file it could not read, as every other vault writer does (DS-04)"
    );
    assert_eq!(
        std::fs::read_to_string(&path).expect("the topic file"),
        damaged,
        "the file on the disk must be exactly what it was before the save"
    );
}

#[test]
fn a_topic_that_can_be_read_is_still_saved() {
    let sandbox = Sandbox::new();
    sandbox.write("syntopicon/topics/division-of-labor.json", SAVED_TOPIC);

    save_syntopic_topic(SyntopicTopic {
        id: "division-of-labor".into(),
        title: "Division of Labour".into(),
        synthesis_notes: Some("One more hour of reading.".into()),
        ..Default::default()
    })
    .expect("save over a topic that can be read");

    let topic = load_syntopic_topic("division-of-labor").expect("read it back");
    assert_eq!(topic.title, "Division of Labour");
    assert_eq!(topic.synthesis_notes.as_deref(), Some("One more hour of reading."));
}
