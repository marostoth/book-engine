pub mod analytics;
#[cfg(test)]
mod analytics_numbers_tests;
#[cfg(test)]
mod analytics_tests;
pub mod backfill;
#[cfg(test)]
mod backfill_tests;
pub mod card_identity;
pub mod chapter_blocks;
#[cfg(test)]
mod chapter_blocks_tests;
#[cfg(test)]
mod content_hash_tests;
pub mod deck_sync;
#[cfg(test)]
mod deck_sync_tests;
pub mod due_cards;
pub mod fsrs_parser;
#[cfg(test)]
mod fsrs_parser_tests;
pub mod fsrs_store;
#[cfg(test)]
mod fsrs_store_tests;
pub mod indexer;
#[cfg(test)]
mod indexer_tests;
pub mod models;
pub mod reading_velocity;
#[cfg(test)]
mod reading_velocity_tests;
pub mod removed_books;
#[cfg(test)]
mod removed_books_tests;
pub mod restore;
#[cfg(test)]
mod restore_tests;
pub mod schema;
pub mod search_query;
#[cfg(test)]
mod search_results_tests;
#[cfg(test)]
mod search_tests;
pub mod search_text;
pub mod seed_lexicon;

pub use analytics::*;
pub use backfill::*;
pub use deck_sync::*;
pub use due_cards::*;
pub use fsrs_store::*;
pub use indexer::*;
pub use models::*;
pub use reading_velocity::*;
pub use restore::*;
pub use schema::*;

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
    fn test_due_card_json_matches_frontend_contract() {
        let sandbox = Sandbox::new();
        sandbox.write_sample_book();
        sync_practice_deck_blocking("sample").expect("Failed to sync sample practice deck");

        let mut card = get_due_cards_blocking(Some("sample"), Some("scenario"), None, None)
            .expect("Failed to get due cards")
            .pop()
            .expect("Expected the sample scenario card");
        card.due = 0; // Sync time; every other field is fixed by the sandbox book.

        let sent = serde_json::to_value(&card).expect("Failed to serialize card");
        let contract: serde_json::Value = serde_json::from_str(include_str!("../../../src/lib/practiceContract.json"))
            .expect("Failed to parse practiceContract.json");
        assert_eq!(
            sent, contract,
            "get_due_cards JSON must match src/lib/practiceContract.json (read by the frontend tests)"
        );
    }

    #[test]
    fn test_cached_scenario_options_with_camel_case_still_load() {
        // index.db rows written by older builds store `isCorrect`; they must still load until the next sync.
        let option: ScenarioOption = serde_json::from_str(r#"{"key":"A","text":"Output rises.","isCorrect":true}"#)
            .expect("Old cached option must parse");
        assert!(option.is_correct);
    }

    #[test]
    fn test_phase5_analytics() {
        let sandbox = Sandbox::new();
        sandbox.write_sample_book();

        sync_practice_deck_blocking("sample").expect("Failed to sync sample practice deck");
        let due = get_due_cards_blocking(Some("sample"), None, None, None).expect("Failed to get due cards");
        submit_card_review_blocking(&due[0].card_id, 4).expect("Submit review failed");

        let heatmap = get_review_heatmap_blocking(Some("sample")).expect("Failed to get heatmap");
        assert!(
            !heatmap.is_empty(),
            "Expected at least 1 block of reviews in the heatmap"
        );

        let retention = get_retention_metrics_blocking(Some("sample")).expect("Failed to get retention");
        let rate = retention
            .retention_rate
            .expect("a card was reviewed, so there is a retention rate");
        assert!((0.0..=100.0).contains(&rate));

        record_reading_session_blocking("sample", "ch-01.md", 120, true).expect("Failed to record reading session");

        let velocity = get_reading_velocity_blocking(Some("sample")).expect("Failed to get reading velocity");
        assert_eq!(velocity.total_seconds, 120);
        assert_eq!(velocity.completed_chapters, 1);

        // Test Phase 5 IPC endpoints: get_study_analytics_blocking
        let analytics = get_study_analytics_blocking(Some("sample")).expect("Failed to get study analytics");
        let rate = analytics
            .retention_rate
            .expect("a card was reviewed, so there is a retention rate");
        assert!((0.0..=100.0).contains(&rate));
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
        let export_path = crate::vault::compile_and_export_book_summary("sample").expect("Failed to export summary");
        let export_path = std::path::Path::new(&export_path);
        assert!(export_path.exists(), "Exported summary file must exist");
        assert!(
            export_path.starts_with(sandbox.vault()),
            "Export must stay inside the test sandbox"
        );
    }
}
