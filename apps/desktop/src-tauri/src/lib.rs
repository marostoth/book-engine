pub mod vault;
pub mod db;
pub mod commands;
pub mod fsrs;
#[cfg(test)]
mod test_support;

use commands::{
    get_library_books, list_books, load_book_meta, get_inspectional_blueprint,
    get_inspectional_exit_assessment, save_inspectional_exit_assessment,
    load_chapter, load_notes, save_notes,
    index_vault, search_vault, sync_practice_deck, get_due_cards, get_chapter_due_cards, submit_review, get_deck_stats,
    get_review_heatmap, get_retention_metrics, get_reading_velocity, record_reading_progress,
    get_all_book_notes, export_book_summary, get_study_analytics, get_vault_path,
    get_vault_status, choose_vault_folder,
    lookup_dictionary_term, save_book_vocabulary, get_analytical_data, save_analytical_data,
    get_chapter_highlights, save_chapter_highlights,
    get_bookmark, save_bookmark, get_last_bookmark, get_preferences, save_preferences,
    get_syntopic_topics, get_syntopic_topic, save_syntopic_topic, export_syntopic_report,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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

            // Copy a cache that was filled before the vault kept the record. It writes only what the
            // vault does not have, so it costs nothing after the first startup (DS-01).
            match db::backfill_vault_blocking() {
                Err(e) => eprintln!("Warning: Could not copy your study progress into the vault: {:#}", e),
                Ok(report) => {
                    if !report.changed_nothing() {
                        eprintln!(
                            "Copied into the vault: {} reviews, {} cards, {} chapters of reading time.",
                            report.reviews_written, report.cards_written, report.chapters_written
                        );
                    }
                }
            }

            // Put back whatever the cache is missing, from the permanent record in the vault. A cache
            // that was deleted, damaged or copied from another PC fills itself again (DS-01).
            match db::restore_progress_blocking() {
                Err(e) => eprintln!("Warning: Could not put your study progress back from the vault: {:#}", e),
                Ok(report) => {
                    if !report.changed_nothing() {
                        eprintln!(
                            "Put back from the vault: {} reviews, {} cards rescheduled, {} chapters of reading time.",
                            report.reviews_added, report.cards_rescheduled, report.chapters_restored
                        );
                    }
                    for line in &report.damaged_lines {
                        eprintln!("Warning: a line of your study log could not be read: {}", line);
                    }
                }
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
            get_inspectional_exit_assessment,
            save_inspectional_exit_assessment,
            load_chapter,
            load_notes,
            save_notes,
            index_vault,
            search_vault,
            sync_practice_deck,
            get_due_cards,
            get_chapter_due_cards,
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
            get_vault_status,
            choose_vault_folder,
            lookup_dictionary_term,
            save_book_vocabulary,
            get_chapter_highlights,
            save_chapter_highlights,
            get_bookmark,
            save_bookmark,
            get_last_bookmark,
            get_preferences,
            save_preferences,
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
