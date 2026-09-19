pub mod commands;
pub mod db;
pub mod fsrs;
#[cfg(test)]
mod security_config_tests;
#[cfg(test)]
mod test_support;
pub mod vault;

use commands::{
    choose_vault_folder, create_syntopic_topic, export_book_summary, export_syntopic_report, get_all_book_notes,
    get_analytical_data, get_book_vocabulary, get_bookmark, get_chapter_due_cards, get_chapter_highlights,
    get_due_cards, get_inspectional_blueprint, get_inspectional_exit_assessment, get_last_bookmark, get_library_books,
    get_preferences, get_reading_velocity, get_study_analytics, get_syntopic_topic, get_syntopic_topics,
    get_vault_path, get_vault_status, index_vault, load_book_meta, load_chapter, load_notes, lookup_dictionary_term,
    record_reading_progress, save_analytical_data, save_book_vocabulary, save_bookmark, save_chapter_highlights,
    save_inspectional_exit_assessment, save_notes, save_preferences, save_syntopic_topic, search_vault, submit_review,
    sync_practice_deck,
};
use tauri::{AppHandle, Manager, Runtime};

/// Only one copy of the app runs, so two copies never save over each other's work (DS-13).
///
/// A second start tells the open copy, which brings its window to the front, and then ends. It ends while the plugins
/// start: before it opens a window, and before the setup in `run` reads or writes the vault or the cache. So register
/// it before every other plugin.
#[cfg(desktop)]
fn one_copy_only<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_single_instance::init(|app, _args, _cwd| show_main_window(app))
}

/// Brings the main window to the front, also when it is minimized or hidden.
fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // First, so that a second copy ends before anything else starts (DS-13).
    #[cfg(desktop)]
    let builder = builder.plugin(one_copy_only());
    builder
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Explicitly ensure the main window is unminimized, visible, and focused on startup
            show_main_window(app.handle());

            // Ensure syntopicon directories exist on startup
            if let Err(e) = vault::ensure_syntopicon_dirs() {
                eprintln!("Warning: Failed to ensure syntopicon directories on startup: {e}");
            }

            // Copy a cache that was filled before the vault kept the record. It writes only what the
            // vault does not have, so it costs nothing after the first startup (DS-01).
            match db::backfill_vault_blocking() {
                Err(e) => eprintln!("Warning: Could not copy your study progress into the vault: {e:#}"),
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
                Err(e) => eprintln!("Warning: Could not put your study progress back from the vault: {e:#}"),
                Ok(report) => {
                    if !report.changed_nothing() {
                        eprintln!(
                            "Put back from the vault: {} reviews, {} cards rescheduled, {} chapters of reading time.",
                            report.reviews_added, report.cards_rescheduled, report.chapters_restored
                        );
                    }
                    for line in &report.damaged_lines {
                        eprintln!("Warning: a line of your study log could not be read: {line}");
                    }
                }
            }

            // Search is brought up to date by the window when it opens (`updateSearch` in src/lib/searchIndex.ts), so
            // a file it cannot read shows in the error bar, and a vault picked after the start is indexed too (SI-02).
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_library_books,
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
            get_book_vocabulary,
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
            create_syntopic_topic,
            save_syntopic_topic,
            export_syntopic_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
