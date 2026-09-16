use tauri::command;
use crate::vault::{
    scan_library_books, scan_available_books, read_book_meta_json, read_chapter_file,
    read_notes_file, write_notes_file, BookMetadata, BookSummary, AppError
};

#[command]
pub async fn get_library_books() -> Result<Vec<BookMetadata>, AppError> {
    tokio::task::spawn_blocking(scan_library_books)
        .await
        .map_err(|e| AppError::Internal(format!("Task join error: {}", e)))?
}

#[command]
pub async fn list_books() -> Result<Vec<BookSummary>, String> {
    tokio::task::spawn_blocking(scan_available_books)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to list books: {}", e))
}

#[command]
pub async fn load_book_meta(book_id: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || read_book_meta_json(&book_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to load book meta: {}", e))
}

#[command]
pub async fn get_inspectional_blueprint(book_id: String) -> Result<crate::vault::InspectionalBlueprint, String> {
    tokio::task::spawn_blocking(move || crate::vault::get_inspectional_blueprint(&book_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to get inspectional blueprint: {}", e))
}

/// The reader's exit assessment of a book, from `vault/notes/<book_id>/inspectional.json`, or `None` (DS-09).
#[command]
pub async fn get_inspectional_exit_assessment(
    book_id: String,
) -> Result<Option<crate::vault::ExitAssessmentPayload>, String> {
    tokio::task::spawn_blocking(move || crate::vault::inspectional::load_exit_assessment(&book_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("{:#}", e))
}

/// Saves the reader's exit assessment next to the book's notes, never into `_meta.json` (DS-09).
#[command]
pub async fn save_inspectional_exit_assessment(
    book_id: String,
    assessment: crate::vault::ExitAssessmentPayload,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || crate::vault::inspectional::save_exit_assessment(&book_id, assessment))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("{:#}", e))
}

#[command]
pub async fn load_chapter(book_id: String, chapter_file: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || read_chapter_file(&book_id, &chapter_file))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to load chapter: {}", e))
}

#[command]
pub async fn load_notes(book_id: String, notes_file: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || read_notes_file(&book_id, &notes_file))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to load notes: {}", e))
}

#[command]
pub async fn save_notes(book_id: String, notes_file: String, content: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || write_notes_file(&book_id, &notes_file, &content))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to save notes: {}", e))
}

#[command]
pub async fn index_vault() -> Result<crate::db::IndexSummary, String> {
    tokio::task::spawn_blocking(crate::db::index_vault_blocking)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to index vault: {}", e))
}

#[command]
pub async fn search_vault(query: String) -> Result<Vec<crate::db::SearchResult>, String> {
    tokio::task::spawn_blocking(move || crate::db::search_vault_blocking(&query))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to search vault: {}", e))
}

#[command]
pub async fn sync_practice_deck(book_id: String) -> Result<usize, String> {
    tokio::task::spawn_blocking(move || crate::db::sync_practice_deck_blocking(&book_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to sync practice deck: {}", e))
}

#[command]
pub async fn get_due_cards(
    book_id: Option<String>,
    card_type: Option<String>,
    limit: Option<usize>,
    hybrid_ratio: Option<f32>,
) -> Result<Vec<crate::db::PracticeCardItem>, String> {
    tokio::task::spawn_blocking(move || {
        crate::db::get_due_cards_blocking(
            book_id.as_deref(),
            card_type.as_deref(),
            limit,
            hybrid_ratio,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to get due cards: {}", e))
}

#[command]
pub async fn get_chapter_due_cards(
    book_id: String,
    chapter_file: String,
    card_type: Option<String>,
    limit: Option<usize>,
    hybrid_ratio: Option<f32>,
) -> Result<Vec<crate::db::PracticeCardItem>, String> {
    tokio::task::spawn_blocking(move || {
        crate::db::get_chapter_due_cards_blocking(&book_id, &chapter_file, card_type.as_deref(), limit, hybrid_ratio)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to get chapter due cards: {}", e))
}

#[command]
pub async fn submit_review(card_id: String, rating: u8) -> Result<crate::fsrs::CardSchedule, String> {
    tokio::task::spawn_blocking(move || crate::db::submit_card_review_blocking(&card_id, rating))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to submit review: {}", e))
}

#[command]
pub async fn get_deck_stats(book_id: Option<String>) -> Result<crate::db::DeckStats, String> {
    tokio::task::spawn_blocking(move || crate::db::get_deck_stats_blocking(book_id.as_deref()))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to get deck stats: {}", e))
}

#[command]
pub async fn load_all_book_notes(book_id: String) -> Result<Vec<crate::vault::ChapterNoteFile>, String> {
    tokio::task::spawn_blocking(move || crate::vault::scan_all_notes(&book_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to load book notes: {}", e))
}

#[command]
pub async fn export_summary(book_id: String, content: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || crate::vault::export_summary_file(&book_id, &content))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to export summary: {}", e))
}

#[command]
pub async fn get_review_heatmap(book_id: Option<String>) -> Result<Vec<crate::db::DayReviewActivity>, String> {
    tokio::task::spawn_blocking(move || crate::db::get_review_heatmap_blocking(book_id.as_deref()))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to get review heatmap: {}", e))
}

#[command]
pub async fn get_retention_metrics(book_id: Option<String>) -> Result<crate::db::RetentionMetrics, String> {
    tokio::task::spawn_blocking(move || crate::db::get_retention_metrics_blocking(book_id.as_deref()))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to get retention metrics: {}", e))
}

#[command]
pub async fn get_reading_velocity(book_id: Option<String>) -> Result<crate::db::ReadingVelocityStats, String> {
    tokio::task::spawn_blocking(move || crate::db::get_reading_velocity_blocking(book_id.as_deref()))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to get reading velocity: {}", e))
}

#[command]
pub async fn record_reading_progress(
    book_id: String,
    chapter_file: String,
    seconds_spent: u64,
    words_read: usize,
    completed: bool,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        crate::db::record_reading_session_blocking(&book_id, &chapter_file, seconds_spent, words_read, completed)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to record reading progress: {}", e))
}

#[command]
pub async fn get_all_book_notes(book_id: String) -> Result<Vec<crate::vault::AggregatedNoteItem>, String> {
    tokio::task::spawn_blocking(move || crate::vault::parse_all_book_notes(&book_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to parse all book notes: {}", e))
}

#[command]
pub async fn export_book_summary(book_id: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || crate::vault::compile_and_export_book_summary(&book_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to export book summary: {}", e))
}

#[command]
pub async fn get_study_analytics(book_id: Option<String>) -> Result<crate::db::StudyAnalytics, String> {
    tokio::task::spawn_blocking(move || crate::db::get_study_analytics_blocking(book_id.as_deref()))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to get study analytics: {}", e))
}

#[command]
pub async fn get_vault_path() -> Result<String, String> {
    tokio::task::spawn_blocking(|| {
        let p = crate::vault::find_vault_root().map_err(|e| e.to_string())?;
        Ok(p.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Where the vault is, or why it was not found. The app asks this before it shows the library (LC-01).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    /// The vault folder, or an empty string when there is none.
    pub path: String,
    /// How it was found: "saved", "variable", "nextToTheProgram", "nearTheWorkingFolder", or "" for none.
    pub found_by: String,
    /// What to tell the reader when there is no vault.
    pub message: String,
}

fn status_of(found: Option<(std::path::PathBuf, crate::vault::locate::FoundBy)>) -> VaultStatus {
    use crate::vault::locate::FoundBy;
    match found {
        None => VaultStatus {
            path: String::new(),
            found_by: String::new(),
            message: crate::vault::locate::not_found_message(),
        },
        Some((folder, how)) => VaultStatus {
            path: folder.to_string_lossy().to_string(),
            found_by: match how {
                FoundBy::Saved => "saved",
                FoundBy::Variable => "variable",
                FoundBy::NextToTheProgram => "nextToTheProgram",
                FoundBy::NearTheWorkingFolder => "nearTheWorkingFolder",
            }
            .to_string(),
            message: String::new(),
        },
    }
}

#[command]
pub async fn get_vault_status() -> Result<VaultStatus, String> {
    tokio::task::spawn_blocking(|| status_of(crate::vault::locate::locate_vault()))
        .await
        .map_err(|e| format!("Task join error: {}", e))
}

/// Opens a folder picker and remembers what the reader chose. A folder that is not a vault is refused
/// with a message that says what a vault looks like, so the app never quietly points somewhere empty.
/// Returns the new status, or `None` when the reader closed the picker without choosing.
#[command]
pub async fn choose_vault_folder(app: tauri::AppHandle) -> Result<Option<VaultStatus>, String> {
    use tauri_plugin_dialog::DialogExt;

    let picked = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Choose your vault folder (the folder that holds \"books\")")
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    let Some(picked) = picked else {
        return Ok(None);
    };
    let folder = picked
        .into_path()
        .map_err(|e| format!("That folder could not be read: {e}"))?;

    tokio::task::spawn_blocking(move || {
        crate::vault::locate::remember_vault(&folder).map_err(|e| format!("{:#}", e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    tokio::task::spawn_blocking(|| Some(status_of(crate::vault::locate::locate_vault())))
        .await
        .map_err(|e| format!("Task join error: {}", e))
}

#[command]
pub async fn lookup_dictionary_term(word: String) -> Result<Option<crate::db::DictionaryEntry>, String> {
    tokio::task::spawn_blocking(move || crate::db::lookup_dictionary_blocking(&word))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to lookup dictionary term: {}", e))
}

#[command]
pub async fn save_book_vocabulary(book_id: String, entry: crate::vault::VocabularyEntry) -> Result<(), String> {
    tokio::task::spawn_blocking(move || crate::vault::save_vocabulary_term(&book_id, entry))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to save vocabulary term: {}", e))
}

#[command]
pub async fn get_chapter_highlights(book_id: String, chapter_file: String) -> Result<Vec<crate::vault::HighlightItem>, String> {
    tokio::task::spawn_blocking(move || crate::vault::load_chapter_highlights(&book_id, &chapter_file))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("{:#}", e))
}

#[command]
pub async fn save_chapter_highlights(
    book_id: String,
    chapter_file: String,
    highlights: Vec<crate::vault::HighlightItem>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        crate::vault::save_chapter_highlights(&book_id, &chapter_file, highlights)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("{:#}", e))
}

/// Where the reader stopped in a book, or `None` when they have not read it yet (DS-11).
#[command]
pub async fn get_bookmark(book_id: String) -> Result<Option<crate::vault::bookmark::Bookmark>, String> {
    tokio::task::spawn_blocking(move || crate::vault::bookmark::load_bookmark(&book_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("{:#}", e))
}

/// Saves where the reader is in a book: the chapter, and the paragraph in the middle of the screen.
#[command]
pub async fn save_bookmark(book_id: String, chapter_file: String, anchor: Option<String>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        crate::vault::bookmark::save_bookmark(&book_id, &chapter_file, anchor.as_deref()).map(|_| ())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("{:#}", e))
}

/// The newest bookmark of all books, which names the book the app opens with.
#[command]
pub async fn get_last_bookmark() -> Result<Option<crate::vault::bookmark::BookBookmark>, String> {
    tokio::task::spawn_blocking(crate::vault::bookmark::last_bookmark)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("{:#}", e))
}

/// The reader settings saved in `vault/preferences.json`, or `None` when none are saved yet (DS-11).
#[command]
pub async fn get_preferences() -> Result<Option<crate::vault::preferences::Preferences>, String> {
    tokio::task::spawn_blocking(crate::vault::preferences::load_preferences)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("{:#}", e))
}

/// Saves the reader settings to `vault/preferences.json`. A damaged settings file stops the save.
#[command]
pub async fn save_preferences(preferences: crate::vault::preferences::Preferences) -> Result<(), String> {
    tokio::task::spawn_blocking(move || crate::vault::preferences::save_preferences(&preferences))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("{:#}", e))
}

#[command]
pub async fn get_analytical_data(book_id: String) -> Result<crate::vault::AnalyticalStore, String> {
    tokio::task::spawn_blocking(move || crate::vault::load_analytical_store(&book_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to get analytical data: {}", e))
}

#[command]
pub async fn save_analytical_data(book_id: String, data: crate::vault::AnalyticalStore) -> Result<(), String> {
    tokio::task::spawn_blocking(move || crate::vault::save_analytical_store(&book_id, data))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to save analytical data: {}", e))
}

#[command]
pub async fn get_syntopic_topics() -> Result<Vec<crate::vault::SyntopicTopicSummary>, String> {
    tokio::task::spawn_blocking(crate::vault::list_syntopic_topics)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to get syntopic topics: {}", e))
}

#[command]
pub async fn get_syntopic_topic(topic_id: String) -> Result<crate::vault::SyntopicTopic, String> {
    tokio::task::spawn_blocking(move || crate::vault::load_syntopic_topic(&topic_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to get syntopic topic: {}", e))
}

/// Creates an empty topic named after `title`. A title whose file a topic already uses is refused (DS-12).
#[command]
pub async fn create_syntopic_topic(title: String, description: String) -> Result<crate::vault::SyntopicTopic, String> {
    tokio::task::spawn_blocking(move || crate::vault::create_syntopic_topic(&title, &description))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("{:#}", e))
}

#[command]
pub async fn save_syntopic_topic(topic: crate::vault::SyntopicTopic) -> Result<(), String> {
    tokio::task::spawn_blocking(move || crate::vault::save_syntopic_topic(topic))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to save syntopic topic: {}", e))
}

#[command]
pub async fn export_syntopic_report(topic_id: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || crate::vault::export_syntopic_report(&topic_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to export syntopic report: {}", e))
}
