pub mod vault;
pub mod commands;

use commands::{list_books, load_book_meta, load_chapter, load_notes, save_notes};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            list_books,
            load_book_meta,
            load_chapter,
            load_notes,
            save_notes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
