//! Text files of the vault with one line ending, `\n` (IN-06).
//!
//! On Windows the importer wrote every file of a book with Windows line endings, `\r\n`, and a text editor can do the
//! same. The app finds paragraphs and footnotes at `\n`: a blank line ends a paragraph, and a footnote is one line. So
//! the card check of a quiz card took a whole chapter as the paragraph of its anchor, the reader lost footnotes, and
//! the notes preview showed the notes as one heading. Now the app reads chapters and notes with `\n` line endings
//! only: `\r\n` and a lone `\r` become `\n`, as the importer reads the text of a book
//! (`packages/ingestion/ingest/line_endings.py`).

use std::io;
use std::path::Path;

/// Reads a text file with `\n` line endings only: `\r\n` and a lone `\r` become `\n`.
pub fn read_text_file(path: &Path) -> io::Result<String> {
    let text = std::fs::read_to_string(path)?;
    if !text.contains('\r') {
        return Ok(text);
    }
    Ok(text.replace("\r\n", "\n").replace('\r', "\n"))
}
