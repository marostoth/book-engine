//! Stable ids for practice cards. A card's id comes from its question, not from its position in
//! `practice-deck.md`: a deck generated again keeps the progress of every unchanged question, and a
//! changed question becomes a new card.

/// Stored id of a practice card: `<book>-card-<hash>` for cloze and scramble cards, `<book>-sc-<hash>`
/// for scenario cards. The hash covers the card kind, the question, and the answer. The chapter file,
/// the anchor, and the deck position are left out, because importing a book again can renumber them.
pub fn card_identity(book_id: &str, item_type: &str, prompt: &str, answer: &str) -> String {
    let kind = if item_type == "scenario" { "sc" } else { "card" };
    let key = format!(
        "{item_type}\u{1f}{}\u{1f}{}",
        normalize(prompt),
        normalize(answer_identity(item_type, answer))
    );
    format!("{book_id}-{kind}-{:016x}", fnv1a_64(key.as_bytes()))
}

/// Lowercase text without Markdown emphasis or code marks and with single spaces, so formatting and
/// spacing edits keep a card's id.
fn normalize(text: &str) -> String {
    let without_marks: String = text.chars().filter(|c| !matches!(c, '*' | '_' | '`')).collect();
    without_marks
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// A scenario answer is stored as `(B) option text`. Only the text counts, so shuffled option
/// letters keep a card's id.
fn answer_identity<'a>(item_type: &str, answer: &'a str) -> &'a str {
    if item_type != "scenario" {
        return answer;
    }
    let mut chars = answer.chars();
    match (chars.next(), chars.next(), chars.next(), chars.next()) {
        (Some('('), Some(key), Some(')'), Some(' ')) if key.is_ascii_alphabetic() => chars.as_str(),
        _ => answer,
    }
}

/// FNV-1a, 64 bit. Unlike std's `DefaultHasher`, it gives the same value in every build.
fn fnv1a_64(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

#[cfg(test)]
mod tests {
    use super::{card_identity, fnv1a_64};

    const DIVISION: &str = "The {{c1::division of labour}} raises the productive powers of work.";

    #[test]
    fn ids_are_pinned_so_stored_cards_keep_their_ids_in_later_builds() {
        assert_eq!(fnv1a_64(b""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a_64(b"a"), 0xaf63_dc4c_8601_ec8c);
        assert_eq!(
            card_identity("sample", "cloze", DIVISION, "division of labour"),
            "sample-card-c0c3f0a469953c6c"
        );
        assert_eq!(
            card_identity(
                "sample",
                "scenario",
                "A workshop splits pin making into separate steps. What follows?",
                "(A) Output per worker rises."
            ),
            "sample-sc-41d716592c403a1b"
        );
    }

    #[test]
    fn formatting_spacing_case_and_option_letters_keep_the_id() {
        let id = card_identity("sample", "cloze", DIVISION, "division of labour");
        assert_eq!(
            id,
            card_identity(
                "sample",
                "cloze",
                "The  {{c1::**Division of Labour**}}\nraises the _productive_ powers of work.",
                "`division of labour`"
            )
        );
        assert_eq!(
            card_identity("sample", "scenario", "What follows?", "(A) Output per worker rises."),
            card_identity("sample", "scenario", "What follows?", "(C) Output per worker rises.")
        );
    }

    #[test]
    fn another_question_answer_kind_or_book_gets_another_id() {
        let id = card_identity("sample", "cloze", DIVISION, "division of labour");
        let pin_maker = "A {{c1::pin maker}} working alone can make few pins in a day.";
        assert_ne!(id, card_identity("sample", "cloze", pin_maker, "pin maker"));
        assert_ne!(id, card_identity("sample", "cloze", DIVISION, "productive powers"));
        assert_ne!(id, card_identity("sample", "scramble", DIVISION, "division of labour"));
        assert_ne!(
            id,
            card_identity("wealth-of-nations", "cloze", DIVISION, "division of labour")
        );
    }
}
