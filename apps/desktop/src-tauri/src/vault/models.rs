use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum AppError {
    #[error("Vault not found: {0}")]
    VaultNotFound(String),
    #[error("I/O error: {0}")]
    Io(String),
    #[error("Serialization error: {0}")]
    Serialization(String),
    #[error("Internal error: {0}")]
    Internal(String),
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ElementaryMetrics {
    #[serde(default)]
    pub flesch_kincaid_grade: f64,
    #[serde(default)]
    pub avg_sentence_length_words: f64,
    #[serde(default)]
    pub estimated_reading_minutes: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct InspectionalSampling {
    #[serde(default)]
    pub head_anchors: Vec<String>,
    #[serde(default)]
    pub tail_anchors: Vec<String>,
    #[serde(default)]
    pub head_text_preview: String,
    #[serde(default)]
    pub tail_text_preview: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExitAssessmentPayload {
    pub classification: String,
    pub unity_statement: String,
    pub parts_structure: Vec<String>,
    pub completed_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct InspectionalBlueprint {
    #[serde(default)]
    pub front_matter: serde_json::Value,
    #[serde(default)]
    pub pivotal_chapters: Vec<String>,
    #[serde(default)]
    pub synthetic_index_clusters: Vec<serde_json::Value>,
    #[serde(default)]
    pub exit_assessment: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ChapterMeta {
    pub id: String,
    pub title: String,
    pub file_path: String,
    #[serde(default)]
    pub order: usize,
    #[serde(default)]
    pub word_count: usize,
    #[serde(default)]
    pub anchor_count: usize,
    #[serde(default)]
    pub first_anchor: Option<String>,
    #[serde(default)]
    pub last_anchor: Option<String>,
    #[serde(default)]
    pub footnotes_count: usize,
    #[serde(default)]
    pub inspectional_sampling: Option<InspectionalSampling>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct BookMetadata {
    pub id: String,
    pub title: String,
    pub author: String,
    pub chapter_count: usize,
    pub total_words: usize,
    #[serde(default)]
    pub elementary_metrics: Option<ElementaryMetrics>,
    #[serde(default)]
    pub inspectional_blueprint: Option<InspectionalBlueprint>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookSummary {
    pub book_id: String,
    pub title: String,
    pub author: String,
    pub total_chapters: usize,
    pub total_words: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChapterNoteFile {
    pub file_name: String,
    pub chapter_file: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AggregatedNoteItem {
    pub id: String,
    pub item_type: String, // "highlight" | "note"
    pub chapter_file: String,
    pub chapter_title: String,
    pub chapter_order: usize,
    pub anchor: Option<String>,
    pub text: String,
    pub color: Option<String>,
    pub section_heading: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VocabularyEntry {
    pub word: String,
    pub definition: String,
    /// An entry saved without an anchor reads as empty, so the whole file still loads.
    #[serde(default)]
    pub anchor: String,
    /// An entry saved without a time reads as empty, so the whole file still loads.
    /// The alias reads a file that spells the key `saved_at`, so its time is not dropped.
    #[serde(default, alias = "saved_at")]
    pub saved_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AnchoredCitation {
    pub chapter_file: String,
    pub anchor: String,
    pub quote: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuthorTerm {
    pub id: String,
    pub term: String,
    pub author_definition: String,
    pub citation: AnchoredCitation,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ArgumentNode {
    pub id: String,
    pub title: String,
    pub conclusion: AnchoredCitation,
    #[serde(default)]
    pub premises: Vec<AnchoredCitation>,
    pub inference_type: String, // "deductive" | "inductive" | "analogical"
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CritiqueItem {
    pub id: String,
    #[serde(default)]
    pub target_argument_id: Option<String>,
    #[serde(default)]
    pub citation: Option<AnchoredCitation>,
    pub understanding_declared: bool,
    pub judgment: String, // "agree" | "disagree" | "suspend"
    #[serde(default)]
    pub defects: Vec<String>, // "uninformed" | "misinformed" | "illogical" | "incomplete"
    #[serde(default)]
    pub rationale: String,
    #[serde(default, alias = "created_at")]
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InquiryDomain {
    Theoretical,
    Practical,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InquiryPriority {
    Primary,
    Subordinate,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ResolutionStatus {
    Solved,
    UnsolvedAcknowledged,
    UnsolvedUnrecognized,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthorInquiry {
    pub id: String,
    pub question: String,
    pub domain: InquiryDomain,
    pub priority: InquiryPriority,
    #[serde(default)]
    pub citation: Option<AnchoredCitation>,
    pub resolution: ResolutionStatus,
    #[serde(default)]
    pub solution_notes: String,
    #[serde(default)]
    pub solution_argument_ids: Vec<String>,
    #[serde(default)]
    pub solution_citation: Option<AnchoredCitation>,
    #[serde(default, alias = "created_at")]
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticalStore {
    #[serde(default)]
    pub terms: Vec<AuthorTerm>,
    #[serde(default)]
    pub arguments: Vec<ArgumentNode>,
    #[serde(default)]
    pub critiques: Vec<CritiqueItem>,
    #[serde(default)]
    pub inquiries: Vec<AuthorInquiry>,
    #[serde(default)]
    pub overall_verdict: Option<String>,
}

