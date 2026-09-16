use rusqlite::{params, OptionalExtension, TransactionBehavior};
use anyhow::{Context, Result};
use super::models::DeckStats;
use super::schema::open_or_create_db;

/// Calculates deck statistics (due, new, learning, review counts).
pub fn get_deck_stats_blocking(book_id: Option<&str>) -> Result<DeckStats> {
    let conn = open_or_create_db()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let (where_clause, params_vec): (&str, Vec<rusqlite::types::Value>) = match book_id {
        Some(b) => ("WHERE book_id = ?", vec![b.to_string().into()]),
        None => ("", vec![]),
    };

    let total_cards: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM fsrs_cards {}", where_clause),
        rusqlite::params_from_iter(params_vec.iter().cloned()),
        |r| r.get(0),
    ).unwrap_or(0);

    let due_where = if where_clause.is_empty() {
        "WHERE (due <= ? OR reps = 0)"
    } else {
        "WHERE (due <= ? OR reps = 0) AND book_id = ?"
    };
    let mut due_params: Vec<rusqlite::types::Value> = vec![now.into()];
    if let Some(b) = book_id {
        due_params.push(b.to_string().into());
    }

    let due_count: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM fsrs_cards {}", due_where),
        rusqlite::params_from_iter(due_params),
        |r| r.get(0),
    ).unwrap_or(0);

    let new_count: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM fsrs_cards {} {}",
            if where_clause.is_empty() { "WHERE" } else { "WHERE book_id = ? AND" },
            "state = 0"),
        rusqlite::params_from_iter(params_vec.iter().cloned()),
        |r| r.get(0),
    ).unwrap_or(0);

    let learning_count: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM fsrs_cards {} {}",
            if where_clause.is_empty() { "WHERE" } else { "WHERE book_id = ? AND" },
            "(state = 1 OR state = 3)"),
        rusqlite::params_from_iter(params_vec.iter().cloned()),
        |r| r.get(0),
    ).unwrap_or(0);

    let review_count: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM fsrs_cards {} {}",
            if where_clause.is_empty() { "WHERE" } else { "WHERE book_id = ? AND" },
            "state = 2"),
        rusqlite::params_from_iter(params_vec),
        |r| r.get(0),
    ).unwrap_or(0);

    Ok(DeckStats {
        due_count,
        new_count,
        learning_count,
        review_count,
        total_cards,
    })
}

/// Applies an FSRS-5 rating (1=Again, 2=Hard, 3=Good, 4=Easy), updates SQLite, and returns new schedule.
/// The card update and its review log row are saved in one transaction: both are saved or neither is,
/// and every error is returned.
///
/// The review goes into the vault first (`vault/study_log.rs`), because the vault is the permanent record
/// and the database is only a cache (DS-01). A review the vault refuses is not saved at all. A review the
/// vault took but the database did not is put back at the next startup, so nothing is lost either way.
pub fn submit_card_review_blocking(card_id: &str, rating_val: u8) -> Result<crate::fsrs::CardSchedule> {
    let rating = crate::fsrs::Rating::try_from(rating_val)
        .map_err(|e| anyhow::anyhow!(e))?;
    let mut conn = open_or_create_db()?;

    // IMMEDIATE takes the write lock before the card is read. A second review of the same card
    // (a double click) waits for this one and then schedules from its saved result.
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

    let (book_id, state, stability, difficulty, reps, last_review): (Option<String>, i64, f64, f64, i64, i64) = tx
        .query_row(
            "SELECT book_id, state, stability, difficulty, reps, last_review FROM fsrs_cards WHERE card_id = ?",
            params![card_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        )
        .optional()?
        .with_context(|| format!("Card '{}' not found in fsrs_cards", card_id))?;
    // The review log row names the book of the card. There is no fallback book id.
    let book_id = book_id
        .filter(|id| !id.trim().is_empty())
        .with_context(|| format!("Card '{}' has no book id, so its review cannot be logged", card_id))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let schedule = crate::fsrs::schedule_card(
        card_id,
        crate::fsrs::CardState::from(state),
        stability,
        difficulty,
        reps,
        last_review,
        now,
        rating,
    );

    tx.execute(
        "UPDATE fsrs_cards SET
            state = ?,
            stability = ?,
            difficulty = ?,
            due = ?,
            last_review = ?,
            reps = ?
         WHERE card_id = ?",
        params![
            schedule.state,
            schedule.stability,
            schedule.difficulty,
            schedule.due,
            schedule.last_review,
            schedule.reps,
            card_id,
        ],
    )?;

    // Persist review record to review_logs table for analytics heatmap
    tx.execute(
        "INSERT INTO review_logs (card_id, book_id, rating, reviewed_at) VALUES (?, ?, ?, ?)",
        params![card_id, book_id, rating_val as i64, now],
    )
    .context("Failed to save the review log row")?;

    crate::vault::study_log::append_review(&crate::vault::study_log::ReviewLine {
        card_id: card_id.to_string(),
        book_id,
        rating: Some(rating_val),
        reviewed_at: now,
        schedule: Some(crate::vault::study_log::CardStanding {
            state: schedule.state,
            stability: schedule.stability,
            difficulty: schedule.difficulty,
            due: schedule.due,
            reps: schedule.reps,
        }),
    })
    .context("Failed to save the review in the vault, so it was not saved at all")?;

    tx.commit()?;
    Ok(schedule)
}
