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

// ---------------------------------------------------------------------------
// A card may hold any letter of any book (TL-10)
// ---------------------------------------------------------------------------

/// A quiz card whose four options are `options`, written as the practice deck writes them.
fn quiz_with_options(options: &[(&str, bool)]) -> String {
    let mut card = String::from(
        "Scenario: sc-ch-01-002\n\
         - **Chapter:** ch-01\n\
         - **Anchor:** ^p-001\n\
         **Scenario:** A skipper plans a trip. How often do spring tides come?\n",
    );
    for (text, correct) in options {
        card.push_str(&format!("- [{}] {text}\n", if *correct { "x" } else { " " }));
    }
    card.push_str("> **Rationale:** Spring tides come twice a month.\n");
    card
}

#[test]
fn an_option_labelled_with_a_letter_that_is_not_ascii_does_not_crash() {
    // The check counted characters and then cut bytes: `rest.chars().nth(2) == Some(')')` said the `)` was the
    // third character of `(①) Twice a month.`, and `rest[3..]` then cut inside the `①`, which is three bytes
    // long. Rust stops the whole program there, and that panic rolled back the entire deck sync, so one option
    // in a book that numbers with circled digits, or any non-Latin script, lost every card of the run.
    let sandbox = Sandbox::new();
    let book = sandbox.vault().join("books").join("tides");
    sandbox.write("books/tides/ch-01.md", CHAPTER);

    for label in ["(①)", "(Ⅰ)", "(é)", "(А)"] {
        let card = quiz_with_options(&[
            (&format!("{label} Twice a month."), true),
            ("(B) Once a year.", false),
            ("(C) Every day.", false),
        ]);
        let parsed = parse_card_section(&card, &book).unwrap_or_else(|| panic!("{label}: the card was dropped"));
        let payload = parsed.scenario_payload.expect("the card has no options");
        assert_eq!(payload.options.len(), 3, "{label}: an option was lost");
        assert_eq!(
            payload.options[0].text, "Twice a month.",
            "{label}: the option text keeps part of its own label"
        );
    }
}

#[test]
fn an_option_numbered_with_a_letter_that_is_not_ascii_does_not_crash() {
    // The other branch, `1. text`, had the same fault: `rest.chars().nth(1) == Some('.')` and then `rest[2..]`.
    let sandbox = Sandbox::new();
    let book = sandbox.vault().join("books").join("tides");
    sandbox.write("books/tides/ch-01.md", CHAPTER);

    for label in ["①.", "é.", "А."] {
        let card = quiz_with_options(&[
            (&format!("{label} Twice a month."), true),
            ("B. Once a year.", false),
            ("C. Every day.", false),
        ]);
        let parsed = parse_card_section(&card, &book).unwrap_or_else(|| panic!("{label}: the card was dropped"));
        let payload = parsed.scenario_payload.expect("the card has no options");
        assert_eq!(
            payload.options[0].text, "Twice a month.",
            "{label}: the option text is wrong"
        );
    }
}

#[test]
fn a_citation_comment_names_the_chapter_it_really_names() {
    // `l.strip_prefix("<!--").and_then(|s| s.find("citation:"))` searches the text AFTER the `<!--`, and the
    // offset it gives was then used on the whole line. Four bytes out: `<!-- citation: ch-01.md#^p-003 -->`
    // named the chapter `tion: ch-01.md`, so the card pointed at a file that is not in any vault.
    let sandbox = Sandbox::new();
    let book = sandbox.vault().join("books").join("tides");
    sandbox.write("books/tides/ch-01.md", CHAPTER);

    let card = "Scenario: sc-ch-01-003\n\
                <!-- citation: ch-01.md#^p-001 -->\n\
                **Scenario:** A skipper plans a trip. How often do spring tides come?\n\
                - [x] (A) Twice a month.\n\
                - [ ] (B) Once a year.\n\
                - [ ] (C) Every day.\n\
                > **Rationale:** Spring tides come twice a month.\n";

    let parsed = parse_card_section(card, &book).expect("the card was dropped");
    assert_eq!(
        parsed.chapter_file, "ch-01.md",
        "the citation comment named the wrong chapter"
    );
    assert_eq!(
        parsed.anchor, "^p-001",
        "the citation comment named the wrong paragraph"
    );
}
