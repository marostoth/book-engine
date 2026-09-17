//! Index tests: a broken book or chapter never stops the other books, and a book or a chapter that leaves the vault
//! leaves search (SI-02).

use crate::db::{index_vault_blocking, search_vault_blocking, IndexSummary, RenamedBook};
use crate::test_support::Sandbox;
use crate::vault::scan_library_books;

/// A damaged `_meta.json`: the file ends in the middle of its chapter list.
const DAMAGED_META: &str = r#"{ "book_id": "broken", "title": "Broken", "spine": [ "#;

/// Writes the book `id` with one chapter per text, `ch-01.md`, `ch-02.md`, ..., each chapter one paragraph.
fn write_book(sandbox: &Sandbox, id: &str, chapters: &[&str]) {
    write_book_in_folder(sandbox, id, id, chapters);
}

/// Writes a book like `write_book` into the folder `books/<folder>`, with a `_meta.json` that names it `book_id`.
fn write_book_in_folder(sandbox: &Sandbox, folder: &str, book_id: &str, chapters: &[&str]) {
    let spine: Vec<String> = (1..=chapters.len())
        .map(|n| format!(r#"{{ "id": "ch-{n:02}", "title": "Chapter {n}", "file_path": "ch-{n:02}.md", "order": {n} }}"#))
        .collect();
    sandbox.write(&format!("books/{folder}/_meta.json"), &book_meta(book_id, &spine.join(", ")));
    for (index, text) in chapters.iter().enumerate() {
        let n = index + 1;
        sandbox.write(&format!("books/{folder}/ch-{n:02}.md"), &format!("# Chapter {n}\n\n{text} ^p-001\n"));
    }
}

/// The `_meta.json` of the book `id`, with the chapters `spine` (JSON objects, without the brackets).
fn book_meta(id: &str, spine: &str) -> String {
    format!(r#"{{ "book_id": "{id}", "title": "Book {id}", "author": "Test Author", "spine": [{spine}] }}"#)
}

/// Runs the index. Panics when the run returns an error.
fn index() -> IndexSummary {
    index_vault_blocking().unwrap_or_else(|e| panic!("the index returned an error: {e:#}"))
}

/// Where a search finds its word: "book/chapter" for every hit, sorted.
fn found(query: &str) -> Vec<String> {
    let mut hits: Vec<String> = search_vault_blocking(query)
        .unwrap_or_else(|e| panic!("search {query:?} returned an error: {e:#}"))
        .into_iter()
        .map(|hit| format!("{}/{}", hit.book_id, hit.chapter_id))
        .collect();
    hits.sort();
    hits
}

/// The files that a run could not read, each with its reason, in the order the run gives them.
fn problems(summary: &IndexSummary) -> Vec<(String, String)> {
    summary.problems.iter().map(|problem| (problem.file.clone(), problem.reason.clone())).collect()
}

fn problem(file: &str, reason: &str) -> (String, String) {
    (file.to_string(), reason.to_string())
}

/// Why `DAMAGED_META` is not valid JSON, in the words of the index.
fn damaged_meta_reason() -> String {
    let error = serde_json::from_str::<serde_json::Value>(DAMAGED_META).expect_err("the damaged file must not parse");
    format!("is not valid JSON ({error})")
}

fn nothing() -> Vec<String> {
    Vec::new()
}

#[test]
fn one_broken_book_does_not_stop_the_other_books() {
    let sandbox = Sandbox::new();
    write_book(&sandbox, "healthy", &["Glaciers carved the fjords."]);
    index();

    // The reader adds a chapter to one book, and another book gets a damaged _meta.json.
    write_book(&sandbox, "healthy", &["Glaciers carved the fjords.", "Volcanoes raised the islands."]);
    sandbox.write("books/broken/_meta.json", DAMAGED_META);
    sandbox.write("books/broken/ch-01.md", "# Chapter 1\n\nMarmots whistle at dawn. ^p-001\n");

    let summary = index();
    assert_eq!(found("volcanoes"), ["healthy/ch-02"], "the healthy book is up to date");
    assert_eq!(found("glaciers"), ["healthy/ch-01"]);
    assert_eq!(found("marmots"), nothing(), "the damaged book is not read");
    assert_eq!(problems(&summary), [problem("books/broken/_meta.json", &damaged_meta_reason())], "the file is named");
}

#[test]
fn a_chapter_that_is_not_utf8_text_does_not_stop_its_book() {
    let sandbox = Sandbox::new();
    write_book(&sandbox, "mixed", &["Otters float on kelp.", "Cafe tables line the square."]);
    index();

    // The reader edits chapter 1, and chapter 2 is saved again in an old code page, where é is the byte 0xE9.
    write_book(&sandbox, "mixed", &["Otters float on kelp and sleep.", "Cafe tables line the square."]);
    std::fs::write(
        sandbox.vault().join("books/mixed/ch-02.md"),
        b"# Chapter 2\n\nCaf\xe9 tables line the square. ^p-001\n",
    )
    .expect("write chapter 2");

    let summary = index();
    assert_eq!(found("sleep"), ["mixed/ch-01"], "the other chapter of the book is up to date");
    assert_eq!(found("tables"), ["mixed/ch-02"], "the chapter keeps the text that search read last");
    assert_eq!(problems(&summary), [problem("books/mixed/ch-02.md", "is not UTF-8 text")]);
}

#[test]
fn a_book_that_cannot_be_read_keeps_its_search_results() {
    let sandbox = Sandbox::new();
    write_book(&sandbox, "broken", &["Pins are made in eighteen steps."]);
    index();
    assert_eq!(found("pins"), ["broken/ch-01"]);

    sandbox.write("books/broken/_meta.json", DAMAGED_META);
    let summary = index();
    // A file in OneDrive can be locked or offline for a moment, so search keeps what it read last.
    assert_eq!(found("pins"), ["broken/ch-01"], "the book keeps its search results");
    assert_eq!(problems(&summary), [problem("books/broken/_meta.json", &damaged_meta_reason())]);
}

#[test]
fn a_deleted_book_leaves_search() {
    let sandbox = Sandbox::new();
    write_book(&sandbox, "kept", &["Herons wade in the shallows."]);
    write_book(&sandbox, "deleted", &["Puffins nest on the cliffs."]);
    write_book(&sandbox, "unlisted", &["Lemmings cross the tundra."]);
    index();
    assert_eq!(found("puffins"), ["deleted/ch-01"]);
    assert_eq!(found("lemmings"), ["unlisted/ch-01"]);

    std::fs::remove_dir_all(sandbox.vault().join("books/deleted")).expect("delete the book");
    // A folder with no _meta.json is not a book, and the library does not list it.
    std::fs::remove_file(sandbox.vault().join("books/unlisted/_meta.json")).expect("remove _meta.json");

    let summary = index();
    assert_eq!(found("puffins"), nothing(), "a deleted book leaves search");
    assert_eq!(found("lemmings"), nothing(), "a folder with no _meta.json leaves search");
    assert_eq!(found("herons"), ["kept/ch-01"], "the other book stays");
    assert!(summary.problems.is_empty(), "{:?}", summary.problems);

    // A vault with no books folder has no books.
    std::fs::remove_dir_all(sandbox.vault().join("books")).expect("delete the books folder");
    index();
    assert_eq!(found("herons"), nothing());
}

#[test]
fn a_chapter_that_leaves_its_book_leaves_search() {
    let sandbox = Sandbox::new();
    write_book(&sandbox, "atlas", &["Deserts cover a third of the land.", "Rivers carry silt to the sea."]);
    index();
    assert_eq!(found("rivers"), ["atlas/ch-02"]);

    // A new import of the book has one chapter.
    std::fs::remove_file(sandbox.vault().join("books/atlas/ch-02.md")).expect("remove chapter 2");
    write_book(&sandbox, "atlas", &["Deserts cover a third of the land."]);

    let summary = index();
    assert_eq!(found("rivers"), nothing(), "the chapter the book no longer lists leaves search");
    assert_eq!(found("deserts"), ["atlas/ch-01"]);
    assert!(summary.problems.is_empty(), "{:?}", summary.problems);
}

#[test]
fn a_chapter_file_that_is_missing_is_named_and_leaves_search() {
    let sandbox = Sandbox::new();
    write_book(&sandbox, "atlas", &["Deserts cover a third of the land.", "Rivers carry silt to the sea."]);
    index();
    assert_eq!(found("rivers"), ["atlas/ch-02"]);

    // _meta.json still lists chapter 2.
    std::fs::remove_file(sandbox.vault().join("books/atlas/ch-02.md")).expect("remove chapter 2");

    let summary = index();
    assert_eq!(found("rivers"), nothing(), "the text is gone, so search does not find it");
    assert_eq!(found("deserts"), ["atlas/ch-01"]);
    assert_eq!(problems(&summary), [problem("books/atlas/ch-02.md", "is missing, but _meta.json lists it")]);
}

#[test]
fn a_chapter_list_that_cannot_be_used_is_named() {
    let sandbox = Sandbox::new();
    sandbox.write("books/no-list/_meta.json", r#"{ "book_id": "no-list", "title": "No List" }"#);
    sandbox.write(
        "books/no-id/_meta.json",
        &book_meta(
            "no-id",
            r#"{ "title": "Preface", "file_path": "ch-01.md" }, { "id": "ch-02", "title": "Chapter 2", "file_path": "ch-02.md" }"#,
        ),
    );
    sandbox.write("books/no-id/ch-01.md", "# Preface\n\nBadgers dig setts. ^p-001\n");
    sandbox.write("books/no-id/ch-02.md", "# Chapter 2\n\nBeavers build dams. ^p-001\n");

    let summary = index();
    assert_eq!(found("beavers"), ["no-id/ch-02"], "the chapter with an id and a file is read");
    assert_eq!(
        problems(&summary),
        [
            problem("books/no-id/_meta.json", "lists a chapter with no \"id\" or no \"file_path\" (number 1 in \"spine\")"),
            problem("books/no-list/_meta.json", "has no chapter list (\"spine\")"),
        ]
    );
}

/// The library and search know a book by the name of its folder, so a search hit opens its book. The library used to
/// take the `book_id` in `_meta.json`, so after a folder was renamed, a hit named a book that the library did not list
/// (LC-02).
#[test]
fn search_and_the_library_know_a_book_by_its_folder_name() {
    let sandbox = Sandbox::new();
    write_book_in_folder(&sandbox, "smith", "wealth-of-nations", &["Pins are made in eighteen steps."]);

    index();
    let library: Vec<String> = scan_library_books().expect("read the library").into_iter().map(|book| book.id).collect();
    assert_eq!(library, ["smith"]);
    assert_eq!(found("pins"), ["smith/ch-01"]);
}

/// A book folder that was renamed is named with its old name. Its notes and study progress are kept under that name, so
/// the app does not show them (LC-02).
#[test]
fn a_renamed_book_folder_is_named_with_its_old_name() {
    let sandbox = Sandbox::new();
    // Renamed: the notes have the name in _meta.json, and no book folder has that name.
    write_book_in_folder(&sandbox, "smith", "wealth-of-nations", &["Pins are made in eighteen steps."]);
    sandbox.write("notes/wealth-of-nations/ch-01-notes.md", "# Notes\n");
    // A copy of a book that is still in the vault: the notes belong to that book.
    write_book(&sandbox, "hume", &["Custom is the great guide of human life."]);
    write_book_in_folder(&sandbox, "hume-copy", "hume", &["Custom is the great guide of human life."]);
    sandbox.write("notes/hume/ch-01-notes.md", "# Notes\n");
    // No notes have the name in _meta.json, so nothing is hidden.
    write_book_in_folder(&sandbox, "fresh", "draft", &["Nothing was read here yet."]);

    let summary = index();
    assert_eq!(
        summary.renamed_books,
        [RenamedBook { folder: "smith".to_string(), old_name: "wealth-of-nations".to_string() }]
    );
    assert!(summary.problems.is_empty(), "{:?}", summary.problems);
}

/// Search finds the paragraphs of a chapter at the same line breaks as the reader: `\r\n` and a lone `\r` are line
/// breaks, as `\n` is. A chapter with `\r` line endings was one block that starts with its heading, so search had none of
/// its words (IN-06).
#[test]
fn search_finds_each_paragraph_of_a_chapter_with_any_line_ending() {
    let sandbox = Sandbox::new();
    let chapter = "# Chapter 1\n\nMarmots whistle at dawn. ^p-001\n\nBeavers build dams at dusk. ^p-002\n";
    let spine = r#"{ "id": "ch-01", "title": "Chapter 1", "file_path": "ch-01.md", "order": 1 }"#;
    for (id, line_ending) in [("unix", "\n"), ("windows", "\r\n"), ("old-mac", "\r")] {
        sandbox.write(&format!("books/{id}/_meta.json"), &book_meta(id, spine));
        sandbox.write(&format!("books/{id}/ch-01.md"), &chapter.replace('\n', line_ending));
    }
    index();

    for (word, anchor) in [("marmots", "^p-001"), ("beavers", "^p-002")] {
        let mut hits: Vec<(String, String)> = search_vault_blocking(word)
            .unwrap_or_else(|e| panic!("search {word:?} returned an error: {e:#}"))
            .into_iter()
            .map(|hit| (hit.book_id, hit.anchor))
            .collect();
        hits.sort();
        let expected: Vec<(String, String)> =
            ["old-mac", "unix", "windows"].iter().map(|id| (id.to_string(), anchor.to_string())).collect();
        assert_eq!(hits, expected, "every book finds {word:?} in its own paragraph");
    }
}
