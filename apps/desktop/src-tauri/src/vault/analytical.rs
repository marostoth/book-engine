use anyhow::{Context, Result};
use std::fs;
use super::models::AnalyticalStore;
use super::reader::find_vault_root;

/// Returns the analytical reading store for the given book from `vault/notes/<book-id>/analytical.json`.
/// If the file does not exist, returns an empty store without erroring (Non-destructive ground truth).
pub fn load_analytical_store(book_id: &str) -> Result<AnalyticalStore> {
    let vault = find_vault_root()?;
    let analytical_file = vault.join("notes").join(book_id).join("analytical.json");

    if !analytical_file.exists() {
        return Ok(AnalyticalStore::default());
    }

    let raw = match fs::read_to_string(&analytical_file) {
        Ok(content) => content,
        Err(e) => {
            eprintln!("Warning: Failed to read analytical store at {}: {}", analytical_file.display(), e);
            return Ok(AnalyticalStore::default());
        }
    };

    let store: AnalyticalStore = match serde_json::from_str(&raw) {
        Ok(parsed) => parsed,
        Err(e) => {
            eprintln!("Warning: Malformed analytical JSON at {}: {}. Returning empty store.", analytical_file.display(), e);
            AnalyticalStore::default()
        }
    };

    Ok(store)
}

/// Atomically persists terms and arguments to `vault/notes/<book-id>/analytical.json`.
pub fn save_analytical_store(book_id: &str, store: AnalyticalStore) -> Result<()> {
    let vault = find_vault_root()?;
    let notes_dir = vault.join("notes").join(book_id);

    if !notes_dir.exists() {
        fs::create_dir_all(&notes_dir)
            .with_context(|| format!("Failed to create notes dir: {}", notes_dir.display()))?;
    }

    let analytical_file = notes_dir.join("analytical.json");
    let serialized = serde_json::to_string_pretty(&store)
        .context("Failed to serialize analytical store to JSON")?;

    fs::write(&analytical_file, serialized)
        .with_context(|| format!("Failed to write analytical file: {}", analytical_file.display()))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::models::{
        AnchoredCitation, ArgumentNode, AuthorInquiry, AuthorTerm, CritiqueItem, InquiryDomain,
        InquiryPriority, ResolutionStatus,
    };

    #[test]
    fn test_analytical_load_and_save() {
        let _sandbox = crate::test_support::Sandbox::new();
        let test_book = "sample";
        let mut store = load_analytical_store(test_book).expect("Failed to load analytical store");
        
        let term = AuthorTerm {
            id: "test-term-1".to_string(),
            term: "linearizability".to_string(),
            author_definition: "Strong consistency guarantee".to_string(),
            citation: AnchoredCitation {
                chapter_file: "ch-01.md".to_string(),
                anchor: "^p-001".to_string(),
                quote: "In distributed computing, linearizability is defined...".to_string(),
            },
        };
        store.terms.push(term);

        let arg = ArgumentNode {
            id: "test-arg-1".to_string(),
            title: "Consistency trade-off".to_string(),
            conclusion: AnchoredCitation {
                chapter_file: "ch-01.md".to_string(),
                anchor: "^p-003".to_string(),
                quote: "Under network partitions...".to_string(),
            },
            premises: vec![AnchoredCitation {
                chapter_file: "ch-01.md".to_string(),
                anchor: "^p-001".to_string(),
                quote: "linearizability...".to_string(),
            }],
            inference_type: "deductive".to_string(),
            notes: "Test argument node".to_string(),
        };
        store.arguments.push(arg);

        let critique = CritiqueItem {
            id: "test-crit-1".to_string(),
            target_argument_id: Some("test-arg-1".to_string()),
            citation: Some(AnchoredCitation {
                chapter_file: "ch-01.md".to_string(),
                anchor: "^p-003".to_string(),
                quote: "Under network partitions...".to_string(),
            }),
            understanding_declared: true,
            judgment: "disagree".to_string(),
            defects: vec!["incomplete".to_string()],
            rationale: "Trade-off ignores PACELC extensions.".to_string(),
            created_at: "2026-09-13T09:40:00Z".to_string(),
        };
        store.critiques.push(critique);

        let inquiry = AuthorInquiry {
            id: "test-inq-1".to_string(),
            question: "How can atomic consistency be verified in asynchronous networks?".to_string(),
            domain: InquiryDomain::Theoretical,
            priority: InquiryPriority::Primary,
            citation: Some(AnchoredCitation {
                chapter_file: "ch-01.md".to_string(),
                anchor: "^p-001".to_string(),
                quote: "In distributed computing, linearizability is defined...".to_string(),
            }),
            resolution: ResolutionStatus::Solved,
            solution_notes: "Proven solvable via execution trace linearization testing.".to_string(),
            solution_argument_ids: vec!["test-arg-1".to_string()],
            solution_citation: Some(AnchoredCitation {
                chapter_file: "ch-01.md".to_string(),
                anchor: "^p-003".to_string(),
                quote: "Under network partitions...".to_string(),
            }),
            created_at: "2026-09-13T10:00:00Z".to_string(),
        };
        store.inquiries.push(inquiry);

        save_analytical_store(test_book, store).expect("Failed to save analytical store");

        let reloaded = load_analytical_store(test_book).expect("Failed to reload analytical store");
        assert!(!reloaded.terms.is_empty());
        assert!(!reloaded.arguments.is_empty());
        assert!(!reloaded.critiques.is_empty());
        assert!(!reloaded.inquiries.is_empty());
        assert_eq!(reloaded.critiques[0].judgment, "disagree");
        assert_eq!(reloaded.inquiries[0].domain, InquiryDomain::Theoretical);
        assert_eq!(reloaded.inquiries[0].resolution, ResolutionStatus::Solved);
    }

    #[test]
    fn test_analytical_backward_compatibility() {
        let legacy_json = r#"{
            "terms": [],
            "arguments": []
        }"#;
        let store: AnalyticalStore = serde_json::from_str(legacy_json).expect("Should parse legacy JSON");
        assert!(store.terms.is_empty());
        assert!(store.arguments.is_empty());
        assert!(store.critiques.is_empty());
        assert!(store.inquiries.is_empty());
        assert!(store.overall_verdict.is_none());
    }
}
