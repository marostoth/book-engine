//! Search tests: what a typed search finds in a real FTS5 index with the app's tokenizer.

use crate::db::{index_vault_blocking, search_vault_blocking};
use crate::test_support::Sandbox;

const SEARCH_META: &str = r#"{
  "book_id": "search",
  "title": "Search Sandbox",
  "author": "Test Author",
  "total_words": 68,
  "total_chapters": 1,
  "spine": [
    { "id": "ch-01", "title": "Chapter 1: Queries", "file_path": "ch-01.md", "order": 1 }
  ]
}"#;

const SEARCH_CHAPTER: &str = "# Chapter 1: Queries

War broke out in the north. ^p-001

Peace returned to the valley. ^p-002

After the war came a long peace. ^p-003

Don't trust a well-known e-mail. ^p-004

COVID-19 closed shops across the U.S. in spring. ^p-005

She wrote C++ code for the exchange. ^p-006

Cats chase mice in the barn. ^p-007

Labour needs a division of tasks. ^p-008

The division of labour raises output. ^p-009

Send the email today. ^p-010

Ask Don Taylor first. ^p-011
";

/// A new sandbox with the one-chapter book `search` in the search index.
fn indexed_sandbox() -> Sandbox {
    let sandbox = Sandbox::new();
    sandbox.write("books/search/_meta.json", SEARCH_META);
    sandbox.write("books/search/ch-01.md", SEARCH_CHAPTER);
    let summary = index_vault_blocking().expect("index the search sandbox book");
    assert_eq!(summary.paragraphs_indexed, 11);
    sandbox
}

/// The anchors a search finds, sorted. Panics when the search returns an error.
fn found(query: &str) -> Vec<String> {
    let mut anchors: Vec<String> = search_vault_blocking(query)
        .unwrap_or_else(|e| panic!("search {query:?} returned an error: {e:#}"))
        .into_iter()
        .map(|result| result.anchor)
        .collect();
    anchors.sort();
    anchors
}

#[test]
fn capital_and_or_not_work_as_operators() {
    let _sandbox = indexed_sandbox();
    assert_eq!(found("war AND peace"), ["^p-003"]);
    assert_eq!(found("war OR peace"), ["^p-001", "^p-002", "^p-003"]);
    assert_eq!(found("war NOT peace"), ["^p-001"]);
    assert_eq!(found("war AND NOT peace"), ["^p-001"]);
    // NOT takes away only the word after it: north must still match.
    assert_eq!(found("war NOT peace north"), ["^p-001"]);
    // NOT needs a word before it.
    assert_eq!(found("NOT war"), Vec::<String>::new());
}

#[test]
fn words_with_inner_punctuation_are_found() {
    let _sandbox = indexed_sandbox();
    // don't must not also find "Don Taylor" (p-011): its 1-letter part t matches only itself.
    for query in ["don't", "well-known"] {
        assert_eq!(found(query), ["^p-004"], "{query}");
    }
    for query in ["COVID-19", "U.S."] {
        assert_eq!(found(query), ["^p-005"], "{query}");
    }
    // A word with hyphens also finds its spelling without them.
    assert_eq!(found("e-mail"), ["^p-004", "^p-010"]);
}

#[test]
fn word_that_ends_in_punctuation_matches_only_itself() {
    let _sandbox = indexed_sandbox();
    // The index stores C++ as the word "c": the search must not also find came, closed, code, and cats.
    assert_eq!(found("C++"), ["^p-006"]);
}

#[test]
fn quoted_phrase_finds_only_that_phrase() {
    let _sandbox = indexed_sandbox();
    assert_eq!(found("division of labour"), ["^p-008", "^p-009"]);
    assert_eq!(found("\"division of labour\""), ["^p-009"]);
    // A phrase with no closing quote is still being typed: its last word matches longer words.
    assert_eq!(found("\"division of lab"), ["^p-009"]);
}

#[test]
fn search_shorter_than_two_characters_finds_nothing() {
    let _sandbox = indexed_sandbox();
    for query in ["w", " w ", "c"] {
        assert_eq!(found(query), Vec::<String>::new(), "{query:?}");
    }
    assert_eq!(found("wa"), ["^p-001", "^p-003"]);
}

#[test]
fn unusual_search_returns_no_error() {
    let _sandbox = indexed_sandbox();
    let queries = [
        "AND", "OR OR", "NOT", "war AND", "OR peace", "\"", "\"\"", "--", "war*", "(war)", "e-", "-e-mail-",
        "don'", "NEAR(war peace)", "content:war", "^war", "war + peace", "\"war\" \"peace", "war\"peace",
    ];
    for query in queries {
        if let Err(e) = search_vault_blocking(query) {
            panic!("search {query:?} returned an error: {e:#}");
        }
    }
    // An operator with no word after it is left out while the search is still being typed.
    assert_eq!(found("war AND"), ["^p-001", "^p-003"]);
}

#[test]
fn words_still_match_longer_words() {
    let _sandbox = indexed_sandbox();
    assert_eq!(found("labo"), ["^p-008", "^p-009"]);
    assert_eq!(found("labo*"), ["^p-008", "^p-009"]);
    assert_eq!(found("peace"), ["^p-002", "^p-003"]);
}
