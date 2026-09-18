//! The text that search keeps of a paragraph, and the characters that mark a hit (SEC-01).
//!
//! A chapter file is Markdown, and Markdown can hold HTML: the PDF import writes `<sup>` and `<br>`. Search keeps the
//! words of the book as plain text, and the window shows a result as text, with a mark only around each hit.
//!
//! - An HTML tag or comment is left out. A tag is what CommonMark reads as raw HTML, so a `<` that starts no tag stays,
//!   like the one in "Water<Less, which". Between two characters that are not spaces, a tag becomes one space, so the
//!   words on its two sides stay two words: `96<sup>29</sup>` is found by "96" and by "29", as before.
//! - A character reference becomes the character it stands for: `&lt;`, `&gt;`, `&amp;`, `&quot;`, `&apos;`, `&nbsp;`,
//!   and the number forms (`&#60;`, `&#x3C;`). The book import writes a `<` or a `&` of the book text that way when it
//!   could be read as HTML, so search gets the text of the book back.
//! - `HIT_START` and `HIT_END` are left out, so only search puts them into a result.

/// Put before each hit in a search result snippet. `src/lib/searchSnippet.ts` uses the same character.
/// U+E000 and U+E001 are private-use characters: Unicode gives them no meaning.
pub const HIT_START: char = '\u{E000}';

/// Put after each hit in a search result snippet. `src/lib/searchSnippet.ts` uses the same character.
pub const HIT_END: char = '\u{E001}';

/// The text that search keeps of a paragraph of a chapter file.
#[expect(
    clippy::string_slice,
    reason = "every position comes from `find`, or is a length this file measured in bytes itself; the one `[..1]` follows a `<` or an `&`, which are one byte each"
)]
pub fn search_text(paragraph: &str) -> String {
    let mut text = String::with_capacity(paragraph.len());
    let mut rest = paragraph;
    while let Some(start) = rest.find(['<', '&']) {
        text.push_str(&rest[..start]);
        rest = &rest[start..];
        if let Some(length) = html_length(rest) {
            rest = &rest[length..];
            let after_a_word = text.chars().next_back().is_some_and(|last| !last.is_whitespace());
            let before_a_word = rest.chars().next().is_some_and(|next| !next.is_whitespace());
            if after_a_word && before_a_word {
                text.push(' ');
            }
        } else if let Some((character, length)) = character_reference(rest) {
            text.push(character);
            rest = &rest[length..];
        } else {
            // A `<` or a `&` that starts nothing is text. Both are one byte long.
            text.push_str(&rest[..1]);
            rest = &rest[1..];
        }
    }
    text.push_str(rest);
    text.retain(|character| character != HIT_START && character != HIT_END);
    text
}

/// The length in bytes of the HTML tag or comment at the start of `text`, or None when `text` does not start with
/// one. The forms are those of raw HTML in CommonMark: an opening tag with its attributes, a closing tag, a comment.
fn html_length(text: &str) -> Option<usize> {
    let bytes = text.as_bytes();
    if bytes.first() != Some(&b'<') {
        return None;
    }
    if text.starts_with("<!--") {
        return comment_length(text);
    }
    if bytes.get(1) == Some(&b'/') {
        let end = skip_spaces(bytes, 2 + name_length(&bytes[2..])?);
        return (bytes.get(end) == Some(&b'>')).then_some(end + 1);
    }
    let mut end = 1 + name_length(&bytes[1..])?;
    loop {
        let next = skip_spaces(bytes, end);
        match bytes.get(next) {
            Some(b'>') => return Some(next + 1),
            Some(b'/') => return (bytes.get(next + 1) == Some(&b'>')).then_some(next + 2),
            // An attribute starts with a letter, `_` or `:`, after at least one space.
            Some(&first) if next > end && (first.is_ascii_alphabetic() || first == b'_' || first == b':') => {
                end = attribute_end(bytes, next)?;
            }
            _ => return None,
        }
    }
}

/// The length of a comment at the start of `text`: `<!-->`, `<!--->`, or `<!--` and text up to the first `-->`.
#[expect(
    clippy::string_slice,
    reason = "`<!--` is four ASCII bytes and the text was just checked to start with it"
)]
fn comment_length(text: &str) -> Option<usize> {
    for empty in ["<!-->", "<!--->"] {
        if text.starts_with(empty) {
            return Some(empty.len());
        }
    }
    text[4..].find("-->").map(|end| 4 + end + 3)
}

/// The length of the tag name at the start of `bytes`: an ASCII letter, then ASCII letters, digits and hyphens.
fn name_length(bytes: &[u8]) -> Option<usize> {
    if !bytes.first()?.is_ascii_alphabetic() {
        return None;
    }
    Some(
        bytes
            .iter()
            .take_while(|&&byte| byte.is_ascii_alphanumeric() || byte == b'-')
            .count(),
    )
}

/// Where the attribute that starts at `start` ends: its name, then maybe `=` and a value. None when it has an `=` and
/// no valid value.
fn attribute_end(bytes: &[u8], start: usize) -> Option<usize> {
    let name_end = start
        + bytes[start..]
            .iter()
            .take_while(|&&byte| byte.is_ascii_alphanumeric() || b"_.:-".contains(&byte))
            .count();
    let equals = skip_spaces(bytes, name_end);
    if bytes.get(equals) != Some(&b'=') {
        return Some(name_end);
    }
    let value = skip_spaces(bytes, equals + 1);
    match bytes.get(value) {
        Some(&quote) if quote == b'"' || quote == b'\'' => {
            let length = bytes[value + 1..].iter().position(|&byte| byte == quote)?;
            Some(value + 1 + length + 1)
        }
        _ => {
            let length = bytes[value..]
                .iter()
                .take_while(|&&byte| !byte.is_ascii_whitespace() && !b"\"'=<>`".contains(&byte))
                .count();
            (length > 0).then_some(value + length)
        }
    }
}

/// The first place at or after `at` that is not an ASCII space, tab or line break.
fn skip_spaces(bytes: &[u8], at: usize) -> usize {
    at + bytes[at..].iter().take_while(|byte| byte.is_ascii_whitespace()).count()
}

/// The character that the character reference at the start of `text` stands for, and the length of the reference.
/// None when `text` does not start with one that search knows. A number that is no character gives U+FFFD.
#[expect(
    clippy::string_slice,
    reason = "the position is where an ASCII `;` was found among the bytes, so it is a letter boundary"
)]
fn character_reference(text: &str) -> Option<(char, usize)> {
    let body = text.strip_prefix('&')?;
    // The longest reference that search knows, `&#1114111;`, has 8 characters between `&` and `;`.
    let end = body.bytes().take(9).position(|byte| byte == b';')?;
    let name = &body[..end];
    let character = match name.strip_prefix('#') {
        Some(number) => {
            let value = match number.strip_prefix('x').or_else(|| number.strip_prefix('X')) {
                Some(hex) if (1..=6).contains(&hex.len()) && hex.bytes().all(|byte| byte.is_ascii_hexdigit()) => {
                    u32::from_str_radix(hex, 16).ok()?
                }
                None if (1..=7).contains(&number.len()) && number.bytes().all(|byte| byte.is_ascii_digit()) => {
                    number.parse().ok()?
                }
                _ => return None,
            };
            char::from_u32(value)
                .filter(|&character| character != '\0')
                .unwrap_or(char::REPLACEMENT_CHARACTER)
        }
        None => match name {
            "amp" => '&',
            "lt" => '<',
            "gt" => '>',
            "quot" => '"',
            "apos" => '\'',
            "nbsp" => '\u{A0}',
            _ => return None,
        },
    };
    Some((character, 1 + end + 1))
}

#[cfg(test)]
mod tests {
    use super::{search_text, HIT_END, HIT_START};

    #[test]
    fn tags_and_comments_are_left_out_and_keep_the_words_on_their_two_sides_apart() {
        let cases = [
            ("96<sup>29</sup> /32", "96 29 /32"),
            ("Directional<br>Performance", "Directional Performance"),
            ("Att<br/>Dir and Up<BR />Down", "Att Dir and Up Down"),
            ("<mark>TABLE 4.1</mark> Directional", "TABLE 4.1 Directional"),
            ("**<u>p</u>** ositioned", "** p ** ositioned"),
            ("Write <img src=x onerror=\"stolen=1\"> here", "Write  here"),
            ("a<span class='x y' data-n=1 hidden>b</span >c", "a b c"),
            ("a <!-- a note --> b, c<!---->d, e<!-->f", "a  b, c d, e f"),
            // CommonMark reads this as a tag too. The import writes such a `<` of the book text as `&lt;`.
            ("x <y and z> w", "x  w"),
        ];
        for (paragraph, expected) in cases {
            assert_eq!(search_text(paragraph), expected, "{paragraph}");
        }
    }

    #[test]
    fn a_less_than_sign_that_starts_no_tag_stays() {
        let paragraphs = [
            "techniques called Water<Less, which saves up to 96 percent",
            "So far, Water<Less innovations have saved more than 2 billion liters",
            "2 < 3, x<=y, <3 hearts, a<",
            "an unclosed <a href=\"x and a tag with no end <b",
            "a comment with no end <!-- here",
            "</ p> and </3> and <a =x>",
        ];
        for paragraph in paragraphs {
            assert_eq!(search_text(paragraph), paragraph);
        }
    }

    #[test]
    fn character_references_become_their_characters() {
        let cases = [
            ("&lt;img src=x&gt;", "<img src=x>"),
            ("AT&T wrote &amp;lt;", "AT&T wrote &lt;"),
            ("&quot;quoted&quot; and &apos;quoted&apos;", "\"quoted\" and 'quoted'"),
            ("a&nbsp;b", "a\u{A0}b"),
            ("&#60;b&#x3E; &#X3c; &#1114111;", "<b> < \u{10FFFF}"),
            ("&#0; &#xD800; &#x110000;", "\u{FFFD} \u{FFFD} \u{FFFD}"),
            // Not a reference that search knows: the text stays.
            (
                "AT&T; R&D &copy; &#; &#x; &#12345678; & lt; &",
                "AT&T; R&D &copy; &#; &#x; &#12345678; & lt; &",
            ),
        ];
        for (paragraph, expected) in cases {
            assert_eq!(search_text(paragraph), expected, "{paragraph}");
        }
    }

    #[test]
    fn text_that_a_reference_gives_is_never_read_as_a_tag() {
        assert_eq!(
            search_text("Write &lt;img src=x onerror=\"stolen=1\"> as text."),
            "Write <img src=x onerror=\"stolen=1\"> as text."
        );
    }

    #[test]
    fn the_characters_that_mark_a_hit_are_left_out() {
        assert_eq!(search_text("a \u{E000}symbol\u{E001} &#xE000;&#57345;"), "a symbol ");
    }

    #[test]
    fn the_window_marks_hits_with_the_same_characters() {
        let window = include_str!("../../../src/lib/searchSnippet.ts");
        for (name, character) in [("HIT_START", HIT_START), ("HIT_END", HIT_END)] {
            let line = format!("export const {name} = \"\\u{:X}\";", character as u32);
            assert!(
                window.contains(&line),
                "src/lib/searchSnippet.ts must have the line {line}"
            );
        }
    }
}
