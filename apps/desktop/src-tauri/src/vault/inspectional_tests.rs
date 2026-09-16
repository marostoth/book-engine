//! Tests for `inspectional.rs`: the exit assessment is kept with the reader's notes, so a new import of the book
//! cannot take it away, and the app never writes the book file the importer makes (DS-09).

use std::fs;

use crate::test_support::Sandbox;
use crate::vault::get_inspectional_blueprint;
use crate::vault::inspectional::{load_exit_assessment, save_exit_assessment, INSPECTIONAL_FILE};
use crate::vault::models::ExitAssessmentPayload;

const BOOK: &str = "sample";

/// `_meta.json` as the importer writes it: a blueprint with no assessment in it.
const META: &str = r#"{
  "book_id": "sample",
  "title": "Sandbox Economics",
  "author": "Test Author",
  "language": "en",
  "total_words": 22,
  "total_chapters": 2,
  "toc": [],
  "spine": [
    { "id": "ch-01", "title": "Chapter 1", "file_path": "ch-01.md", "order": 1 },
    { "id": "ch-02", "title": "Chapter 2", "file_path": "ch-02.md", "order": 2 }
  ],
  "created_at": "2026-09-01T00:00:00Z",
  "inspectional_blueprint": {
    "front_matter": { "has_preface": false, "preface_path": null, "publisher_blurb": "Sandbox Economics by Test Author" },
    "pivotal_chapters": ["ch-01", "ch-02"],
    "synthetic_index_clusters": [],
    "exit_assessment": null
  }
}"#;

/// `_meta.json` with no blueprint, like the real `wealth-of-nations`: the app builds a blueprint when it is read.
const META_WITHOUT_BLUEPRINT: &str = r#"{
  "book_id": "sample",
  "title": "Sandbox Economics",
  "author": "Test Author",
  "total_chapters": 2,
  "spine": [
    { "id": "ch-01", "title": "Chapter 1", "file_path": "ch-01.md", "order": 1 },
    { "id": "ch-02", "title": "Chapter 2", "file_path": "ch-02.md", "order": 2 }
  ]
}"#;

fn assessment() -> ExitAssessmentPayload {
    ExitAssessmentPayload {
        classification: "Theoretical - Social Science".to_string(),
        unity_statement: "Specialization raises output, and markets limit how far it can go.".to_string(),
        parts_structure: vec!["The division of labour".to_string(), "Money and prices".to_string()],
        completed_at: "2026-09-16T10:00:00.000Z".to_string(),
    }
}

fn meta_path(sandbox: &Sandbox) -> std::path::PathBuf {
    sandbox.vault().join("books").join(BOOK).join("_meta.json")
}

fn inspectional_path(sandbox: &Sandbox) -> std::path::PathBuf {
    sandbox.vault().join("notes").join(BOOK).join(INSPECTIONAL_FILE)
}

#[test]
fn a_saved_exit_assessment_comes_back() {
    let sandbox = Sandbox::new();
    sandbox.write("books/sample/_meta.json", META);
    assert_eq!(load_exit_assessment(BOOK).expect("load"), None, "a book the reader has not assessed has none");

    save_exit_assessment(BOOK, assessment()).expect("save");

    assert_eq!(load_exit_assessment(BOOK).expect("load again"), Some(assessment()));
}

#[test]
fn a_new_import_of_the_book_keeps_the_exit_assessment() {
    let sandbox = Sandbox::new();
    sandbox.write("books/sample/_meta.json", META);
    save_exit_assessment(BOOK, assessment()).expect("save");

    // The importer writes the whole book file again, with `exit_assessment: null`.
    sandbox.write("books/sample/_meta.json", META);

    assert_eq!(load_exit_assessment(BOOK).expect("load"), Some(assessment()));
}

#[test]
fn saving_an_exit_assessment_never_writes_the_book_file() {
    for (name, meta) in [("with a blueprint", META), ("with no blueprint", META_WITHOUT_BLUEPRINT)] {
        let sandbox = Sandbox::new();
        let windows_text = meta.replace('\n', "\r\n");
        sandbox.write("books/sample/_meta.json", &windows_text);

        save_exit_assessment(BOOK, assessment()).expect("save");

        assert_eq!(
            fs::read_to_string(meta_path(&sandbox)).expect("read _meta.json"),
            windows_text,
            "a book file {name} must stay byte for byte as the importer wrote it"
        );
    }
}

#[test]
fn a_book_with_no_blueprint_keeps_the_blueprint_the_app_builds() {
    let sandbox = Sandbox::new();
    sandbox.write("books/sample/_meta.json", META_WITHOUT_BLUEPRINT);
    let built = get_inspectional_blueprint(BOOK).expect("blueprint before");
    assert_eq!(built.pivotal_chapters, vec!["ch-01", "ch-02"]);

    save_exit_assessment(BOOK, assessment()).expect("save");

    let after = get_inspectional_blueprint(BOOK).expect("blueprint after");
    assert_eq!(after.pivotal_chapters, built.pivotal_chapters, "the key chapters must not go");
    assert_eq!(after.front_matter, built.front_matter, "the blurb must not go");
}

#[test]
fn an_exit_assessment_an_older_build_saved_in_the_book_file_moves_next_to_the_notes() {
    let sandbox = Sandbox::new();
    let older = META.replace(
        "\"exit_assessment\": null",
        &format!("\"exit_assessment\": {}", serde_json::to_string(&assessment()).expect("assessment as JSON")),
    );
    sandbox.write("books/sample/_meta.json", &older);

    assert_eq!(load_exit_assessment(BOOK).expect("load"), Some(assessment()));
    assert_eq!(fs::read_to_string(meta_path(&sandbox)).expect("read _meta.json"), older, "the book file is not changed");
    assert!(inspectional_path(&sandbox).exists(), "the assessment is copied next to the notes");

    sandbox.write("books/sample/_meta.json", META);
    assert_eq!(load_exit_assessment(BOOK).expect("load after an import"), Some(assessment()));
}

#[test]
fn a_damaged_file_is_kept_and_never_saved_over() {
    let sandbox = Sandbox::new();
    let older = META.replace(
        "\"exit_assessment\": null",
        &format!("\"exit_assessment\": {}", serde_json::to_string(&assessment()).expect("assessment as JSON")),
    );
    sandbox.write("books/sample/_meta.json", &older);
    let damaged = "{\"exitAssessment\": {\"classification\": \"Practical";
    sandbox.write("notes/sample/inspectional.json", damaged);

    let load = load_exit_assessment(BOOK).expect_err("a damaged file must not read as no assessment");
    assert!(load.to_string().contains(INSPECTIONAL_FILE), "the error must name the file: {load}");
    save_exit_assessment(BOOK, assessment()).expect_err("a damaged file must stop the save");

    assert_eq!(fs::read_to_string(inspectional_path(&sandbox)).expect("read the file"), damaged);
    let copies = fs::read_dir(sandbox.vault().join("notes").join(BOOK))
        .expect("read notes folder")
        .flatten()
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("inspectional.json.corrupt-"))
        .count();
    assert_eq!(copies, 1, "the damaged bytes are kept in one copy");
}

#[test]
fn answers_this_build_does_not_know_are_kept() {
    let sandbox = Sandbox::new();
    sandbox.write("notes/sample/inspectional.json", "{\n  \"dipNotes\": [\"The preface names the three parts.\"]\n}");

    save_exit_assessment(BOOK, assessment()).expect("save");

    let saved: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(inspectional_path(&sandbox)).expect("read the file")).expect("parse");
    assert_eq!(saved["dipNotes"], serde_json::json!(["The preface names the three parts."]));
    assert_eq!(saved["exitAssessment"]["unityStatement"], assessment().unity_statement);
}

#[test]
fn a_saved_exit_assessment_leaves_no_temp_file_behind() {
    let sandbox = Sandbox::new();

    save_exit_assessment(BOOK, assessment()).expect("save");

    let names: Vec<String> = fs::read_dir(sandbox.vault().join("notes").join(BOOK))
        .expect("read notes folder")
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect();
    assert_eq!(names, vec![INSPECTIONAL_FILE], "a finished save must leave only the file itself");
}
