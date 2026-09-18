use std::collections::HashMap;

use super::models::{ChapterReadingStatItem, ReadingVelocityStats};
use super::schema::open_or_create_db;
use anyhow::{Context, Result};
use rusqlite::params;

/// Records reading time for a chapter, and whether the reader has finished it.
///
/// The time goes into the vault first (`vault/study_log.rs`), because the vault is the permanent record
/// and the database is only a cache (DS-01).
///
/// No word count is saved. The app sees how long a chapter is on screen and how far down it you scrolled,
/// but not how many words you read. It used to save the word count of the whole chapter with every piece
/// of reading time, so the analytics showed speeds like 21,357 words a minute (AN-01).
pub fn record_reading_session_blocking(
    book_id: &str,
    chapter_file: &str,
    seconds_spent: u64,
    completed: bool,
) -> Result<()> {
    let conn = open_or_create_db()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    crate::vault::study_log::append_reading(&crate::vault::study_log::ReadingLine {
        book_id: book_id.to_string(),
        chapter_file: chapter_file.to_string(),
        seconds_spent: seconds_spent as i64,
        completed,
        read_at: now,
    })
    .context("Failed to save your reading time in the vault, so it was not saved at all")?;

    conn.execute(
        "INSERT INTO reading_sessions (book_id, chapter_file, seconds_spent, completed, last_read_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(book_id, chapter_file) DO UPDATE SET
             seconds_spent = seconds_spent + ?3,
             completed = MAX(completed, ?4),
             last_read_at = ?5",
        params![
            book_id,
            chapter_file,
            seconds_spent as i64,
            if completed { 1 } else { 0 },
            now,
        ],
    )?;

    Ok(())
}

/// What a book's `_meta.json` says about it: its title, and the place and title of each chapter in its spine.
struct BookOutline {
    title: Option<String>,
    /// Chapter file -> (place in the spine, chapter title).
    chapters: HashMap<String, (usize, Option<String>)>,
    total_chapters: usize,
}

/// Reads the outline of a book. `None` when its `_meta.json` cannot be read.
fn book_outline(book_id: &str) -> Option<BookOutline> {
    let meta: serde_json::Value = serde_json::from_str(&crate::vault::read_book_meta_json(book_id).ok()?).ok()?;
    let text = |value: &serde_json::Value| value.as_str().filter(|text| !text.is_empty()).map(str::to_string);
    let spine = meta["spine"].as_array();
    let chapters = spine
        .into_iter()
        .flatten()
        .enumerate()
        .filter_map(|(place, chapter)| {
            Some((
                chapter["file_path"].as_str()?.to_string(),
                (place, text(&chapter["title"])),
            ))
        })
        .collect();
    let total_chapters = meta["total_chapters"]
        .as_u64()
        .map(|count| count as usize)
        .or_else(|| spine.map(Vec::len))
        .unwrap_or(0);
    Some(BookOutline {
        title: text(&meta["title"]),
        chapters,
        total_chapters,
    })
}

/// Adds up the reading time and the finished chapters. There is no word count and no reading speed (AN-01).
///
/// Each row names its book and its chapter with the titles in the book's `_meta.json`, in book order and then reading
/// order. A chapter file that the spine does not list keeps only its file name. `total_chapters` counts the chapters
/// of the book, or of every book in the vault for "All Books", not of the book that is open (AN-03).
pub fn get_reading_velocity_blocking(book_id: Option<&str>) -> Result<ReadingVelocityStats> {
    let conn = open_or_create_db()?;

    let (where_clause, params_vec): (&str, Vec<rusqlite::types::Value>) = match book_id {
        Some(b) => ("WHERE book_id = ?", vec![b.to_string().into()]),
        None => ("", vec![]),
    };

    let sql = format!(
        "SELECT book_id, chapter_file, seconds_spent, completed, last_read_at
         FROM reading_sessions
         {where_clause}"
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params_vec), |r| {
        let book_id: String = r.get(0)?;
        let chapter_file: String = r.get(1)?;
        let seconds_spent: i64 = r.get(2)?;
        let completed_int: i64 = r.get(3)?;
        let last_read_at: i64 = r.get(4)?;
        Ok((
            book_id,
            chapter_file,
            seconds_spent.max(0) as u64,
            completed_int == 1,
            last_read_at,
        ))
    })?;

    let mut outlines: HashMap<String, Option<BookOutline>> = HashMap::new();
    let mut placed_rows: Vec<(Option<usize>, ChapterReadingStatItem)> = Vec::new();
    for (book, chapter_file, seconds_spent, completed, last_read_at) in rows.filter_map(|r| r.ok()) {
        let outline = outlines
            .entry(book.clone())
            .or_insert_with(|| book_outline(&book))
            .as_ref();
        let chapter = outline.and_then(|outline| outline.chapters.get(&chapter_file));
        placed_rows.push((
            chapter.map(|(place, _)| *place),
            ChapterReadingStatItem {
                book_title: outline.and_then(|outline| outline.title.clone()),
                chapter_title: chapter.and_then(|(_, title)| title.clone()),
                book_id: book,
                chapter_file,
                seconds_spent,
                completed,
                last_read_at,
            },
        ));
    }
    // Book by book, as the library lists them, and each book in reading order. A chapter that the spine does not list
    // comes after the listed ones.
    let book_name = |row: &ChapterReadingStatItem| row.book_title.as_deref().unwrap_or(&row.book_id).to_lowercase();
    placed_rows.sort_by(|(a_place, a), (b_place, b)| {
        book_name(a)
            .cmp(&book_name(b))
            .then_with(|| a.book_id.cmp(&b.book_id))
            .then_with(|| a_place.unwrap_or(usize::MAX).cmp(&b_place.unwrap_or(usize::MAX)))
            .then_with(|| a.chapter_file.cmp(&b.chapter_file))
    });
    let chapter_stats: Vec<ChapterReadingStatItem> = placed_rows.into_iter().map(|(_, row)| row).collect();

    let total_chapters = match book_id {
        Some(book) => book_outline(book).map(|outline| outline.total_chapters),
        None => crate::vault::scan_available_books().ok().map(|books| {
            books
                .iter()
                .filter_map(|book| book_outline(&book.book_id))
                .map(|outline| outline.total_chapters)
                .sum()
        }),
    };

    let mut total_seconds = 0u64;
    let mut completed_chapters = 0usize;

    for item in &chapter_stats {
        total_seconds += item.seconds_spent;
        if item.completed {
            completed_chapters += 1;
        }
    }

    Ok(ReadingVelocityStats {
        total_seconds,
        completed_chapters,
        total_chapters,
        chapter_stats,
    })
}
