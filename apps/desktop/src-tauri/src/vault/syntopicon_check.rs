//! Where a topic citation points, and whether its quote is still in the book (CQ-06).
//!
//! A report is written to `vault/syntopicon/reports/<topic-id>-synthesis.md` (`paths::topic_report_path`), and the
//! books are in `vault/books/<book-id>/`. So a link from a report to a passage climbs two folders. The links used to
//! start at `vault/`, which is where the repository starts and not where the report is, so every one of them led
//! nowhere; and they left the paragraph anchor out, so a link that did open a chapter opened it at the top.
//!
//! A citation is free text: the reader can type the book, the chapter file, the anchor and the quote. So the names go
//! through the same rule as every other path the page sends (SEC-03), and a name that breaks the rule gets no link at
//! all. The quote is compared by its letters and digits only, in lower case, which is how `ingest/places.py` decides
//! that two paragraphs are the same one. So a line wrap, a changed dash or an added mark makes no difference, and only
//! real text does.

use super::syntopicon_models::{CrossBookCitation, SyntopicTopic};

/// How a report in `vault/syntopicon/reports/` reaches `vault/books/`.
const UP_TO_THE_BOOKS: &str = "../../books";

/// The fewest digits of a paragraph anchor, as the importer writes them: `^p-001`.
const ANCHOR_DIGITS: usize = 3;

/// What a report can say about one citation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CitationCheck {
    /// The quote is in the paragraph that the citation names.
    Checked,
    /// The citation keeps no quote, so there is nothing to check.
    NoQuote,
    /// That chapter of that book could not be read from the vault.
    ChapterNotRead,
    /// The chapter is there, and it has no paragraph with that anchor.
    ParagraphNotThere,
    /// The paragraph is there, and it does not hold the quote.
    QuoteNotThere,
}

impl CitationCheck {
    /// What the report says beside the citation, or `None` when the quote is there and needs no word.
    pub fn says(self) -> Option<&'static str> {
        match self {
            CitationCheck::Checked => None,
            CitationCheck::NoQuote => Some("not checked: this citation keeps no quote"),
            CitationCheck::ChapterNotRead => Some("not checked: the vault does not have this chapter now"),
            CitationCheck::ParagraphNotThere => Some("not checked: this chapter has no such paragraph now"),
            CitationCheck::QuoteNotThere => Some("read this again: the paragraph does not hold this quote now"),
        }
    }
}

/// True for a paragraph anchor the importer writes: `^p-` and 3 or more digits.
fn is_an_anchor(anchor: &str) -> bool {
    anchor
        .strip_prefix("^p-")
        .is_some_and(|digits| digits.len() >= ANCHOR_DIGITS && digits.bytes().all(|b| b.is_ascii_digit()))
}

/// Where the passage is, as a link from the report to the chapter and the paragraph. `None` when the book id or the
/// chapter file is not a name the vault can hold, because such a name must never go inside a link.
pub fn place_of(citation: &CrossBookCitation) -> Option<String> {
    super::paths::check_book_id(&citation.book_id).ok()?;
    super::paths::check_chapter_file(&citation.chapter_file).ok()?;
    let chapter = format!("{UP_TO_THE_BOOKS}/{}/{}", citation.book_id, citation.chapter_file);
    Some(if is_an_anchor(&citation.anchor) {
        format!("{chapter}#{}", citation.anchor)
    } else {
        chapter
    })
}

/// Only the letters and digits of `text`, in lower case. The rule that `words_of` in `ingest/places.py` uses.
fn letters_and_digits(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

/// The paragraph of `chapter` whose last word is `anchor`, with the anchor taken off. A chapter imported before
/// IN-06 still ends its lines with CRLF, so the line endings are made the same before the blank lines are found.
pub fn paragraph_at(chapter: &str, anchor: &str) -> Option<String> {
    if !is_an_anchor(anchor) {
        return None;
    }
    chapter
        .replace("\r\n", "\n")
        .split("\n\n")
        .map(str::trim)
        .find_map(|block| {
            let text = block.strip_suffix(anchor)?;
            (text.is_empty() || text.ends_with(char::is_whitespace)).then(|| text.trim_end().to_string())
        })
}

/// True when the paragraph holds the quote, counting letters and digits only.
pub fn quote_is_there(quote: &str, paragraph: &str) -> bool {
    let wanted = letters_and_digits(quote);
    !wanted.is_empty() && letters_and_digits(paragraph).contains(&wanted)
}

/// Reads the book in the vault and says whether the quote is still in the paragraph the citation names.
pub fn check_citation(citation: &CrossBookCitation) -> CitationCheck {
    if citation.quote.trim().is_empty() {
        return CitationCheck::NoQuote;
    }
    let Ok(chapter) = super::reader::read_chapter_file(&citation.book_id, &citation.chapter_file) else {
        return CitationCheck::ChapterNotRead;
    };
    match paragraph_at(&chapter, &citation.anchor) {
        None => CitationCheck::ParagraphNotThere,
        Some(paragraph) if quote_is_there(&citation.quote, &paragraph) => CitationCheck::Checked,
        Some(_) => CitationCheck::QuoteNotThere,
    }
}

/// Every citation of the topic, once for each place the report shows it.
pub fn citations_of(topic: &SyntopicTopic) -> Vec<&CrossBookCitation> {
    let mut all: Vec<&CrossBookCitation> = Vec::new();
    for term in &topic.neutral_terms {
        all.extend(term.mappings.iter().map(|mapping| &mapping.citation));
    }
    for controversy in &topic.controversies {
        for perspective in &controversy.perspectives {
            all.extend(perspective.citations.iter());
        }
    }
    all
}
