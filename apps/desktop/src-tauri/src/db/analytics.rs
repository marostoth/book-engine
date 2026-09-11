use anyhow::Result;
use crate::vault::find_vault_root;
use super::models::{
    DayReviewActivity, RetentionMetrics, StateCounts, StudyAnalytics,
};
use super::schema::open_or_create_db;

/// Queries review activity per day for FSRS GitHub-style heatmap.
pub fn get_review_heatmap_blocking(book_id: Option<&str>) -> Result<Vec<DayReviewActivity>> {
    let conn = open_or_create_db()?;

    let (where_clause, params_vec): (&str, Vec<rusqlite::types::Value>) = match book_id {
        Some(b) => ("WHERE book_id = ?", vec![b.to_string().into()]),
        None => ("", vec![]),
    };

    let sql = format!(
        "SELECT strftime('%Y-%m-%d', reviewed_at, 'unixepoch') as day, COUNT(*) as cnt
         FROM review_logs
         {}
         GROUP BY day
         ORDER BY day ASC",
        where_clause
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(params_vec.iter().cloned()),
        |r| Ok(DayReviewActivity {
            date: r.get(0)?,
            count: r.get(1)?,
        })
    )?;

    let mut activities: Vec<DayReviewActivity> = rows.filter_map(|r| r.ok()).collect();

    // Fallback: If review_logs has no records yet, check fsrs_cards with last_review > 0
    if activities.is_empty() {
        let card_sql = format!(
            "SELECT strftime('%Y-%m-%d', last_review, 'unixepoch') as day, COUNT(*) as cnt
             FROM fsrs_cards
             {} {}
             GROUP BY day
             ORDER BY day ASC",
            if where_clause.is_empty() { "WHERE" } else { "WHERE book_id = ? AND" },
            "last_review > 0"
        );
        let mut card_stmt = conn.prepare(&card_sql)?;
        let card_rows = card_stmt.query_map(
            rusqlite::params_from_iter(params_vec),
            |r| Ok(DayReviewActivity {
                date: r.get(0)?,
                count: r.get(1)?,
            })
        )?;
        activities = card_rows.filter_map(|r| r.ok()).collect();
    }

    Ok(activities)
}

/// Calculates retention stats (due today, total mastered cards, FSRS power-law retention percentage).
pub fn get_retention_metrics_blocking(book_id: Option<&str>) -> Result<RetentionMetrics> {
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

    // Cards due today: due <= now + 86400 or reps = 0
    let due_where = if where_clause.is_empty() {
        "WHERE (due <= ? OR reps = 0)"
    } else {
        "WHERE (due <= ? OR reps = 0) AND book_id = ?"
    };
    let mut due_params: Vec<rusqlite::types::Value> = vec![(now + 86400).into()];
    if let Some(b) = book_id {
        due_params.push(b.to_string().into());
    }

    let due_today: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM fsrs_cards {}", due_where),
        rusqlite::params_from_iter(due_params),
        |r| r.get(0),
    ).unwrap_or(0);

    // Mastered cards: state = 2 (Review) and stability >= 21.0
    let mastered_where = if where_clause.is_empty() {
        "WHERE state = 2 AND stability >= 21.0"
    } else {
        "WHERE state = 2 AND stability >= 21.0 AND book_id = ?"
    };
    let mastered_cards: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM fsrs_cards {}", mastered_where),
        rusqlite::params_from_iter(params_vec.iter().cloned()),
        |r| r.get(0),
    ).unwrap_or(0);

    // Current retention rate calculation via calculate_retrievability
    let mut stmt = conn.prepare(
        &format!("SELECT stability, last_review FROM fsrs_cards {} AND reps > 0",
            if where_clause.is_empty() { "WHERE 1=1" } else { where_clause }
        )
    )?;

    let reviewed_rows = stmt.query_map(
        rusqlite::params_from_iter(params_vec),
        |row| {
            let stability: f64 = row.get(0)?;
            let last_review: i64 = row.get(1)?;
            Ok((stability, last_review))
        }
    )?;

    let mut sum_retrievability = 0.0;
    let mut reviewed_count = 0usize;

    for row in reviewed_rows.flatten() {
        let (stability, last_review) = row;
        let elapsed_days = if last_review > 0 {
            ((now - last_review).max(0) as f64) / 86400.0
        } else {
            0.0
        };
        let r = crate::fsrs::calculate_retrievability(elapsed_days, stability);
        sum_retrievability += r;
        reviewed_count += 1;
    }

    let retention_rate = if reviewed_count > 0 {
        ((sum_retrievability / reviewed_count as f64) * 1000.0).round() / 10.0
    } else {
        90.0 // Default target retention
    };

    Ok(RetentionMetrics {
        due_today,
        total_cards,
        mastered_cards,
        retention_rate,
    })
}

/// Aggregates full study analytics: review frequency, card states, retention rate,
/// mastered count, cards due today, and total vault words / reading time.
pub fn get_study_analytics_blocking(book_id: Option<&str>) -> Result<StudyAnalytics> {
    let conn = open_or_create_db()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let (where_clause, params_vec): (&str, Vec<rusqlite::types::Value>) = match book_id {
        Some(b) => ("WHERE book_id = ?", vec![b.to_string().into()]),
        None => ("", vec![]),
    };

    // 1. State counts
    let mut new_count = 0;
    let mut learning_count = 0;
    let mut review_count = 0;
    let mut relearning_count = 0;

    let group_sql = format!(
        "SELECT state, COUNT(*) FROM fsrs_cards {} GROUP BY state",
        where_clause
    );
    if let Ok(mut stmt) = conn.prepare(&group_sql) {
        if let Ok(rows) = stmt.query_map(rusqlite::params_from_iter(params_vec.iter().cloned()), |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, usize>(1)?))
        }) {
            for (st, count) in rows.flatten() {
                match st {
                    0 => new_count = count,
                    1 => learning_count = count,
                    2 => review_count = count,
                    3 => relearning_count = count,
                    _ => {}
                }
            }
        }
    }

    let total_cards = new_count + learning_count + review_count + relearning_count;

    let state_counts = StateCounts {
        new_count,
        learning_count,
        review_count,
        relearning_count,
        total_cards,
    };

    // 2. Daily review frequency
    let daily_reviews = get_review_heatmap_blocking(book_id)?;

    // 3. Retention rate: (total_reviews - again_count) / total_reviews
    let total_reviews: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM review_logs {}", where_clause),
        rusqlite::params_from_iter(params_vec.iter().cloned()),
        |r| r.get(0),
    ).unwrap_or(0);

    let again_count: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM review_logs {} {}",
            if where_clause.is_empty() { "WHERE" } else { "WHERE book_id = ? AND" },
            "rating = 1"),
        rusqlite::params_from_iter(params_vec.iter().cloned()),
        |r| r.get(0),
    ).unwrap_or(0);

    let retention_rate = if total_reviews > 0 {
        (((total_reviews - again_count) as f64 / total_reviews as f64) * 1000.0).round() / 10.0
    } else {
        let ret = get_retention_metrics_blocking(book_id)?;
        ret.retention_rate
    };

    // 4. Cards due today & Mastered cards
    let due_where = if where_clause.is_empty() {
        "WHERE (due <= ? OR reps = 0)"
    } else {
        "WHERE (due <= ? OR reps = 0) AND book_id = ?"
    };
    let mut due_params: Vec<rusqlite::types::Value> = vec![(now + 86400).into()];
    if let Some(b) = book_id {
        due_params.push(b.to_string().into());
    }
    let cards_due_today: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM fsrs_cards {}", due_where),
        rusqlite::params_from_iter(due_params),
        |r| r.get(0),
    ).unwrap_or(0);

    let mastered_where = if where_clause.is_empty() {
        "WHERE state = 2 AND stability >= 21.0"
    } else {
        "WHERE state = 2 AND stability >= 21.0 AND book_id = ?"
    };
    let mastered_cards: usize = conn.query_row(
        &format!("SELECT COUNT(*) FROM fsrs_cards {}", mastered_where),
        rusqlite::params_from_iter(params_vec),
        |r| r.get(0),
    ).unwrap_or(0);

    // 5. Total vault words & estimated reading time
    let mut total_vault_words: usize = 0;
    if let Ok(vault_root) = find_vault_root() {
        let books_dir = vault_root.join("books");
        if let Some(b_id) = book_id {
            let meta_path = books_dir.join(b_id).join("_meta.json");
            if let Ok(meta_str) = std::fs::read_to_string(&meta_path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&meta_str) {
                    total_vault_words = val["total_words"].as_u64().unwrap_or(0) as usize;
                }
            }
        } else if let Ok(read_dir) = std::fs::read_dir(&books_dir) {
            for entry in read_dir.flatten() {
                let meta_path = entry.path().join("_meta.json");
                if let Ok(meta_str) = std::fs::read_to_string(&meta_path) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&meta_str) {
                        total_vault_words += val["total_words"].as_u64().unwrap_or(0) as usize;
                    }
                }
            }
        }
    }

    let estimated_reading_time_mins = if total_vault_words > 0 {
        total_vault_words / 225
    } else {
        0
    };

    Ok(StudyAnalytics {
        daily_reviews,
        state_counts,
        retention_rate,
        cards_due_today,
        mastered_cards,
        total_vault_words,
        estimated_reading_time_mins,
    })
}
