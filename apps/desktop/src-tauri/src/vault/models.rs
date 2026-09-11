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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookMetadata {
    pub id: String,
    pub title: String,
    pub author: String,
    pub chapter_count: usize,
    pub total_words: usize,
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
