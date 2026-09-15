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
    use crate::test_support::Sandbox;

    #[test]
    fn test_dictionary_lookup_and_sanitization() {
        let _sandbox = Sandbox::new();

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
        let sandbox = Sandbox::new();
        sandbox.write_sample_book();

        let summary = index_vault_blocking().expect("Indexing vault failed");
        assert_eq!(summary.chapters_indexed, 1);

        let results = search_vault_blocking("division of labour").expect("Search failed");
        assert!(!results.is_empty(), "Expected search results for 'division of labour'");
        assert_eq!(results[0].anchor, "^p-001");
    }

    #[test]
    fn test_fsrs_sync_and_review() {
        let sandbox = Sandbox::new();
        sandbox.write_sample_book();

        let synced = sync_practice_deck_blocking("sample").expect("Failed to sync sample practice deck");
        assert_eq!(synced, 2, "Expected the cloze card and the scenario card to sync");

        let due = get_due_cards_blocking(Some("sample"), None, None, None).expect("Failed to get due cards");
        assert_eq!(due.len(), 2, "New cards must be due right after sync");

        let first_card = &due[0];
        let sched = submit_card_review_blocking(&first_card.card_id, 3).expect("Submit review failed");
        assert_eq!(sched.reps, 1);
        assert!(sched.due > first_card.due || sched.stability > 0.0);

        let stats = get_deck_stats_blocking(Some("sample")).expect("Failed to get stats");
        assert_eq!(stats.total_cards, 2);
    }

    #[test]
    fn test_phase5_analytics() {
        let sandbox = Sandbox::new();
        sandbox.write_sample_book();

        sync_practice_deck_blocking("sample").expect("Failed to sync sample practice deck");
        let due = get_due_cards_blocking(Some("sample"), None, None, None).expect("Failed to get due cards");
        submit_card_review_blocking(&due[0].card_id, 4).expect("Submit review failed");

        let heatmap = get_review_heatmap_blocking(Some("sample")).expect("Failed to get heatmap");
        assert!(!heatmap.is_empty(), "Expected at least 1 day in review heatmap");

        let retention = get_retention_metrics_blocking(Some("sample")).expect("Failed to get retention");
        assert!(retention.retention_rate >= 0.0 && retention.retention_rate <= 100.0);

        record_reading_session_blocking("sample", "ch-01.md", 120, 250, true)
            .expect("Failed to record reading session");

        let velocity = get_reading_velocity_blocking(Some("sample")).expect("Failed to get reading velocity");
        assert_eq!(velocity.total_seconds, 120);
        assert_eq!(velocity.completed_chapters, 1);
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
        assert_eq!(notes.len(), 1, "Expected the one reflection in ch-01-notes.md");
        let export_path =
            crate::vault::compile_and_export_book_summary("sample").expect("Failed to export summary");
        let export_path = std::path::Path::new(&export_path);
        assert!(export_path.exists(), "Exported summary file must exist");
        assert!(export_path.starts_with(sandbox.vault()), "Export must stay inside the test sandbox");
    }
}
