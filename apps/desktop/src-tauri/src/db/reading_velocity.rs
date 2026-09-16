use rusqlite::params;
use anyhow::{Context, Result};
use super::models::{ChapterReadingStatItem, ReadingVelocityStats};
use super::schema::open_or_create_db;

/// Records reading time and completion progress for a chapter.
///
/// The time goes into the vault first (`vault/study_log.rs`), because the vault is the permanent record
/// and the database is only a cache (DS-01).
pub fn record_reading_session_blocking(
    book_id: &str,
    chapter_file: &str,
    seconds_spent: u64,
    words_read: usize,
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
        words_read: words_read as i64,
        completed,
        read_at: now,
    })
    .context("Failed to save your reading time in the vault, so it was not saved at all")?;

    conn.execute(
        "INSERT INTO reading_sessions (book_id, chapter_file, seconds_spent, words_read, completed, last_read_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(book_id, chapter_file) DO UPDATE SET
             seconds_spent = seconds_spent + ?3,
             words_read = MAX(words_read, ?4),
             completed = MAX(completed, ?5),
             last_read_at = ?6",
        params![
            book_id,
            chapter_file,
            seconds_spent as i64,
            words_read as i64,
            if completed { 1 } else { 0 },
            now,
        ],
    )?;

    Ok(())
}

/// Calculates reading velocity and time across chapters.
pub fn get_reading_velocity_blocking(book_id: Option<&str>) -> Result<ReadingVelocityStats> {
    let conn = open_or_create_db()?;

    let (where_clause, params_vec): (&str, Vec<rusqlite::types::Value>) = match book_id {
        Some(b) => ("WHERE book_id = ?", vec![b.to_string().into()]),
        None => ("", vec![]),
    };

    let sql = format!(
        "SELECT chapter_file, seconds_spent, words_read, completed, last_read_at
         FROM reading_sessions
         {}
         ORDER BY chapter_file ASC",
        where_clause
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(params_vec),
        |r| {
            let chapter_file: String = r.get(0)?;
            let seconds_spent: i64 = r.get(1)?;
            let words_read: i64 = r.get(2)?;
            let completed_int: i64 = r.get(3)?;
            let last_read_at: i64 = r.get(4)?;

            let secs = seconds_spent.max(0) as u64;
            let words = words_read.max(0) as usize;
            let wpm = if secs > 0 {
                ((words as f64) / (secs as f64 / 60.0)).round()
            } else {
                0.0
            };

            Ok(ChapterReadingStatItem {
                chapter_file,
                seconds_spent: secs,
                words_read: words,
                completed: completed_int == 1,
                wpm,
                last_read_at,
            })
        }
    )?;

    let chapter_stats: Vec<ChapterReadingStatItem> = rows.filter_map(|r| r.ok()).collect();

    let mut total_seconds = 0u64;
    let mut total_words_read = 0usize;
    let mut completed_chapters = 0usize;

    for item in &chapter_stats {
        total_seconds += item.seconds_spent;
        total_words_read += item.words_read;
        if item.completed {
            completed_chapters += 1;
        }
    }

    let average_wpm = if total_seconds > 0 {
        ((total_words_read as f64) / (total_seconds as f64 / 60.0)).round()
    } else {
        0.0
    };

    Ok(ReadingVelocityStats {
        total_seconds,
        completed_chapters,
        total_words_read,
        average_wpm,
        chapter_stats,
    })
}
