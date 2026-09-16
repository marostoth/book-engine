use anyhow::{Context, Result};
use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

use super::reader::find_vault_root;
use super::syntopicon_models::{SyntopicTopic, SyntopicTopicSummary};

/// Ensures the `vault/syntopicon/{topics,reports}` directories exist and returns the topics path.
pub fn ensure_syntopicon_dirs() -> Result<PathBuf> {
    let vault = find_vault_root()?;
    let topics_dir = vault.join("syntopicon").join("topics");
    if !topics_dir.exists() {
        fs::create_dir_all(&topics_dir)
            .with_context(|| format!("Failed to create syntopicon topics directory: {}", topics_dir.display()))?;
    }
    let reports_dir = vault.join("syntopicon").join("reports");
    if !reports_dir.exists() {
        fs::create_dir_all(&reports_dir)
            .with_context(|| format!("Failed to create syntopicon reports directory: {}", reports_dir.display()))?;
    }
    Ok(topics_dir)
}

/// Lists all syntopic topics stored in `vault/syntopicon/topics/*.json` as summaries.
pub fn list_syntopic_topics() -> Result<Vec<SyntopicTopicSummary>> {
    let topics_dir = ensure_syntopicon_dirs()?;
    let mut summaries = Vec::new();

    let entries = fs::read_dir(&topics_dir)
        .with_context(|| format!("Failed to read syntopicon topics dir: {}", topics_dir.display()))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().is_some_and(|ext| ext == "json") {
            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(err) => {
                    eprintln!("Warning: Failed reading topic file {}: {}", path.display(), err);
                    continue;
                }
            };

            let topic: SyntopicTopic = match serde_json::from_str(&content) {
                Ok(t) => t,
                Err(err) => {
                    eprintln!("Warning: Invalid topic JSON in {}: {}", path.display(), err);
                    continue;
                }
            };

            let mut books = BTreeSet::new();
            for term in &topic.neutral_terms {
                for m in &term.mappings {
                    if !m.book_id.is_empty() {
                        books.insert(m.book_id.clone());
                    }
                    if !m.citation.book_id.is_empty() {
                        books.insert(m.citation.book_id.clone());
                    }
                }
            }
            for c in &topic.controversies {
                for p in &c.perspectives {
                    if !p.book_id.is_empty() {
                        books.insert(p.book_id.clone());
                    }
                    for cit in &p.citations {
                        if !cit.book_id.is_empty() {
                            books.insert(cit.book_id.clone());
                        }
                    }
                }
            }

            summaries.push(SyntopicTopicSummary {
                id: topic.id,
                title: topic.title,
                description: topic.description,
                term_count: topic.neutral_terms.len(),
                question_count: topic.questions.len(),
                controversy_count: topic.controversies.len(),
                books_involved: books.into_iter().collect(),
                created_at: topic.created_at,
            });
        }
    }

    summaries.sort_by(|a, b| a.title.cmp(&b.title));
    Ok(summaries)
}

/// Loads a single syntopic topic from `vault/syntopicon/topics/<topic-id>.json`.
pub fn load_syntopic_topic(topic_id: &str) -> Result<SyntopicTopic> {
    let topics_dir = ensure_syntopicon_dirs()?;
    let file_path = topics_dir.join(format!("{}.json", topic_id));

    if !file_path.exists() {
        return Ok(SyntopicTopic {
            id: topic_id.to_string(),
            ..Default::default()
        });
    }

    let raw = fs::read_to_string(&file_path)
        .with_context(|| format!("Failed to read topic file: {}", file_path.display()))?;

    let topic: SyntopicTopic = serde_json::from_str(&raw)
        .with_context(|| format!("Malformed topic JSON in: {}", file_path.display()))?;

    Ok(topic)
}

/// Persists a syntopic topic to `vault/syntopicon/topics/<topic-id>.json`.
pub fn save_syntopic_topic(topic: SyntopicTopic) -> Result<()> {
    let topics_dir = ensure_syntopicon_dirs()?;
    let file_path = topics_dir.join(format!("{}.json", topic.id));

    let serialized = serde_json::to_string_pretty(&topic)
        .context("Failed to serialize SyntopicTopic to JSON")?;

    super::safe_write::write_file(&file_path, &serialized)
}

/// Compiles a dialectical synthesis report and persists it to `vault/syntopicon/reports/<topic-id>-synthesis.md`.
pub fn export_syntopic_report(topic_id: &str) -> Result<String> {
    let vault = find_vault_root()?;
    let reports_dir = vault.join("syntopicon").join("reports");
    if !reports_dir.exists() {
        fs::create_dir_all(&reports_dir)
            .with_context(|| format!("Failed to create syntopicon reports dir: {}", reports_dir.display()))?;
    }

    let topic = load_syntopic_topic(topic_id)?;
    let markdown = super::syntopicon_compiler::compile_dialectical_dossier(&topic);

    let filename = format!("{}-synthesis.md", topic.id);
    let file_path = reports_dir.join(&filename);

    super::safe_write::write_file(&file_path, &markdown)?;

    Ok(format!("reports/{}", filename))
}

#[cfg(test)]
mod tests {
    use crate::vault::syntopicon_models::*;

    #[test]
    fn test_syntopicon_roundtrip_and_summary() {
        let topic = SyntopicTopic {
            id: "test-topic".into(),
            title: "Test Topic".into(),
            description: "A test description".into(),
            neutral_terms: vec![NeutralTerm {
                id: "term-1".into(),
                term: "Division of Labor".into(),
                neutral_definition: "Specialization of productive tasks".into(),
                mappings: vec![TermMapping {
                    book_id: "book-a".into(),
                    author_variant: "Division of work".into(),
                    author_term_id: None,
                    citation: CrossBookCitation {
                        book_id: "book-a".into(),
                        chapter_file: "ch-01.md".into(),
                        anchor: "^p-001".into(),
                        quote: "Specialization increases output.".into(),
                    },
                }],
            }],
            questions: vec![SyntopicQuestion {
                id: "q-1".into(),
                question: "Does division of labor cause alienation?".into(),
                order: 1,
            }],
            controversies: vec![SyntopicControversy {
                id: "c-1".into(),
                question_id: "q-1".into(),
                title: "Alienation controversy".into(),
                perspectives: vec![
                    SyntopicPerspective {
                        book_id: "book-b".into(),
                        stance: "Causes severe mental degradation".into(),
                        argument_ids: None,
                        citations: vec![CrossBookCitation {
                            book_id: "book-b".into(),
                            chapter_file: "ch-02.md".into(),
                            anchor: "^p-010".into(),
                            quote: "The worker becomes depressed.".into(),
                        }],
                    },
                ],
            }],
            synthesis_notes: Some("Dialectical debate notes".into()),
            dialectical_resolution: Some("Dialectical resolution statement".into()),
            created_at: "2026-09-13T10:00:00Z".into(),
        };

        let serialized = serde_json::to_string(&topic).expect("serialize");
        let deserialized: SyntopicTopic = serde_json::from_str(&serialized).expect("deserialize");
        assert_eq!(topic, deserialized);
        assert_eq!(deserialized.neutral_terms.len(), 1);
        assert_eq!(deserialized.questions.len(), 1);
        assert_eq!(deserialized.controversies.len(), 1);
        assert_eq!(deserialized.synthesis_notes.as_deref(), Some("Dialectical debate notes"));
    }
}
