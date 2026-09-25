#[cfg(test)]
mod closing_window_tests;
pub mod commands;
pub mod db;
pub mod fsrs;
#[cfg(test)]
mod seam_contract_tests;
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
    get_vault_path, get_vault_status, index_vault, let_the_window_close, load_book_meta, load_chapter, load_notes,
    lookup_dictionary_term, record_reading_progress, save_analytical_data, save_book_vocabulary, save_bookmark,
    save_chapter_highlights, save_inspectional_exit_assessment, save_notes, save_preferences, save_syntopic_topic,
    search_vault, submit_review, sync_practice_deck,
};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// The event that asks the page to save what the reader typed, before the window closes.
///
/// `src/lib/api/windowApi.ts` listens for this exact word, and `src/lib/savingBeforeClose.test.tsx` reads this
/// file to check that the two are still the same one (DS-17).
const SAVE_BEFORE_CLOSE_EVENT: &str = "save-before-close";

/// The longest the window waits for the page to save what is waiting.
///
/// Measured, not picked: one save is one `save_notes`, `save_preferences`, `save_bookmark` or
/// `record_reading_progress`, and each writes one small file. Five of them run at once at the most. A window that
/// will not close is worse than a lost sentence, so the wait ends whatever the page does.
const LONGEST_WAIT_FOR_THE_PAGE_MS: u64 = 5_000;

/// Whether the window has already asked the page to save what is waiting.
///
/// The first close is held back. Every close after that goes through, so a page that never answers and a reader
/// who presses the X again can both still close the window.
#[derive(Default)]
pub struct ClosingGuard {
    asked: AtomicBool,
}

impl ClosingGuard {
    /// True for the first close of this window only, and false for every one after it.
    pub fn should_ask_the_page(&self) -> bool {
        !self.asked.swap(true, Ordering::SeqCst)
    }
}

/// Holds one close back, asks the page to save, and closes when the page answers or the wait runs out.
///
/// Every saver in the app waits for a pause in the typing. Each of them saved what was waiting in a React unmount
/// clean-up, and closing the window destroys the webview instead of unmounting it, so none of those clean-ups ran
/// and the reader's last sentence was lost (DS-17).
fn ask_the_page_to_save<R: Runtime>(window: &tauri::Window<R>, api: &tauri::CloseRequestApi) {
    if !window.state::<ClosingGuard>().should_ask_the_page() {
        return;
    }
    api.prevent_close();
    if window.emit(SAVE_BEFORE_CLOSE_EVENT, ()).is_err() {
        // No page to ask, so there is nothing to wait for.
        let _ = window.destroy();
        return;
    }
    let waiting = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(LONGEST_WAIT_FOR_THE_PAGE_MS));
        // The window is usually gone by now, and `destroy` on a window that has gone does nothing.
        let _ = waiting.destroy();
    });
}

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
        .manage(ClosingGuard::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                ask_the_page_to_save(window, api);
            }
        })
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
                    if report.cards_waiting_for_deck > 0 {
                        // Saying "0 cards rescheduled" and nothing else read as a loss (DS-15).
                        eprintln!(
                            "{} card schedule(s) are saved and come back when their practice deck loads.",
                            report.cards_waiting_for_deck
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
            export_syntopic_report,
            let_the_window_close
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
