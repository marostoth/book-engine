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
