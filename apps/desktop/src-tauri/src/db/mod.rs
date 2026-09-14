pub mod models;
pub mod schema;
pub mod seed_lexicon;
pub mod indexer;
pub mod fsrs_parser;
pub mod fsrs_store;
pub mod reading_velocity;
pub mod analytics;

pub use models::*;
pub use schema::*;
pub use indexer::*;
pub use fsrs_store::*;
pub use reading_velocity::*;
pub use analytics::*;

/// Blocking helper: opens the SQLite cache and queries the dictionary with sanitized input.
pub fn lookup_dictionary_blocking(word: &str) -> anyhow::Result<Option<DictionaryEntry>> {
    let conn = open_or_create_db()?;
    lookup_dictionary(&conn, word)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dictionary_lookup_and_sanitization() {
        // Direct match
        let entry = lookup_dictionary_blocking("inspectional")
            .expect("Lookup failed")
            .expect("Expected entry for 'inspectional'");
        assert_eq!(entry.word, "inspectional");
        assert!(entry.definition.contains("skimming"));

        // Match with punctuation, quotes, or trailing footnote
        let sanitized = lookup_dictionary_blocking("\"(elementary),\"")
            .expect("Sanitized lookup failed")
            .expect("Expected entry for 'elementary'");
        assert_eq!(sanitized.word, "elementary");
        assert_eq!(sanitized.part_of_speech.as_deref(), Some("adjective"));
    }

    #[test]
    fn test_index_and_search() {
        let summary = index_vault_blocking().expect("Indexing vault failed");
        println!(
            "[+] Indexed {} chapters, {} paragraphs in {} ms",
            summary.chapters_indexed, summary.paragraphs_indexed, summary.duration_ms
        );

        let results = search_vault_blocking("division of labour").expect("Search failed");
        println!("[+] Search 'division of labour' returned {} results", results.len());
        assert!(!results.is_empty(), "Expected search results for 'division of labour'");
    }

    #[test]
    fn test_fsrs_sync_and_review() {
        let synced = sync_practice_deck_blocking("sample").expect("Failed to sync sample practice deck");
        println!("[+] Synced {} cards from sample", synced);
        assert!(synced > 0, "Expected at least 1 card synced from sample");

        // Reset cards to due to guarantee test idempotency across repeated runs
        if let Ok(conn) = open_or_create_db() {
            let _ = conn.execute(
                "UPDATE fsrs_cards SET due = 0, reps = 0, state = 0 WHERE book_id = 'sample'",
                [],
            );
        }

        let due = get_due_cards_blocking(Some("sample")).expect("Failed to get due cards");
        assert!(!due.is_empty(), "Expected due cards for sample");

        let first_card = &due[0];
        let sched = submit_card_review_blocking(&first_card.card_id, 3).expect("Submit review failed");
        assert_eq!(sched.reps, 1);
        assert!(sched.due > first_card.due || sched.stability > 0.0);

        let stats = get_deck_stats_blocking(Some("sample")).expect("Failed to get stats");
        assert!(stats.total_cards > 0);
    }

    #[test]
    fn test_phase5_analytics() {
        let _ = sync_practice_deck_blocking("sample");
        if let Ok(conn) = open_or_create_db() {
            let _ = conn.execute(
                "UPDATE fsrs_cards SET due = 0, reps = 0, state = 0 WHERE book_id = 'sample'",
                [],
            );
        }
        let due = get_due_cards_blocking(Some("sample")).expect("Failed to get due cards");
        if !due.is_empty() {
            let _ = submit_card_review_blocking(&due[0].card_id, 4);
        }

        let heatmap = get_review_heatmap_blocking(Some("sample")).expect("Failed to get heatmap");
        assert!(!heatmap.is_empty(), "Expected at least 1 day in review heatmap");

        let retention = get_retention_metrics_blocking(Some("sample")).expect("Failed to get retention");
        assert!(retention.retention_rate >= 0.0 && retention.retention_rate <= 100.0);

        record_reading_session_blocking("sample", "ch-01.md", 120, 250, true)
            .expect("Failed to record reading session");

        let velocity = get_reading_velocity_blocking(Some("sample")).expect("Failed to get reading velocity");
        assert!(velocity.total_seconds >= 120);
        assert!(velocity.completed_chapters >= 1);
        assert!(velocity.average_wpm > 0.0);

        // Test Phase 5 IPC endpoints: get_study_analytics_blocking
        let analytics = get_study_analytics_blocking(Some("sample")).expect("Failed to get study analytics");
        assert!(analytics.retention_rate >= 0.0 && analytics.retention_rate <= 100.0);
        assert!(analytics.total_vault_words > 0);
        assert_eq!(
            analytics.state_counts.total_cards,
            analytics.state_counts.new_count
                + analytics.state_counts.learning_count
                + analytics.state_counts.review_count
                + analytics.state_counts.relearning_count
        );

        // Test Phase 5 IPC endpoints: parse_all_book_notes and compile_and_export_book_summary
        let notes = crate::vault::parse_all_book_notes("sample").expect("Failed to parse book notes");
        println!("[+] Parsed {} aggregated notes from sample", notes.len());
        let export_path =
            crate::vault::compile_and_export_book_summary("sample").expect("Failed to export summary");
        assert!(std::path::Path::new(&export_path).exists(), "Exported summary file must exist");
    }
}
