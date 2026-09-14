pub mod vault;
pub mod db;
pub mod commands;
pub mod fsrs;

use commands::{
    get_library_books, list_books, load_book_meta, get_inspectional_blueprint, save_inspectional_exit_assessment,
    load_chapter, load_notes, save_notes,
    index_vault, search_vault, sync_practice_deck, get_due_cards, submit_review, get_deck_stats,
    get_review_heatmap, get_retention_metrics, get_reading_velocity, record_reading_progress,
    get_all_book_notes, export_book_summary, get_study_analytics, get_vault_path,
    lookup_dictionary_term, save_book_vocabulary, get_analytical_data, save_analytical_data,
    get_syntopic_topics, get_syntopic_topic, save_syntopic_topic, export_syntopic_report,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            use tauri::Manager;

            // Explicitly ensure the main window is unminimized, visible, and focused on startup
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            // Ensure syntopicon directories exist on startup
            if let Err(e) = vault::ensure_syntopicon_dirs() {
                eprintln!("Warning: Failed to ensure syntopicon directories on startup: {}", e);
            }

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
            get_inspectional_blueprint,
            save_inspectional_exit_assessment,
            load_chapter,
            load_notes,
            save_notes,
            index_vault,
            search_vault,
            sync_practice_deck,
            get_due_cards,
            submit_review,
            get_deck_stats,
            get_review_heatmap,
            get_retention_metrics,
            get_reading_velocity,
            record_reading_progress,
            get_all_book_notes,
            export_book_summary,
            get_study_analytics,
            get_vault_path,
            lookup_dictionary_term,
            save_book_vocabulary,
            get_analytical_data,
            save_analytical_data,
            get_syntopic_topics,
            get_syntopic_topic,
            save_syntopic_topic,
            export_syntopic_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
