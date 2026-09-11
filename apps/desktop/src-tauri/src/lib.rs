pub mod vault;
pub mod db;
pub mod commands;
pub mod fsrs;

use commands::{
    get_library_books, list_books, load_book_meta, load_chapter, load_notes, save_notes,
    index_vault, search_vault, sync_practice_deck, get_due_cards, submit_review, get_deck_stats,
    load_all_book_notes, export_summary, get_review_heatmap, get_retention_metrics,
    get_reading_velocity, record_reading_progress,
    get_all_book_notes, export_book_summary, get_study_analytics,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            // Asynchronously build / update FTS5 search index on startup without blocking UI
            std::thread::spawn(|| {
                if let Err(e) = db::index_vault_blocking() {
                    eprintln!("Warning: Initial background indexing encountered error: {}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_library_books,
            list_books,
            load_book_meta,
            load_chapter,
            load_notes,
            save_notes,
            index_vault,
            search_vault,
            sync_practice_deck,
            get_due_cards,
            submit_review,
            get_deck_stats,
            load_all_book_notes,
            export_summary,
            get_review_heatmap,
            get_retention_metrics,
            get_reading_velocity,
            record_reading_progress,
            get_all_book_notes,
            export_book_summary,
            get_study_analytics
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
