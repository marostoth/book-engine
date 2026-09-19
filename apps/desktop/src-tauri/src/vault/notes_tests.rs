//! What the notes drawer shows for each line of a chapter's notes (RD-08).
//!
//! The notes pane writes a saved quote as `> "the sentence" (#^p-001)` and an empty `- Reflection: ` line under it,
//! from `quoteBlock` in `apps/desktop/src/lib/notesQuote.ts`. Nothing tested what came back out, and what came back
//! out was `> "the sentence" (#` and a bare `Reflection:`.
//!
//! `WRITTEN_QUOTE_LINE` and `WRITTEN_PROMPT_LINE` below are that block character for character.
//! `packages/ingestion/tests/test_one_note_format.py` reads them out of this file and checks that `notesQuote.ts`
//! still writes exactly that, and that `notesAggregator.ts` — which answers for the backend in browser dev mode —
//! is held to the same answers. Three files have to agree, so no one of them can be read on its own.

use super::notes::note_text_and_anchor;

/// The quote line `quoteBlock` writes, character for character.
const WRITTEN_QUOTE_LINE: &str = r#"> "Price is the great communicator." (#^p-001)"#;

/// The empty prompt `quoteBlock` writes under it. The trailing space is real.
const WRITTEN_PROMPT_LINE: &str = "- Reflection: ";

/// What the drawer must show for the quote line: the sentence alone, with the anchor kept apart from it.
const QUOTE_SHOWS: &str = "Price is the great communicator.";
const QUOTE_ANCHOR: &str = "^p-001";

#[test]
fn the_quote_the_pane_writes_comes_back_as_the_sentence_alone() {
    let (text, anchor) = note_text_and_anchor(WRITTEN_QUOTE_LINE).expect("a quote line has something to show");

    assert_eq!(text, QUOTE_SHOWS, "the drawer must show the sentence, not its Markdown");
    assert_eq!(
        anchor.as_deref(),
        Some(QUOTE_ANCHOR),
        "the paragraph anchor is kept, apart from the text"
    );
}

#[test]
fn no_markdown_of_the_written_quote_survives() {
    let (text, _) = note_text_and_anchor(WRITTEN_QUOTE_LINE).expect("a quote line has something to show");

    for leftover in ['>', '(', ')', '#', '^', '"'] {
        assert!(
            !text.contains(leftover),
            "the drawer still shows {leftover:?} from the Markdown: {text}"
        );
    }
}

#[test]
fn the_empty_reflection_prompt_is_not_a_note() {
    assert_eq!(
        note_text_and_anchor(WRITTEN_PROMPT_LINE),
        None,
        "an empty prompt is the pane asking for a thought, not a thought"
    );
}

#[test]
fn a_reflection_with_words_keeps_the_words_and_drops_the_label() {
    let (text, anchor) = note_text_and_anchor("- Reflection: the auction never stops").expect("a written thought");

    assert_eq!(
        text, "the auction never stops",
        "the card prints the section heading as its own label, so the body must not repeat it"
    );
    assert_eq!(anchor, None);
}

#[test]
fn text_after_an_anchor_is_not_thrown_away() {
    let (text, anchor) = note_text_and_anchor("See ^p-012 for the rest").expect("a note with an anchor in the middle");

    assert_eq!(
        text, "See for the rest",
        "everything after the anchor used to be dropped"
    );
    assert_eq!(anchor.as_deref(), Some("^p-012"));
}

#[test]
fn a_plain_bullet_is_shown_as_it_was_written() {
    let (text, anchor) = note_text_and_anchor("- Vector clocks need no wall clock.").expect("a plain note");

    assert_eq!(text, "Vector clocks need no wall clock.");
    assert_eq!(anchor, None);
}

#[test]
fn a_note_keeps_one_quote_mark_of_its_own() {
    let (text, _) = note_text_and_anchor(r#"- He called it "value" here, and value area later"#)
        .expect("a note that quotes one word");

    assert_eq!(
        text, r#"He called it "value" here, and value area later"#,
        "only a pair around the whole line is taken off"
    );
}

/// A pair is a pair at BOTH ends. A mutation run found this gap: stripping only the opening mark broke five other
/// tests, and none of them was the one about keeping a quote mark of its own, because that note does not start with
/// one.
#[test]
fn a_note_that_opens_with_a_quote_mark_and_does_not_close_keeps_it() {
    let (text, _) = note_text_and_anchor(r#"- "value" is his word for it"#).expect("a note that opens with a quote");

    assert_eq!(
        text, r#""value" is his word for it"#,
        "the opening mark belongs to the word, not to the whole line"
    );
}

#[test]
fn curly_quote_marks_come_off_too() {
    let (text, anchor) =
        note_text_and_anchor("> \u{201c}The market is an auction.\u{201d} (#^p-007)").expect("a quote");

    assert_eq!(
        text, "The market is an auction.",
        "a book's curly quotes are still quotes"
    );
    assert_eq!(
        anchor.as_deref(),
        Some("^p-007"),
        "the anchor survives a curly quote too"
    );
}

#[test]
fn nothing_to_show_is_nothing() {
    for line in [
        "",
        "   ",
        "-",
        "- ",
        ">",
        "> ",
        "*",
        "\u{2022}",
        "- Reflection:",
        "> \"\"",
    ] {
        assert_eq!(note_text_and_anchor(line), None, "{line:?} has nothing to show");
    }
}

#[test]
fn markers_in_any_order_are_all_stripped() {
    for line in [r#"- > "A sentence." (#^p-003)"#, r#"> - "A sentence." (#^p-003)"#] {
        let (text, anchor) = note_text_and_anchor(line).expect("a quote however its markers were written");
        assert_eq!(text, "A sentence.", "{line}");
        assert_eq!(anchor.as_deref(), Some("^p-003"), "{line}");
    }
}

#[test]
fn a_bare_anchor_with_no_bracket_still_works() {
    let (text, anchor) = note_text_and_anchor("- A thought ^p-042").expect("a note with an anchor at the end");

    assert_eq!(text, "A thought");
    assert_eq!(anchor.as_deref(), Some("^p-042"));
}

#[test]
fn a_line_that_is_only_an_anchor_is_not_a_note() {
    assert_eq!(
        note_text_and_anchor("> (#^p-001)"),
        None,
        "an anchor with no words is a leftover, not something to read"
    );
}

/// The anchor is read with a character-safe cut, so a quote in any language must not crash the parse (TL-10).
#[test]
fn a_quote_in_another_alphabet_does_not_panic() {
    for line in [
        "> \u{201c}\u{0426}\u{0435}\u{043d}\u{0430} \u{0433}\u{043e}\u{0432}\u{043e}\u{0440}\u{0438}\u{0442}.\u{201d} (#^p-001)",
        "> \"Le prix parle \u{00e0} celui qui \u{00e9}coute.\" (#^p-002)",
        "> \"\u{4fa1}\u{683c}\u{306f}\u{8a9e}\u{308b}\u{3002}\" (#^p-003)",
        "\u{2022} \u{2460} A circled digit starts this note",
    ] {
        let shown = note_text_and_anchor(line);
        assert!(shown.is_some(), "{line} must read as a note");
        let (text, _) = shown.expect("checked just above");
        assert!(!text.starts_with('>'), "the marker must come off whatever follows it: {text}");
    }
}
