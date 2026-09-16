use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub book_id: String,
    pub chapter_id: String,
    pub chapter_title: String,
    pub chapter_file: String,
    pub anchor: String,
    /// A piece of the paragraph as plain text, with `HIT_START` and `HIT_END` (`db/search_text.rs`) around each hit.
    /// It holds no HTML, and the window shows it as text (SEC-01).
    pub snippet: String,
    pub rank: f64,
}

/// What one run of the search index did (`index_vault`). Must match `IndexSummary` in src/lib/types.ts.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct IndexSummary {
    pub chapters_indexed: usize,
    pub paragraphs_indexed: usize,
    /// The files that the run could not read. Every other book and chapter was still indexed (SI-02).
    pub problems: Vec<IndexProblem>,
    /// The book folders that were renamed, so their notes and study progress do not show (LC-02).
    pub renamed_books: Vec<RenamedBook>,
    pub duration_ms: u128,
}

/// A book folder whose `_meta.json` names another book, whose notes are in the vault while no folder has its name.
/// The app knows a book by its folder name, so the notes and study progress under the old name do not show.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct RenamedBook {
    /// The name of the folder in `vault/books/` now.
    pub folder: String,
    /// The name in its `_meta.json`, which its notes folder in `vault/notes/` still has.
    pub old_name: String,
}

/// A file in the vault that the search index could not read.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct IndexProblem {
    /// The file, from the vault folder: `books/<book-id>/_meta.json` or `books/<book-id>/<chapter file>`.
    pub file: String,
    /// Why, in words that follow the file name, such as "is not UTF-8 text".
    pub reason: String,
}

/// Field names must match `ScenarioOption` in src/lib/practiceTypes.ts (see src/lib/practiceContract.json).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScenarioOption {
    pub key: String,
    pub text: String,
    /// index.db rows written by older builds store `isCorrect`; the alias keeps them readable.
    #[serde(alias = "isCorrect")]
    pub is_correct: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioPayload {
    pub scenario: String,
    pub options: Vec<ScenarioOption>,
    pub citation: crate::vault::AnchoredCitation,
    pub rationale: String,
}

fn default_card_type() -> String {
    "cloze".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PracticeCardItem {
    pub card_id: String,
    pub book_id: String,
    pub chapter_file: String,
    pub anchor: String,
    pub item_type: String, // "cloze" | "scramble" | "scenario"
    pub prompt: String,
    pub answer: String,
    pub state: u8,
    pub stability: f64,
    pub difficulty: f64,
    pub due: i64,
    pub last_review: i64,
    pub reps: i64,
    #[serde(default = "default_card_type", alias = "cardType")]
    pub card_type: String,
    #[serde(skip_serializing_if = "Option::is_none", alias = "scenarioPayload")]
    pub scenario_payload: Option<ScenarioPayload>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeckStats {
    pub due_count: usize,
    pub new_count: usize,
    pub learning_count: usize,
    pub review_count: usize,
    pub total_cards: usize,
}

/// The reviews made in one 15-minute block of time. The cache cannot know the time zone of the window, so the window
/// puts each block on a day of its own time zone (AN-02). Every time zone is a whole number of 15-minute blocks from
/// UTC, so a midnight never falls inside a block.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReviewBlock {
    /// When the block starts, in seconds since 1970 (UTC).
    pub started_at: i64,
    pub count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RetentionMetrics {
    pub due_today: usize,
    pub total_cards: usize,
    pub mastered_cards: usize,
    /// The average FSRS retrievability of the reviewed cards, in percent. `None` when no card was reviewed (AN-03).
    pub retention_rate: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChapterReadingStatItem {
    pub book_id: String,
    /// The title in the book's `_meta.json`. `None` when that file cannot be read (AN-03).
    pub book_title: Option<String>,
    pub chapter_file: String,
    /// The title in the spine of the book. `None` when the spine does not list the chapter file (AN-03).
    pub chapter_title: Option<String>,
    pub seconds_spent: u64,
    pub completed: bool,
    pub last_read_at: i64,
}

/// The reading time and the finished chapters. There is no word count and no reading speed: the app cannot see
/// how many words you read (AN-01).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReadingVelocityStats {
    pub total_seconds: u64,
    pub completed_chapters: usize,
    /// The chapters of the book, or of every book in the vault for "All Books". `None` when no `_meta.json` of them
    /// can be read (AN-03).
    pub total_chapters: Option<usize>,
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
    pub review_blocks: Vec<ReviewBlock>,
    pub state_counts: StateCounts,
    /// The share of the reviews not rated Again, in percent. With no review history, the average FSRS retrievability
    /// of the reviewed cards. `None` when no card was reviewed, so the window shows a dash (AN-03).
    pub retention_rate: Option<f64>,
    /// Reviewed cards whose due time has passed: the reviews practice gives first (`db/due_cards.rs`, AN-03).
    pub reviews_due: usize,
    /// Cards that were never reviewed. They are not due, so they count apart (AN-03).
    pub new_cards: usize,
    pub mastered_cards: usize,
    pub total_vault_words: usize,
    pub estimated_reading_time_mins: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryEntry {
    pub word: String,
    pub part_of_speech: Option<String>,
    pub pronunciation: Option<String>,
    pub definition: String,
    pub etymology: Option<String>,
}
