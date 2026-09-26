use super::json_store::read_json_file;
use super::models::AnalyticalStore;
use anyhow::{Context, Result};

/// Returns the analytical reading store for the given book from `vault/notes/<book-id>/analytical.json`.
/// A book with no file yet gets an empty store. A damaged file gives an error, never an empty
/// store, because the caller would then save that empty store over the file (DS-04).
pub fn load_analytical_store(book_id: &str) -> Result<AnalyticalStore> {
    let analytical_file = super::paths::notes_file(book_id, "analytical.json")?;

    Ok(read_json_file(&analytical_file)?.unwrap_or_default())
}

/// Atomically persists terms and arguments to `vault/notes/<book-id>/analytical.json`.
///
/// The caller sends the whole store, so a damaged file on disk stops the save. Otherwise the
/// save would replace everything the damaged file still holds (DS-04).
pub fn save_analytical_store(book_id: &str, store: AnalyticalStore) -> Result<()> {
    let analytical_file = super::paths::notes_file(book_id, "analytical.json")?;

    read_json_file::<AnalyticalStore>(&analytical_file)?;

    let serialized = serde_json::to_string_pretty(&store).context("Failed to serialize analytical store to JSON")?;

    super::safe_write::write_file(&analytical_file, &serialized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::models::{
        AnchoredCitation, ArgumentNode, AuthorInquiry, AuthorTerm, CritiqueItem, InquiryDomain, InquiryPriority,
        ResolutionStatus,
    };
    use std::fs;

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

    const ANALYTICAL_FILE: &str = "notes/sample/analytical.json";
    const TRUNCATED_STORE: &str = r#"{"terms":[{"id":"t1","term":"linearizabil"#;

    /// An analytical store with one term, written the way the app writes it.
    fn one_term_store() -> String {
        let mut store = AnalyticalStore::default();
        store.terms.push(AuthorTerm {
            id: "t1".to_string(),
            term: "linearizability".to_string(),
            author_definition: "Strong consistency guarantee".to_string(),
            citation: AnchoredCitation {
                chapter_file: "ch-01.md".to_string(),
                anchor: "^p-001".to_string(),
                quote: "linearizability is defined...".to_string(),
            },
        });
        serde_json::to_string_pretty(&store).expect("serialize store")
    }

    /// Names of the `.corrupt-` copies next to the sample analytical file.
    fn corrupt_copies(sandbox: &crate::test_support::Sandbox) -> Vec<String> {
        let dir = sandbox.vault().join("notes").join("sample");
        let mut names: Vec<String> = fs::read_dir(&dir)
            .expect("read notes dir")
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.starts_with("analytical.json.corrupt-"))
            .collect();
        names.sort();
        names
    }

    #[test]
    fn a_damaged_analytical_file_is_not_read_as_empty() {
        let sandbox = crate::test_support::Sandbox::new();
        sandbox.write(ANALYTICAL_FILE, TRUNCATED_STORE);

        let error = load_analytical_store("sample").expect_err("a damaged store must not load as empty");
        assert!(
            error.to_string().contains("analytical.json"),
            "the error must name the file: {error}"
        );
    }

    #[test]
    fn a_damaged_analytical_file_is_never_saved_over() {
        let sandbox = crate::test_support::Sandbox::new();
        sandbox.write(ANALYTICAL_FILE, TRUNCATED_STORE);

        let error = save_analytical_store("sample", AnalyticalStore::default())
            .expect_err("a damaged store must refuse the save");

        assert!(
            error.to_string().contains("analytical.json"),
            "the error must name the file: {error}"
        );
        let on_disk = fs::read_to_string(sandbox.vault().join(ANALYTICAL_FILE)).expect("read store file");
        assert_eq!(on_disk, TRUNCATED_STORE, "the damaged file must stay exactly as it was");
    }

    #[test]
    fn a_damaged_analytical_file_is_copied_aside() {
        let sandbox = crate::test_support::Sandbox::new();
        sandbox.write(ANALYTICAL_FILE, TRUNCATED_STORE);

        load_analytical_store("sample").expect_err("load must fail");

        let copies = corrupt_copies(&sandbox);
        assert_eq!(
            copies.len(),
            1,
            "expected one copy of the damaged file, found {copies:?}"
        );
        let copy = sandbox.vault().join("notes").join("sample").join(&copies[0]);
        assert_eq!(fs::read_to_string(copy).expect("read copy"), TRUNCATED_STORE);
    }

    #[test]
    fn a_byte_order_mark_keeps_the_analytical_store() {
        let sandbox = crate::test_support::Sandbox::new();
        sandbox.write(ANALYTICAL_FILE, &format!("\u{feff}{}", one_term_store()));

        let store = load_analytical_store("sample").expect("a file with a byte order mark must load");
        assert_eq!(store.terms.len(), 1, "the saved term must stay");
        assert_eq!(store.terms[0].term, "linearizability");
    }

    #[test]
    fn a_missing_analytical_file_reads_as_an_empty_store() {
        let _sandbox = crate::test_support::Sandbox::new();
        let store = load_analytical_store("sample").expect("missing file is not an error");
        assert!(store.terms.is_empty());
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
    }

    /// `overallVerdict` was a field no screen wrote and none showed, so it was taken out (TL-20). A file that
    /// still holds one must load, with everything else in it.
    #[test]
    fn a_file_with_the_old_verdict_still_loads() {
        let with_verdict = r#"{"terms":[],"arguments":[],"critiques":[],"inquiries":[],"overallVerdict":"agree"}"#;
        let store: AnalyticalStore = serde_json::from_str(with_verdict).expect("a file with a verdict must load");
        assert!(store.terms.is_empty() && store.inquiries.is_empty());
    }
}
