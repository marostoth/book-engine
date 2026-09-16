//! DS-12: creating a topic never replaces a topic that is already there.
//!
//! A topic's file is named after its title, so "Division of Labor" needs `division-of-labor.json`. Creating a topic
//! used to write an empty topic into that file, even when another topic was saved there.

use std::sync::{Arc, Barrier};

use crate::test_support::Sandbox;
use crate::vault::syntopicon::{
    create_syntopic_topic, list_syntopic_topics, load_syntopic_topic, save_syntopic_topic, topic_id_from_title,
};
use crate::vault::syntopicon_models::NeutralTerm;

/// A topic with work in it, saved in `division-of-labor.json` under a longer title.
const TOPIC_WITH_WORK: &str = r#"{
  "id": "division-of-labor",
  "title": "Division of Labor & Systemic Specialization",
  "description": "How work is split, and what that does.",
  "neutralTerms": [
    {
      "id": "term-spec",
      "term": "Operational Specialization",
      "neutralDefinition": "Splitting a process into bounded tasks.",
      "mappings": []
    }
  ],
  "questions": [{ "id": "q-1", "question": "Does specialization raise output?", "order": 1 }],
  "controversies": [{ "id": "c-1", "questionId": "q-1", "title": "Output and its costs", "perspectives": [] }],
  "synthesisNotes": "The authors agree on output and differ on its costs.",
  "createdAt": "2026-09-13T10:00:00Z"
}"#;

fn topic_file(sandbox: &Sandbox, id: &str) -> std::path::PathBuf {
    sandbox.vault().join("syntopicon").join("topics").join(format!("{id}.json"))
}

/// Writes `TOPIC_WITH_WORK` and gives its bytes.
fn write_topic_with_work(sandbox: &Sandbox) -> Vec<u8> {
    sandbox.write("syntopicon/topics/division-of-labor.json", TOPIC_WITH_WORK);
    std::fs::read(topic_file(sandbox, "division-of-labor")).expect("read the topic")
}

#[test]
fn a_new_topic_is_saved_in_a_file_named_after_its_title() {
    let _sandbox = Sandbox::new();

    let topic = create_syntopic_topic("Division of Labor", "How work is split").expect("create the topic");

    assert_eq!(topic.id, "division-of-labor");
    assert_eq!(topic.title, "Division of Labor");
    assert_eq!(topic.description, "How work is split");
    assert!(topic.neutral_terms.is_empty() && topic.questions.is_empty() && topic.controversies.is_empty());
    assert!(
        chrono::DateTime::parse_from_rfc3339(&topic.created_at).is_ok(),
        "createdAt must be a time: {}",
        topic.created_at
    );
    assert_eq!(load_syntopic_topic("division-of-labor").expect("load the topic"), topic);
}

#[test]
fn a_title_whose_file_a_topic_already_uses_is_refused_and_that_topic_stays() {
    let sandbox = Sandbox::new();
    let before = write_topic_with_work(&sandbox);

    let error = create_syntopic_topic("Division of Labor", "").expect_err("the file is taken");

    let message = format!("{error:#}");
    assert!(message.contains("division-of-labor.json"), "the message must name the file: {message}");
    assert!(
        message.contains("\"Division of Labor & Systemic Specialization\""),
        "and the topic that uses it: {message}"
    );
    assert_eq!(
        std::fs::read(topic_file(&sandbox, "division-of-labor")).expect("read the topic"),
        before,
        "the topic that is there must not change"
    );
}

#[test]
fn titles_that_differ_only_in_capitals_or_punctuation_need_the_same_file() {
    for (title, id) in [
        ("Division of Labor", "division-of-labor"),
        ("division of labor!", "division-of-labor"),
        ("  DIVISION -- of   Labor ", "division-of-labor"),
        ("Rule 5: Analyzing the Discussion", "rule-5-analyzing-the-discussion"),
        ("Café Society", "caf-society"),
        ("???", ""),
    ] {
        assert_eq!(topic_id_from_title(title), id, "the file name for {title:?}");
    }

    let sandbox = Sandbox::new();
    let before = write_topic_with_work(&sandbox);

    create_syntopic_topic("DIVISION OF LABOR?", "").expect_err("the title needs the same file");

    assert_eq!(std::fs::read(topic_file(&sandbox, "division-of-labor")).expect("read the topic"), before);
}

#[test]
fn a_damaged_topic_file_that_the_title_needs_is_refused_and_kept() {
    let sandbox = Sandbox::new();
    sandbox.write("syntopicon/topics/division-of-labor.json", "{ \"id\": \"division-of-labor\", \"title\": ");
    let before = std::fs::read(topic_file(&sandbox, "division-of-labor")).expect("read the file");

    // The topic list skips a file it cannot read, so the page cannot know that this file is there.
    assert!(list_syntopic_topics().expect("list the topics").is_empty());
    let error = create_syntopic_topic("Division of Labor", "").expect_err("the file is taken");

    assert!(format!("{error:#}").contains("cannot be read"), "the message must say so: {error:#}");
    assert_eq!(std::fs::read(topic_file(&sandbox, "division-of-labor")).expect("read the file"), before);
}

#[test]
fn titles_with_no_letter_or_digit_get_the_first_free_numbered_file() {
    let _sandbox = Sandbox::new();

    let first = create_syntopic_topic("???", "").expect("create the first topic");
    let second = create_syntopic_topic("!!!", "").expect("create the second topic");

    assert_eq!((first.id.as_str(), second.id.as_str()), ("topic-1", "topic-2"));
    assert_eq!(load_syntopic_topic("topic-1").expect("load").title, "???");
    assert_eq!(load_syntopic_topic("topic-2").expect("load").title, "!!!");
}

#[test]
fn two_creates_of_the_same_title_at_once_make_one_topic() {
    let sandbox = Sandbox::new();
    let start = Arc::new(Barrier::new(2));
    let creates: Vec<_> = ["first", "second"]
        .into_iter()
        .map(|description| {
            let start = Arc::clone(&start);
            sandbox.spawn(move || {
                start.wait();
                create_syntopic_topic("Justice", description).map(|topic| topic.description)
            })
        })
        .collect();
    let results: Vec<_> = creates.into_iter().map(|create| create.join().expect("join the thread")).collect();

    let created: Vec<&String> = results.iter().filter_map(|result| result.as_ref().ok()).collect();
    assert_eq!(created.len(), 1, "exactly one of the two creates may pass: {results:?}");
    assert_eq!(
        &load_syntopic_topic("justice").expect("load the topic").description,
        created[0],
        "the file must hold the topic that was created"
    );
}

#[test]
fn a_topic_that_is_there_can_still_be_saved() {
    let _sandbox = Sandbox::new();
    let mut topic = create_syntopic_topic("Justice", "").expect("create the topic");

    topic.neutral_terms.push(NeutralTerm {
        id: "term-1".into(),
        term: "Fairness".into(),
        neutral_definition: "Giving each their due.".into(),
        mappings: vec![],
    });
    save_syntopic_topic(topic.clone()).expect("an edit of a topic is saved in its own file");

    assert_eq!(load_syntopic_topic("justice").expect("load the topic"), topic);
}
