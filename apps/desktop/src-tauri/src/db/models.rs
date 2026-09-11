use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub book_id: String,
    pub chapter_id: String,
    pub chapter_title: String,
    pub chapter_file: String,
    pub anchor: String,
    pub snippet: String,
    pub rank: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexSummary {
    pub chapters_indexed: usize,
    pub paragraphs_indexed: usize,
    pub duration_ms: u128,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PracticeCardItem {
    pub card_id: String,
    pub book_id: String,
    pub chapter_file: String,
    pub anchor: String,
    pub item_type: String, // "cloze" | "scramble"
    pub prompt: String,
    pub answer: String,
    pub state: u8,
    pub stability: f64,
    pub difficulty: f64,
    pub due: i64,
    pub last_review: i64,
    pub reps: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeckStats {
    pub due_count: usize,
    pub new_count: usize,
    pub learning_count: usize,
    pub review_count: usize,
    pub total_cards: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DayReviewActivity {
    pub date: String,
    pub count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RetentionMetrics {
    pub due_today: usize,
    pub total_cards: usize,
    pub mastered_cards: usize,
    pub retention_rate: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChapterReadingStatItem {
    pub chapter_file: String,
    pub seconds_spent: u64,
    pub words_read: usize,
    pub completed: bool,
    pub wpm: f64,
    pub last_read_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReadingVelocityStats {
    pub total_seconds: u64,
    pub completed_chapters: usize,
    pub total_words_read: usize,
    pub average_wpm: f64,
    pub chapter_stats: Vec<ChapterReadingStatItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StateCounts {
    pub new_count: usize,
    pub learning_count: usize,
    pub review_count: usize,
    pub relearning_count: usize,
    pub total_cards: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StudyAnalytics {
    pub daily_reviews: Vec<DayReviewActivity>,
    pub state_counts: StateCounts,
    pub retention_rate: f64,
    pub cards_due_today: usize,
    pub mastered_cards: usize,
    pub total_vault_words: usize,
    pub estimated_reading_time_mins: usize,
}
