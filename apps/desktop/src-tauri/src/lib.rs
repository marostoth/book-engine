pub mod vault;
pub mod db;
pub mod commands;

use commands::{list_books, load_book_meta, load_chapter, load_notes, save_notes, index_vault, search_vault};

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
            list_books,
            load_book_meta,
            load_chapter,
            load_notes,
            save_notes,
            index_vault,
            search_vault
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
