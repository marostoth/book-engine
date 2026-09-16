//! Tests for the chapter highlights file: the notes pane can no longer erase a highlight (DS-05),
//! and the move out of the old notes comment keeps the reader's own text.

use crate::test_support::Sandbox;
use crate::vault::models::HighlightItem;
use crate::vault::{
    load_chapter_highlights, read_chapter_highlights, read_notes_file, save_chapter_highlights,
    write_notes_file,
};

const BOOK: &str = "sample";
const CHAPTER: &str = "ch-01.md";
const NOTES_FILE: &str = "notes/sample/ch-01-notes.md";
const HIGHLIGHTS_FILE: &str = "notes/sample/ch-01-highlights.json";

fn highlight(id: &str, exact: &str) -> HighlightItem {
    HighlightItem {
        id: id.to_string(),
        exact: exact.to_string(),
        prefix: "In distributed computing, ".to_string(),
        suffix: " at a specific point in time".to_string(),
        anchor: Some("^p-001".to_string()),
        color: Some("amber".to_string()),
        created_at: "2026-09-16T00:00:00Z".to_string(),
    }
}

/// A notes file in the old shape: the machine comment, the quote line, and the reader's own text.
fn old_notes(exact: &str) -> String {
    format!(
        "# Reflections: Chapter 1\n\n\
         ## Highlights\n\n\
         <!-- highlights-json [{{\"id\":\"hl-1\",\"exact\":\"{exact}\",\"prefix\":\"\",\"suffix\":\"\",\"anchor\":\"^p-001\",\"color\":\"amber\",\"createdAt\":\"2026-09-11T12:00:00Z\"}}] -->\n\n\
         > \"{exact}\" (^p-001)\n\n\
         ## Key Takeaways\n\n\
         - Specialization raises output. (^p-001)\n"
    )
}

fn names_in_notes_folder(sandbox: &Sandbox) -> Vec<String> {
    let dir = sandbox.vault().join("notes").join(BOOK);
    let mut names: Vec<String> = std::fs::read_dir(&dir)
        .expect("read the notes folder")
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    names.sort();
    names
}

/// The bug this fix is for: the notes pane saves the text it loaded a moment ago, over a file that
/// a new highlight has just been written into. With one writer per file that cannot happen.
#[test]
fn a_notes_save_does_not_erase_a_new_highlight() {
    let sandbox = Sandbox::new();
    sandbox.write(NOTES_FILE, "# Reflections: Chapter 1\n\n- the text the pane loaded\n");
    let pane_copy = read_notes_file(BOOK, "ch-01-notes.md").expect("the pane loads the notes");

    save_chapter_highlights(BOOK, CHAPTER, vec![highlight("hl-1", "atomically")]).expect("save a highlight");
    write_notes_file(BOOK, "ch-01-notes.md", &format!("{pane_copy}- and one more line\n"))
        .expect("the pane saves its own copy");

    let saved = read_chapter_highlights(BOOK, CHAPTER).expect("read the highlights back");
    assert_eq!(saved.len(), 1, "the highlight must survive a notes save");
    assert_eq!(saved[0].exact, "atomically");
}

#[test]
fn a_highlight_save_does_not_change_the_notes_file() {
    let sandbox = Sandbox::new();
    let written = "# Reflections: Chapter 1\n\n- a line the reader wrote\n";
    sandbox.write(NOTES_FILE, written);

    save_chapter_highlights(BOOK, CHAPTER, vec![highlight("hl-1", "atomically")]).expect("save a highlight");

    assert_eq!(read_notes_file(BOOK, "ch-01-notes.md").expect("read the notes"), written);
}

#[test]
fn highlights_are_saved_and_read_back() {
    let _sandbox = Sandbox::new();

    assert!(read_chapter_highlights(BOOK, CHAPTER).expect("a chapter with no file").is_empty());

    let two = vec![highlight("hl-1", "atomically"), highlight("hl-2", "vector clocks")];
    save_chapter_highlights(BOOK, CHAPTER, two.clone()).expect("save two highlights");

    assert_eq!(read_chapter_highlights(BOOK, CHAPTER).expect("read back"), two);
}

#[test]
fn a_chapter_without_highlights_gets_no_file() {
    let sandbox = Sandbox::new();
    sandbox.write(NOTES_FILE, "# Reflections: Chapter 1\n\n- just writing, no highlights\n");

    assert!(load_chapter_highlights(BOOK, CHAPTER).expect("load").is_empty());
    assert_eq!(names_in_notes_folder(&sandbox), vec!["ch-01-notes.md"], "no empty file may be made");
}

#[test]
fn old_highlights_move_into_their_own_file_and_keep_the_notes_text() {
    let sandbox = Sandbox::new();
    sandbox.write(NOTES_FILE, &old_notes("all operations appear to execute atomically"));

    let moved = load_chapter_highlights(BOOK, CHAPTER).expect("move the old highlights");

    assert_eq!(moved.len(), 1, "the saved highlight must come across");
    assert_eq!(moved[0].exact, "all operations appear to execute atomically");
    assert_eq!(moved[0].anchor.as_deref(), Some("^p-001"));
    assert_eq!(moved[0].created_at, "2026-09-11T12:00:00Z");

    let notes = read_notes_file(BOOK, "ch-01-notes.md").expect("read the notes");
    assert!(!notes.contains("highlights-json"), "the machine comment must be gone:\n{notes}");
    assert!(!notes.contains("## Highlights"), "the empty heading must be gone:\n{notes}");
    assert!(notes.contains("# Reflections: Chapter 1"), "the title must stay:\n{notes}");
    assert!(notes.contains("## Key Takeaways"), "the reader's headings must stay:\n{notes}");
    assert!(notes.contains("- Specialization raises output. (^p-001)"), "the reader's text must stay:\n{notes}");

    assert_eq!(
        names_in_notes_folder(&sandbox),
        vec!["ch-01-highlights.json", "ch-01-notes.md"],
        "the highlights must have their own file"
    );
}

#[test]
fn a_move_runs_only_once() {
    let sandbox = Sandbox::new();
    sandbox.write(NOTES_FILE, &old_notes("atomically"));

    load_chapter_highlights(BOOK, CHAPTER).expect("first load moves the highlights");
    let after_move = read_notes_file(BOOK, "ch-01-notes.md").expect("read the notes");

    assert_eq!(load_chapter_highlights(BOOK, CHAPTER).expect("second load").len(), 1);
    assert_eq!(read_notes_file(BOOK, "ch-01-notes.md").expect("read again"), after_move);
}

#[test]
fn a_move_keeps_the_readers_own_text_under_a_highlights_heading() {
    let sandbox = Sandbox::new();
    let notes = old_notes("atomically").replace(
        "## Key Takeaways",
        "- my own note about this quote\n\n## Key Takeaways",
    );
    sandbox.write(NOTES_FILE, &notes);

    load_chapter_highlights(BOOK, CHAPTER).expect("move the old highlights");

    let after = read_notes_file(BOOK, "ch-01-notes.md").expect("read the notes");
    assert!(after.contains("## Highlights"), "a heading with the reader's text under it must stay:\n{after}");
    assert!(after.contains("- my own note about this quote"), "the reader's text must stay:\n{after}");
    assert!(!after.contains("highlights-json"), "the machine comment must still go:\n{after}");
    assert!(!after.contains("> \"atomically\""), "the quote line the app wrote must go:\n{after}");
}

#[test]
fn a_damaged_old_comment_moves_nothing_and_changes_nothing() {
    let sandbox = Sandbox::new();
    let damaged = "# Reflections\n\n## Highlights\n\n<!-- highlights-json [{\"id\":\"hl-1\",\"exact\":\"cut off -->\n\n- my own note\n";
    sandbox.write(NOTES_FILE, damaged);

    let error = load_chapter_highlights(BOOK, CHAPTER).expect_err("a damaged comment must not be moved");

    assert!(error.to_string().contains("ch-01-notes.md"), "the error must name the file: {error}");
    assert_eq!(read_notes_file(BOOK, "ch-01-notes.md").expect("read back"), damaged, "the notes must be untouched");
    assert_eq!(names_in_notes_folder(&sandbox), vec!["ch-01-notes.md"], "no highlights file may be made");
}

#[test]
fn a_damaged_highlights_file_is_never_saved_over() {
    let sandbox = Sandbox::new();
    let damaged = "[{\"id\":\"hl-1\",\"exact\":\"cut off";
    sandbox.write(HIGHLIGHTS_FILE, damaged);

    let error = save_chapter_highlights(BOOK, CHAPTER, vec![highlight("hl-2", "new")])
        .expect_err("a damaged highlights file must refuse the save");

    assert!(error.to_string().contains("ch-01-highlights.json"), "the error must name the file: {error}");
    let on_disk = std::fs::read_to_string(sandbox.vault().join(HIGHLIGHTS_FILE)).expect("read back");
    assert_eq!(on_disk, damaged, "the damaged file must stay exactly as it was");
}

#[test]
fn a_quote_holding_an_end_of_comment_marker_is_saved_and_read_back() {
    let _sandbox = Sandbox::new();
    let tricky = "a quote that holds --> inside it";

    save_chapter_highlights(BOOK, CHAPTER, vec![highlight("hl-1", tricky)]).expect("save the tricky quote");

    let saved = read_chapter_highlights(BOOK, CHAPTER).expect("read back");
    assert_eq!(saved.len(), 1, "a quote with --> must not break the file");
    assert_eq!(saved[0].exact, tricky);
}

/// A quote may hold `-->`, which is also the end of an HTML comment. The old notes comment then
/// looked cut off to a reader that stopped at the first `-->`, and every highlight in that chapter
/// was lost (DS-06).
#[test]
fn old_highlights_move_over_even_when_a_quote_holds_an_end_of_comment_marker() {
    let sandbox = Sandbox::new();
    sandbox.write(NOTES_FILE, &old_notes("the arrow --> points right"));

    let moved = load_chapter_highlights(BOOK, CHAPTER).expect("a quote with an arrow must still move");

    assert_eq!(moved.len(), 1, "the highlight must come across");
    assert_eq!(moved[0].exact, "the arrow --> points right");

    let notes = read_notes_file(BOOK, "ch-01-notes.md").expect("read the notes");
    assert!(!notes.contains("highlights-json"), "the machine comment must be gone:\n{notes}");
    assert!(notes.contains("## Key Takeaways"), "the reader's text must stay:\n{notes}");
}

#[test]
fn old_highlights_move_over_when_a_later_quote_holds_the_marker() {
    let sandbox = Sandbox::new();
    let two = "[{\"id\":\"hl-1\",\"exact\":\"plain quote\",\"prefix\":\"\",\"suffix\":\"\",\"anchor\":\"^p-001\",\"createdAt\":\"2026-09-11T12:00:00Z\"},{\"id\":\"hl-2\",\"exact\":\"and --> here\",\"prefix\":\"\",\"suffix\":\"\",\"anchor\":\"^p-002\",\"createdAt\":\"2026-09-11T12:01:00Z\"}]";
    sandbox.write(
        NOTES_FILE,
        &format!("# Reflections\n\n## Highlights\n\n<!-- highlights-json {two} -->\n\n## Key Takeaways\n\n- my own line\n"),
    );

    let moved = load_chapter_highlights(BOOK, CHAPTER).expect("both highlights must move");

    assert_eq!(moved.len(), 2, "no highlight may be dropped");
    assert_eq!(moved[1].exact, "and --> here");
    let notes = read_notes_file(BOOK, "ch-01-notes.md").expect("read the notes");
    assert!(!notes.contains("highlights-json"), "the machine comment must be gone:\n{notes}");
    assert!(notes.contains("- my own line"), "the reader's text must stay:\n{notes}");
}

#[test]
fn text_after_the_old_comment_is_never_swallowed() {
    let sandbox = Sandbox::new();
    sandbox.write(
        NOTES_FILE,
        "# Reflections\n\n## Highlights\n\n<!-- highlights-json [] -->\n\n## Key Takeaways\n\n- a line with [ and ] in it\n",
    );

    assert!(load_chapter_highlights(BOOK, CHAPTER).expect("an empty list is fine").is_empty());

    let notes = read_notes_file(BOOK, "ch-01-notes.md").expect("read the notes");
    assert!(notes.contains("- a line with [ and ] in it"), "the reader's text must stay:\n{notes}");
}

#[test]
fn old_highlights_move_over_when_the_stored_context_holds_the_marker() {
    let sandbox = Sandbox::new();
    let one = "[{\"id\":\"hl-1\",\"exact\":\"plain quote\",\"prefix\":\"\",\"suffix\":\" and then --> onwards\",\"anchor\":\"^p-001\",\"createdAt\":\"2026-09-11T12:00:00Z\"}]";
    sandbox.write(
        NOTES_FILE,
        &format!("# Reflections\n\n<!-- highlights-json {one} -->\n\n## Key Takeaways\n\n- my own line\n"),
    );

    let moved = load_chapter_highlights(BOOK, CHAPTER).expect("an arrow in the context must still move");

    assert_eq!(moved.len(), 1, "the highlight must come across");
    assert_eq!(moved[0].suffix, " and then --> onwards");
    let notes = read_notes_file(BOOK, "ch-01-notes.md").expect("read the notes");
    assert!(!notes.contains("highlights-json"), "the machine comment must be gone:\n{notes}");
    assert!(notes.contains("- my own line"), "the reader's text must stay:\n{notes}");
}

#[test]
fn a_heading_of_the_readers_own_that_starts_with_the_same_word_is_kept() {
    let sandbox = Sandbox::new();
    let notes = old_notes("atomically").replace(
        "## Key Takeaways",
        "## Highlights and lowlights\n\n- what worked and what did not\n\n## Key Takeaways",
    );
    sandbox.write(NOTES_FILE, &notes);

    load_chapter_highlights(BOOK, CHAPTER).expect("move the old highlights");

    let after = read_notes_file(BOOK, "ch-01-notes.md").expect("read the notes");
    assert!(after.contains("## Highlights and lowlights"), "the reader's own heading must stay:\n{after}");
    assert!(after.contains("- what worked and what did not"), "the text under it must stay:\n{after}");
    assert!(!after.contains("highlights-json"), "the machine comment must go:\n{after}");
}

#[test]
fn a_hand_edit_that_breaks_the_list_moves_nothing_and_changes_nothing() {
    let sandbox = Sandbox::new();
    // The comma between the two entries was deleted by hand.
    let broken = "[{\"id\":\"hl-1\",\"exact\":\"one\",\"createdAt\":\"\"}{\"id\":\"hl-2\",\"exact\":\"two\",\"createdAt\":\"\"}]";
    let notes = format!("# Reflections\n\n<!-- highlights-json {broken} -->\n\n- my own line\n");
    sandbox.write(NOTES_FILE, &notes);

    let error = load_chapter_highlights(BOOK, CHAPTER).expect_err("a broken list must not be moved");

    assert!(error.to_string().contains("ch-01-notes.md"), "the error must name the file: {error}");
    assert_eq!(read_notes_file(BOOK, "ch-01-notes.md").expect("read back"), notes, "the notes must be untouched");
    assert_eq!(names_in_notes_folder(&sandbox), vec!["ch-01-notes.md"], "no highlights file may be made");
}
