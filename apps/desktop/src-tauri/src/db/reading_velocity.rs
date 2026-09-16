use rusqlite::params;
use anyhow::{Context, Result};
use super::models::{ChapterReadingStatItem, ReadingVelocityStats};
use super::schema::open_or_create_db;

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

/// Adds up the reading time and the finished chapters. There is no word count and no reading speed (AN-01).
pub fn get_reading_velocity_blocking(book_id: Option<&str>) -> Result<ReadingVelocityStats> {
    let conn = open_or_create_db()?;

    let (where_clause, params_vec): (&str, Vec<rusqlite::types::Value>) = match book_id {
        Some(b) => ("WHERE book_id = ?", vec![b.to_string().into()]),
        None => ("", vec![]),
    };

    let sql = format!(
        "SELECT chapter_file, seconds_spent, completed, last_read_at
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
            let completed_int: i64 = r.get(2)?;
            let last_read_at: i64 = r.get(3)?;

            Ok(ChapterReadingStatItem {
                chapter_file,
                seconds_spent: seconds_spent.max(0) as u64,
                completed: completed_int == 1,
                last_read_at,
            })
        }
    )?;

    let chapter_stats: Vec<ChapterReadingStatItem> = rows.filter_map(|r| r.ok()).collect();

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
        chapter_stats,
    })
}
