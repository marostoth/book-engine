//! Card check tests: a quiz card is kept only when its rationale quotes the paragraph of its anchor (`fsrs_parser.rs`).
//! On Windows the importer wrote chapters with `\r\n` line endings, and the check found paragraphs at `\n\n`, so it took
//! the whole chapter as the paragraph: a rationale that quoted another paragraph passed (IN-06).

use crate::db::fsrs_parser::parse_card_section;
use crate::test_support::Sandbox;

const CHAPTER: &str =
    "# Chapter 1: The Tides\n\nSpring tides come twice a month. ^p-001\n\nNeap tides come between them. ^p-002\n";

/// A quiz card at `anchor` whose rationale quotes `quote`, as the practice deck holds it after `### `.
fn quiz_card(anchor: &str, quote: &str) -> String {
    format!(
        "Scenario: sc-ch-01-001\n\
         - **Chapter:** ch-01\n\
         - **Anchor:** {anchor}\n\
         **Scenario:** A skipper plans a trip. How often do spring tides come?\n\
         - [x] (A) Twice a month.\n\
         - [ ] (B) Once a year.\n\
         - [ ] (C) Every day.\n\
         > **Rationale:** The text states: \"{quote}\"\n"
    )
}

#[test]
fn a_quiz_card_that_quotes_another_paragraph_is_left_out_with_any_line_ending() {
    let sandbox = Sandbox::new();
    let book = sandbox.vault().join("books").join("tides");
    for (name, line_ending) in [("unix", "\n"), ("windows", "\r\n"), ("old mac", "\r")] {
        sandbox.write("books/tides/ch-01.md", &CHAPTER.replace('\n', line_ending));

        let own_paragraph = quiz_card("^p-001", "Spring tides come twice a month.");
        assert!(
            parse_card_section(&own_paragraph, &book).is_some(),
            "{name} line endings: the quote is in ^p-001"
        );
        let other_paragraph = quiz_card("^p-002", "Spring tides come twice a month.");
        assert!(
            parse_card_section(&other_paragraph, &book).is_none(),
            "{name} line endings: the quote is not in ^p-002"
        );
    }
}
