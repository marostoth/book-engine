//! A block of a chapter file is a heading only when Markdown reads it as one (IN-08).

use super::chapter_blocks::is_heading;

#[test]
fn a_heading_of_the_book_is_a_heading() {
    assert!(is_heading("# An Inquiry into the Nature and Causes of the Wealth of Nations"));
    assert!(is_heading("## CHAPTER I. OF THE DIVISION OF LABOUR"));
    assert!(is_heading("###### PART I. Of the Expense of Defence."));
}

#[test]
fn a_paragraph_that_starts_with_a_hash_and_a_word_is_text() {
    assert!(!is_heading("#1 rule of the market is that price is the only thing that pays you."));
    assert!(!is_heading("#MarketProfile is where traders of the pit first learned to read the day."));
}

#[test]
fn more_than_six_marks_make_no_heading() {
    assert!(!is_heading("####### seven marks are too many for a heading, so this line is text."));
}

#[test]
fn marks_with_nothing_after_them_are_a_heading_with_no_words() {
    assert!(is_heading("#"));
    assert!(is_heading("######"));
    assert!(!is_heading("#######"));
}

#[test]
fn a_tab_after_the_marks_is_a_heading_too() {
    assert!(is_heading("#\tOF THE DIVISION OF LABOUR"));
}

#[test]
fn the_first_line_alone_says_what_a_block_is() {
    assert!(is_heading("# PRICES OF WHEAT\nand a second line"));
    assert!(!is_heading("Year Prices/Quarter\n# 12"));
}

#[test]
fn a_block_that_starts_with_no_mark_is_text() {
    assert!(!is_heading(""));
    assert!(!is_heading("The great commerce of every civilized society."));
    assert!(!is_heading("&#35; PRICES OF WHEAT"));
}

// A `#` of the book text that would start a heading is written by the import as `&#35;`. Search must give the word
// behind it back, so a reader who looks for "PRICES" finds the paragraph.
#[test]
fn search_reads_the_written_hash_as_a_hash_again() {
    assert_eq!(
        super::search_text::search_text("&#35; PRICES OF WHEAT"),
        "# PRICES OF WHEAT"
    );
    assert_eq!(super::search_text::search_text("&#35;## Three marks"), "### Three marks");
}
