//! Search result tests: a result holds the words of the book as plain text, with a mark only around each hit, and
//! never HTML (SEC-01).

use crate::db::{index_vault_blocking, open_or_create_db, search_vault_blocking, sha256_of};
use crate::test_support::Sandbox;

const WEB_META: &str = r#"{
  "book_id": "web",
  "title": "Web Pages",
  "author": "Test Author",
  "spine": [
    { "id": "ch-01", "title": "Chapter 1: Tags", "file_path": "ch-01.md", "order": 1 }
  ]
}"#;

/// A chapter with a tag as the book import wrote it before SEC-01 (p-001), text as the import writes it now (p-002,
/// p-003), the tags that the PDF import writes (p-004, p-005), and a `<` that starts no tag (p-006).
const WEB_CHAPTER: &str = "# Chapter 1: Tags

Write <img src=x onerror=\"stolen=1\"> to show a picture. ^p-001

Write &lt;img src=x onerror=\"stolen=1\"> as text. ^p-002

Tables need rows & columns, 2 < 3 is true, and AT&T wrote &amp;lt; in its pages. ^p-003

Prices ranged from 96<sup>29</sup> /32 to 97<sup>10</sup> /32 that day. ^p-004

|Directional<br>Performance|Very strong| ^p-005

Levi's techniques called Water<Less save water. ^p-006
";

const SYMBOLS_META: &str = r#"{
  "book_id": "symbols",
  "title": "Symbols",
  "author": "Test Author",
  "spine": [
    { "id": "ch-01", "title": "Chapter 1: Fonts", "file_path": "ch-01.md", "order": 1 }
  ]
}"#;

/// A chapter that holds the two characters that mark a hit, as a PDF with a symbol font can.
const SYMBOLS_CHAPTER: &str = "# Chapter 1: Fonts

A font symbol \u{E000}\u{E001} sits next to the compass. ^p-001
";

/// A new sandbox with the books `web` and `symbols` in the search index.
fn indexed_sandbox() -> Sandbox {
    let sandbox = Sandbox::new();
    sandbox.write("books/web/_meta.json", WEB_META);
    sandbox.write("books/web/ch-01.md", WEB_CHAPTER);
    sandbox.write("books/symbols/_meta.json", SYMBOLS_META);
    sandbox.write("books/symbols/ch-01.md", SYMBOLS_CHAPTER);
    index_vault_blocking().unwrap_or_else(|e| panic!("the index returned an error: {e:#}"));
    sandbox
}

/// The anchor and the snippet of every result of a search, sorted by anchor.
fn results(query: &str) -> Vec<(String, String)> {
    let mut results: Vec<(String, String)> = search_vault_blocking(query)
        .unwrap_or_else(|e| panic!("search {query:?} returned an error: {e:#}"))
        .into_iter()
        .map(|result| (result.anchor, result.snippet))
        .collect();
    results.sort();
    results
}

fn result(anchor: &str, snippet: &str) -> (String, String) {
    (anchor.to_string(), snippet.to_string())
}

/// A search result snippet: `[` and `]` in `text` stand for the characters that mark a hit, `HIT_START` (U+E000) and
/// `HIT_END` (U+E001) in `search_text.rs`.
fn snippet(text: &str) -> String {
    text.replace('[', "\u{E000}").replace(']', "\u{E001}")
}

fn nothing() -> Vec<(String, String)> {
    Vec::new()
}

#[test]
fn a_tag_in_a_chapter_file_never_reaches_a_search_result() {
    let _sandbox = indexed_sandbox();
    // The tag is left out. The two spaces around it stay, as the chapter file has them.
    assert_eq!(
        results("picture"),
        [result("^p-001", &snippet("Write  to show a [picture]."))]
    );
    // A search finds the words of a tag only where the book shows them as text.
    assert_eq!(
        results("onerror"),
        [result(
            "^p-002",
            &snippet("Write <img src=x [onerror]=\"stolen=1\"> as text.")
        )]
    );
}

#[test]
fn text_is_found_and_shown_as_the_book_has_it() {
    let _sandbox = indexed_sandbox();
    assert_eq!(
        results("columns"),
        [result(
            "^p-003",
            &snippet("Tables need rows & [columns], 2 < 3 is true, and AT&T wrote &lt; in its pages.")
        )]
    );
    // "<Less" starts no tag, so it stays in the text.
    assert_eq!(
        results("save"),
        [result(
            "^p-006",
            &snippet("Levi's techniques called Water<Less [save] water.")
        )]
    );
}

#[test]
fn the_names_of_tags_are_not_found_and_a_tag_keeps_the_words_on_its_two_sides_apart() {
    let _sandbox = indexed_sandbox();
    assert_eq!(results("sup"), nothing());
    assert_eq!(results("br"), nothing());
    assert_eq!(
        results("ranged"),
        [result(
            "^p-004",
            &snippet("Prices [ranged] from 96 29 /32 to 97 10 /32 that day.")
        )]
    );
    assert_eq!(
        results("29"),
        [result(
            "^p-004",
            &snippet("Prices ranged from 96 [29] /32 to 97 10 /32 that day.")
        )]
    );
    assert_eq!(
        results("performance"),
        [result("^p-005", &snippet("|Directional [Performance]|Very strong|"))]
    );
}

#[test]
fn only_search_marks_a_hit() {
    let _sandbox = indexed_sandbox();
    // The two characters in the book text are left out, so the window cannot take them for a hit.
    assert_eq!(
        results("compass"),
        [result("^p-001", &snippet("A font symbol  sits next to the [compass]."))]
    );
}

#[test]
fn rows_written_before_sec_01_are_written_again_even_when_the_chapter_file_did_not_change() {
    let _sandbox = indexed_sandbox();

    // Put back the rows that the index wrote before SEC-01: every paragraph as the chapter file has it, and the hash of
    // the file text alone.
    let conn = open_or_create_db().expect("open the sandbox cache");
    conn.execute("DELETE FROM search_index WHERE book_id = 'web'", [])
        .expect("delete the rows of the book");
    for block in WEB_CHAPTER.split("\n\n").skip(1) {
        let (text, anchor) = block.trim().rsplit_once(" ^p-").expect("an anchored paragraph");
        conn.execute(
            "INSERT INTO search_index (book_id, chapter_id, chapter_title, chapter_file, anchor, content)
             VALUES ('web', 'ch-01', 'Chapter 1: Tags', 'ch-01.md', ?1, ?2)",
            [format!("^p-{anchor}"), text.to_string()],
        )
        .expect("write an old row");
    }
    conn.execute(
        "UPDATE indexed_chapters SET content_hash = ?1 WHERE book_id = 'web' AND chapter_id = 'ch-01'",
        [sha256_of(WEB_CHAPTER)],
    )
    .expect("write the old hash");
    assert_eq!(results("sup").len(), 1, "the old rows are in the cache");

    let summary = index_vault_blocking().unwrap_or_else(|e| panic!("the index returned an error: {e:#}"));
    assert_eq!(
        summary.chapters_indexed, 1,
        "only the chapter with old rows is read again"
    );
    assert_eq!(results("sup"), nothing());
    assert_eq!(
        results("picture"),
        [result("^p-001", &snippet("Write  to show a [picture]."))]
    );
}
