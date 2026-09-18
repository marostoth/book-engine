//! CQ-06: a citation in a report points at its passage, and the report says which quotes are still there.
//!
//! The links used to start at `vault/`, which is where the repository starts and not where the report is, and they
//! left the paragraph anchor out. So every link in a report led nowhere, and nothing ever read a quote back from the
//! book it came from.

use crate::test_support::Sandbox;
use crate::vault::syntopicon::{export_syntopic_report, save_syntopic_topic};
use crate::vault::syntopicon_check::{
    check_citation, citations_of, paragraph_at, place_of, quote_is_there, CitationCheck,
};
use crate::vault::syntopicon_compiler::compile_dialectical_dossier;
use crate::vault::syntopicon_models::*;

/// The first paragraph of the sandbox `sample` book, as `write_sample_book` writes it.
const FIRST_PARAGRAPH: &str = "The division of labour raises the productive powers of work.";

fn cite(book_id: &str, chapter_file: &str, anchor: &str, quote: &str) -> CrossBookCitation {
    CrossBookCitation {
        book_id: book_id.into(),
        chapter_file: chapter_file.into(),
        anchor: anchor.into(),
        quote: quote.into(),
    }
}

/// A topic that cites `first` under a neutral term and `second` under a controversy.
fn topic_citing(first: CrossBookCitation, second: CrossBookCitation) -> SyntopicTopic {
    SyntopicTopic {
        id: "division-of-labor".into(),
        title: "Division of Labor".into(),
        description: "How work is split.".into(),
        neutral_terms: vec![NeutralTerm {
            id: "term-1".into(),
            term: "Operational Specialization".into(),
            neutral_definition: "Splitting a process into bounded tasks.".into(),
            mappings: vec![TermMapping {
                book_id: first.book_id.clone(),
                author_variant: "Division of work".into(),
                author_term_id: None,
                citation: first,
            }],
        }],
        questions: vec![SyntopicQuestion {
            id: "q-1".into(),
            question: "Does splitting work raise output?".into(),
            order: 1,
        }],
        controversies: vec![SyntopicControversy {
            id: "c-1".into(),
            question_id: "q-1".into(),
            title: "Output and its costs".into(),
            perspectives: vec![SyntopicPerspective {
                book_id: second.book_id.clone(),
                stance: "Output rises.".into(),
                argument_ids: None,
                citations: vec![second],
            }],
        }],
        synthesis_notes: Some("The authors agree on output.".into()),
        dialectical_resolution: Some("Splitting work pays while talking stays cheap.".into()),
        created_at: "2026-09-13T10:00:00Z".into(),
    }
}

// ---------------------------------------------------------------------------- where a citation points

#[test]
fn the_place_of_a_citation_climbs_out_of_the_reports_folder_and_names_the_paragraph() {
    let place = place_of(&cite("sample", "ch-01.md", "^p-001", FIRST_PARAGRAPH)).expect("a place");

    assert_eq!(place, "../../books/sample/ch-01.md#^p-001");
}

#[test]
fn a_report_link_opens_the_chapter_file_it_names() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    let report_folder = sandbox.vault().join("syntopicon").join("reports");
    std::fs::create_dir_all(&report_folder).expect("make the reports folder");

    let place = place_of(&cite("sample", "ch-01.md", "^p-001", FIRST_PARAGRAPH)).expect("a place");
    let opened = report_folder.join(place.split('#').next().expect("a file"));

    assert!(
        opened.is_file(),
        "the link must reach a chapter file: {}",
        opened.display()
    );
    assert!(std::fs::read_to_string(&opened).expect("read it").contains("^p-001"));
}

#[test]
fn a_citation_with_no_anchor_still_links_to_its_chapter() {
    let place = place_of(&cite("sample", "ch-01.md", "", FIRST_PARAGRAPH)).expect("a place");

    assert_eq!(place, "../../books/sample/ch-01.md");
}

#[test]
fn a_name_the_vault_cannot_hold_gets_no_link_at_all() {
    assert_eq!(place_of(&cite("../secret", "ch-01.md", "^p-001", "x")), None);
    assert_eq!(place_of(&cite("sample", "../../etc/passwd", "^p-001", "x")), None);
    assert_eq!(place_of(&cite("sample", "notes.md", "^p-001", "x")), None);
    assert_eq!(place_of(&cite("", "ch-01.md", "^p-001", "x")), None);
}

#[test]
fn an_anchor_that_is_not_an_anchor_is_left_out_of_the_link() {
    let odd = place_of(&cite("sample", "ch-01.md", ") [click](http://elsewhere)", "x")).expect("a place");

    assert_eq!(odd, "../../books/sample/ch-01.md");
    assert_eq!(
        place_of(&cite("sample", "ch-01.md", "^p-01", "x")).expect("a place"),
        "../../books/sample/ch-01.md"
    );
}

// ---------------------------------------------------------------------------- reading a quote back

#[test]
fn a_paragraph_is_found_by_the_anchor_at_its_end() {
    let chapter = "# Chapter 1\n\nFirst one here. ^p-001\n\nSecond one here. ^p-002\n";

    assert_eq!(paragraph_at(chapter, "^p-001").as_deref(), Some("First one here."));
    assert_eq!(paragraph_at(chapter, "^p-002").as_deref(), Some("Second one here."));
    assert_eq!(paragraph_at(chapter, "^p-003"), None);
}

#[test]
fn a_chapter_whose_lines_end_the_old_way_is_read_the_same() {
    let old_way = "# Chapter 1\r\n\r\nFirst one here. ^p-001\r\n\r\nSecond one here. ^p-002\r\n";

    assert_eq!(paragraph_at(old_way, "^p-001").as_deref(), Some("First one here."));
    assert_eq!(paragraph_at(old_way, "^p-002").as_deref(), Some("Second one here."));
}

#[test]
fn an_anchor_inside_a_word_is_not_the_anchor_of_that_paragraph() {
    assert_eq!(paragraph_at("A word^p-001\n", "^p-001"), None);
    assert_eq!(paragraph_at("A longer one. ^p-0012\n", "^p-001"), None);
}

#[test]
fn a_quote_that_a_line_wrap_cut_is_still_the_same_quote() {
    let paragraph = "The greatest improvements in the\nproductive powers of labour seem to\nhave been the effects.";

    assert!(quote_is_there(
        "The greatest improvements in the productive powers of labour",
        paragraph
    ));
    assert!(quote_is_there(
        "**productive** powers of labour \u{2014} seem to have been",
        paragraph
    ));
    assert!(!quote_is_there("the greatest failures of labour", paragraph));
    assert!(!quote_is_there("   ", paragraph));
}

#[test]
fn a_citation_of_the_book_in_the_vault_is_checked() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();

    assert_eq!(
        check_citation(&cite("sample", "ch-01.md", "^p-001", FIRST_PARAGRAPH)),
        CitationCheck::Checked
    );
}

#[test]
fn each_way_a_citation_can_fail_is_told_apart() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();

    assert_eq!(
        check_citation(&cite("sample", "ch-01.md", "^p-001", "   ")),
        CitationCheck::NoQuote,
        "a citation with no quote has nothing to check"
    );
    assert_eq!(
        check_citation(&cite("gone-away", "ch-01.md", "^p-001", FIRST_PARAGRAPH)),
        CitationCheck::ChapterNotRead,
        "a book that left the vault cannot be read"
    );
    assert_eq!(
        check_citation(&cite("sample", "ch-09.md", "^p-001", FIRST_PARAGRAPH)),
        CitationCheck::ChapterNotRead,
        "a chapter the book does not have cannot be read"
    );
    assert_eq!(
        check_citation(&cite("sample", "ch-01.md", "^p-777", FIRST_PARAGRAPH)),
        CitationCheck::ParagraphNotThere,
        "an anchor the chapter does not hold names no paragraph"
    );
    assert_eq!(
        check_citation(&cite("sample", "ch-01.md", "^p-002", FIRST_PARAGRAPH)),
        CitationCheck::QuoteNotThere,
        "the quote of the first paragraph is not in the second one"
    );
}

#[test]
fn every_citation_of_a_topic_is_counted_once_for_each_place_it_is_shown() {
    let topic = topic_citing(
        cite("sample", "ch-01.md", "^p-001", FIRST_PARAGRAPH),
        cite("sample", "ch-01.md", "^p-002", "A pin maker working alone"),
    );

    assert_eq!(citations_of(&topic).len(), 2);
    assert_eq!(citations_of(&topic)[0].anchor, "^p-001");
    assert_eq!(citations_of(&topic)[1].anchor, "^p-002");
}

// ---------------------------------------------------------------------------- what the report says

#[test]
fn the_report_links_every_citation_to_its_paragraph() {
    let topic = topic_citing(
        cite("sample", "ch-01.md", "^p-001", FIRST_PARAGRAPH),
        cite("sample", "ch-01.md", "^p-002", "A pin maker working alone"),
    );

    let report = compile_dialectical_dossier(&topic, &|_| CitationCheck::Checked);

    assert!(report.contains("](../../books/sample/ch-01.md#^p-001)"), "{report}");
    assert!(report.contains("](../../books/sample/ch-01.md#^p-002)"), "{report}");
    assert!(
        !report.contains("](vault/books/"),
        "a link must not start at the repository: {report}"
    );
    assert!(
        report.contains("**Citations checked:** all 2 quotes are in the paragraph they name."),
        "{report}"
    );
}

#[test]
fn the_report_marks_a_quote_that_is_not_in_its_paragraph_any_more() {
    let topic = topic_citing(
        cite("sample", "ch-01.md", "^p-001", FIRST_PARAGRAPH),
        cite("sample", "ch-01.md", "^p-002", "Words the book never wrote"),
    );

    let report = compile_dialectical_dossier(&topic, &|citation| {
        if citation.anchor == "^p-002" {
            CitationCheck::QuoteNotThere
        } else {
            CitationCheck::Checked
        }
    });

    assert!(
        report.contains("**Citations checked:** 1 of 2 quotes are in the paragraph they name."),
        "{report}"
    );
    assert!(
        report.contains("*read this again: the paragraph does not hold this quote now*"),
        "{report}"
    );
    assert_eq!(
        report.matches("read this again").count(),
        1,
        "only the one that failed is marked: {report}"
    );
}

#[test]
fn a_topic_that_cites_nothing_says_so_and_marks_nothing() {
    let mut topic = topic_citing(
        cite("sample", "ch-01.md", "^p-001", FIRST_PARAGRAPH),
        cite("sample", "ch-01.md", "^p-002", "A pin maker"),
    );
    topic.neutral_terms[0].mappings.clear();
    topic.controversies[0].perspectives[0].citations.clear();

    let report = compile_dialectical_dossier(&topic, &|_| CitationCheck::Checked);

    assert!(
        report.contains("**Citations checked:** this topic cites no passage yet."),
        "{report}"
    );
    assert!(!report.contains("not checked"), "{report}");
}

#[test]
fn two_citations_of_one_paragraph_with_different_quotes_are_checked_apart() {
    let topic = topic_citing(
        cite("sample", "ch-01.md", "^p-001", FIRST_PARAGRAPH),
        cite("sample", "ch-01.md", "^p-001", "Words the book never wrote"),
    );

    let report = compile_dialectical_dossier(&topic, &|citation| {
        if citation.quote == FIRST_PARAGRAPH {
            CitationCheck::Checked
        } else {
            CitationCheck::QuoteNotThere
        }
    });

    assert!(
        report.contains("**Citations checked:** 1 of 2 quotes are in the paragraph they name."),
        "{report}"
    );
    assert_eq!(report.matches("read this again").count(), 1, "{report}");
}

#[test]
fn an_exported_report_holds_links_that_open_from_where_it_is_saved() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    let topic = topic_citing(
        cite("sample", "ch-01.md", "^p-001", FIRST_PARAGRAPH),
        cite(
            "sample",
            "ch-01.md",
            "^p-002",
            "A pin maker working alone can make few pins",
        ),
    );
    save_syntopic_topic(topic).expect("save the topic");

    let written = export_syntopic_report("division-of-labor").expect("export the report");
    assert_eq!(written, "reports/division-of-labor-synthesis.md");

    let report_path = sandbox
        .vault()
        .join("syntopicon")
        .join("reports")
        .join("division-of-labor-synthesis.md");
    let report = std::fs::read_to_string(&report_path).expect("read the report");
    assert!(
        report.contains("**Citations checked:** all 2 quotes are in the paragraph they name."),
        "{report}"
    );

    // Follow every link the way a reader would: from the folder the report is saved in.
    let mut followed = 0;
    for piece in report.split("](").skip(1) {
        let href = piece.split(')').next().expect("a link target");
        let (file, anchor) = href.split_once('#').unwrap_or((href, ""));
        let target = report_path.parent().expect("the reports folder").join(file);
        assert!(
            target.is_file(),
            "the link {href} reaches nothing: {}",
            target.display()
        );
        let chapter = std::fs::read_to_string(&target).expect("read the chapter");
        assert!(
            paragraph_at(&chapter, anchor).is_some(),
            "the link {href} names no paragraph"
        );
        followed += 1;
    }
    assert_eq!(followed, 2, "both citations must be links: {report}");
}

#[test]
fn an_exported_report_says_plainly_when_a_cited_book_has_left_the_vault() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    let topic = topic_citing(
        cite("sample", "ch-01.md", "^p-001", FIRST_PARAGRAPH),
        cite("gone-away", "ch-01.md", "^p-001", "A book that is not here"),
    );
    save_syntopic_topic(topic).expect("save the topic");

    export_syntopic_report("division-of-labor").expect("export the report");

    let report = std::fs::read_to_string(
        sandbox
            .vault()
            .join("syntopicon")
            .join("reports")
            .join("division-of-labor-synthesis.md"),
    )
    .expect("read the report");
    assert!(
        report.contains("**Citations checked:** 1 of 2 quotes are in the paragraph they name."),
        "{report}"
    );
    assert!(
        report.contains("*not checked: the vault does not have this chapter now*"),
        "{report}"
    );
}
