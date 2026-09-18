//! Turns a typed search into an FTS5 MATCH expression that is always valid.
//!
//! - A search needs at least `MIN_QUERY_CHARS` characters. Spaces at the start and the end do not count.
//! - Every word and every quoted phrase goes to FTS5 as a string, so the index tokenizer
//!   (`porter unicode61`) splits it like the book text: `don't`, `well-known`, and `U.S.` match.
//! - A word with hyphens between letters or digits (`e-mail`) also matches its spelling without them (`email`).
//! - A word matches longer words (`labo` finds "labour") when its last part has at least 2 letters or digits,
//!   or when it ends in `*`. A word that ends in other punctuation (`C++`, `U.S.`) or in a 1-letter part
//!   (the `t` of `don't`) matches only itself: a 1-letter prefix is slow and matches almost any word.
//! - `"quotes"` search an exact phrase. A phrase with no closing quote is still being typed,
//!   so its last word can match longer words.
//! - `AND`, `OR`, and `NOT` in capitals are operators; lowercase `and`, `or`, and `not` are words.
//!   Words with no operator between them must all match. They are joined with an explicit `AND`,
//!   so `war NOT peace north` means (war NOT peace) AND north.
//! - When operators stand next to each other, the last one counts (`war AND NOT peace`).
//!   An operator with no word after it is left out, and so is an `AND` or `OR` with no word before it.
//!   A `NOT` with no word before it finds nothing: FTS5 cannot list every paragraph without a word.

/// The fewest characters a search needs. `src/lib/searchQuery.ts` uses the same number.
pub const MIN_QUERY_CHARS: usize = 2;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Operator {
    And,
    Or,
    Not,
}

impl Operator {
    fn from_word(word: &str) -> Option<Self> {
        match word {
            "AND" => Some(Self::And),
            "OR" => Some(Self::Or),
            "NOT" => Some(Self::Not),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::And => "AND",
            Self::Or => "OR",
            Self::Not => "NOT",
        }
    }
}

enum Item {
    Operator(Operator),
    /// A word or a phrase in FTS5 syntax.
    Term(String),
}

/// Returns the FTS5 MATCH expression for a typed search, or `None` when there is nothing to search.
pub fn fts5_match_expression(query: &str) -> Option<String> {
    let query = query.trim();
    if query.chars().count() < MIN_QUERY_CHARS {
        return None;
    }

    let mut parts: Vec<String> = Vec::new();
    let mut operator = None;
    for item in scan(query) {
        match item {
            Item::Operator(next) => operator = Some(next),
            Item::Term(term) => {
                let between = operator.take();
                if parts.is_empty() {
                    if between == Some(Operator::Not) {
                        return None;
                    }
                } else {
                    parts.push(between.unwrap_or(Operator::And).as_str().to_string());
                }
                parts.push(term);
            }
        }
    }
    (!parts.is_empty()).then(|| parts.join(" "))
}

/// Splits a search into operators, words, and quoted phrases.
fn scan(query: &str) -> Vec<Item> {
    let mut items = Vec::new();
    let mut chars = query.chars().peekable();
    while let Some(&first) = chars.peek() {
        if first.is_whitespace() {
            chars.next();
        } else if first == '"' {
            chars.next();
            let mut phrase = String::new();
            let mut closed = false;
            for c in chars.by_ref() {
                if c == '"' {
                    closed = true;
                    break;
                }
                phrase.push(c);
            }
            items.extend(phrase_term(&phrase, closed).map(Item::Term));
        } else {
            let mut word = String::new();
            while let Some(c) = chars.next_if(|c| !c.is_whitespace()) {
                word.push(c);
            }
            match Operator::from_word(&word) {
                Some(operator) => items.push(Item::Operator(operator)),
                None => items.extend(word_term(&word).map(Item::Term)),
            }
        }
    }
    items
}

/// A typed word in FTS5 syntax. A word with hyphens between letters or digits (`e-mail`)
/// also matches its spelling without them.
fn word_term(word: &str) -> Option<String> {
    let body = word.trim_end_matches('*');
    let prefix = matches_longer_words(word, body);
    let term = fts5_string(body, prefix)?;
    let parts: Vec<&str> = body.split('-').collect();
    let hyphenated = parts.len() > 1
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.chars().all(char::is_alphanumeric));
    let joined = if hyphenated {
        fts5_string(&parts.concat(), prefix)
    } else {
        None
    };
    Some(match joined {
        Some(joined) => format!("({term} OR {joined})"),
        None => term,
    })
}

/// A quoted phrase in FTS5 syntax. Only a phrase with no closing quote can match longer words.
fn phrase_term(phrase: &str, closed: bool) -> Option<String> {
    let body = phrase.trim_end_matches('*');
    fts5_string(body, !closed && matches_longer_words(phrase, body))
}

/// True when typed text also matches longer words: it ends in `*` (`body` is the text without it),
/// or its last part has at least 2 letters or digits.
fn matches_longer_words(text: &str, body: &str) -> bool {
    body.len() < text.len() || body.chars().rev().take_while(|c| c.is_alphanumeric()).count() >= 2
}

/// Text as an FTS5 string, or `None` when it has no letter or digit, because FTS5 finds no word in it.
fn fts5_string(text: &str, prefix: bool) -> Option<String> {
    if !text.chars().any(char::is_alphanumeric) {
        return None;
    }
    let star = if prefix { "*" } else { "" };
    Some(format!("\"{}\"{star}", text.replace('"', "\"\"")))
}

#[cfg(test)]
mod tests {
    use super::fts5_match_expression;

    #[test]
    fn typed_searches_become_valid_fts5_expressions() {
        let cases = [
            ("war", Some(r#""war"*"#)),
            ("war peace", Some(r#""war"* AND "peace"*"#)),
            ("war and peace", Some(r#""war"* AND "and"* AND "peace"*"#)),
            ("war OR peace", Some(r#""war"* OR "peace"*"#)),
            ("war AND NOT peace", Some(r#""war"* NOT "peace"*"#)),
            ("OR war AND", Some(r#""war"*"#)),
            ("NOT war", None),
            (
                "don't well-known",
                Some(r#""don't" AND ("well-known"* OR "wellknown"*)"#),
            ),
            ("e-mail NOT spam", Some(r#"("e-mail"* OR "email"*) NOT "spam"*"#)),
            ("U.S.-based -war", Some(r#""U.S.-based"* AND "-war"*"#)),
            ("C++ U.S.", Some(r#""C++" AND "U.S.""#)),
            ("vitamin c", Some(r#""vitamin"* AND "c""#)),
            ("labo* a*", Some(r#""labo"* AND "a"*"#)),
            (r#""division of labour""#, Some(r#""division of labour""#)),
            (r#""division of lab"#, Some(r#""division of lab"*"#)),
            (r#"war"peace"#, Some(r#""war""peace"*"#)),
            (" w ", None),
            (r#"-- "" ?!"#, None),
        ];
        for (query, expected) in cases {
            assert_eq!(fts5_match_expression(query).as_deref(), expected, "{query}");
        }
    }
}
