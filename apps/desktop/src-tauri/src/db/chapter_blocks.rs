//! Which blocks of a chapter file hold text of the book, and which are headings (IN-08).
//!
//! A block is a heading only when Markdown reads it as one: one to six `#` marks, and then a space, a tab or the end
//! of the line. Every other block is text of the book, and search keeps it.
//!
//! A paragraph that starts with a `#` and a word, such as "#1 rule of the market" or a hashtag, used to count as a
//! heading here and in the import. It got no paragraph anchor, search left it out, and nothing said so.
//!
//! A `#` of the book text that would start a heading is written by the import as `&#35;`, so this rule reads the
//! block as text. `search_text` writes that character reference back as a `#`, so search finds the word behind it.

/// The greatest number of `#` marks that a Markdown heading can carry.
const MOST_MARKS: usize = 6;

/// True when Markdown reads `block` as a heading, so the block is no text of the book.
pub fn is_heading(block: &str) -> bool {
    let marks = block.bytes().take_while(|byte| *byte == b'#').count();
    (1..=MOST_MARKS).contains(&marks)
        && matches!(
            block.as_bytes().get(marks),
            None | Some(b' ') | Some(b'\t') | Some(b'\n')
        )
}
