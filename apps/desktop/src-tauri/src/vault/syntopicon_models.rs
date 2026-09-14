use serde::{Deserialize, Serialize};

/// Represents a cross-book citation anchoring to a specific book, chapter, and paragraph anchor.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CrossBookCitation {
    pub book_id: String,
    pub chapter_file: String,
    pub anchor: String,
    pub quote: String,
}

/// Maps an author's specific idiosyncratic vocabulary back to the neutral syntopical term.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TermMapping {
    pub book_id: String,
    pub author_variant: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_term_id: Option<String>,
    pub citation: CrossBookCitation,
}

/// A syntopical neutral term constructed by the reader (Rule 2: Bringing the authors to terms).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NeutralTerm {
    pub id: String,
    pub term: String,
    pub neutral_definition: String,
    #[serde(default)]
    pub mappings: Vec<TermMapping>,
}

/// A syntopic question framed across the authors (Rule 3: Framing the questions).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyntopicQuestion {
    pub id: String,
    pub question: String,
    pub order: u32,
}

/// An author or book perspective on a framed syntopic question/issue.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyntopicPerspective {
    pub book_id: String,
    pub stance: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub argument_ids: Option<Vec<String>>,
    #[serde(default)]
    pub citations: Vec<CrossBookCitation>,
}

/// A controversy defining opposing author positions on a question (Rule 4: Defining the issues).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyntopicControversy {
    pub id: String,
    pub question_id: String,
    pub title: String,
    #[serde(default)]
    pub perspectives: Vec<SyntopicPerspective>,
}

/// Full record of a syntopical topic stored at `vault/syntopicon/topics/<topic-id>.json`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyntopicTopic {
    pub id: String,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub neutral_terms: Vec<NeutralTerm>,
    #[serde(default)]
    pub questions: Vec<SyntopicQuestion>,
    #[serde(default)]
    pub controversies: Vec<SyntopicControversy>,
    #[serde(default)]
    pub synthesis_notes: Option<String>,
    #[serde(default)]
    pub dialectical_resolution: Option<String>,
    pub created_at: String,
}

/// Compact summary of a syntopical topic for index listings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyntopicTopicSummary {
    pub id: String,
    pub title: String,
    pub description: String,
    pub term_count: usize,
    pub question_count: usize,
    pub controversy_count: usize,
    pub books_involved: Vec<String>,
    pub created_at: String,
}
