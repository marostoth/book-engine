use anyhow::{anyhow, bail, Context, Result};
use chrono::{SecondsFormat, Utc};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

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

/// The id of a new topic, which is also its file name: the title in lowercase letters and digits, with one `-` for
/// every run of other characters. "Division of Labor" gives `division-of-labor`. A title with no letter or digit
/// gives an empty id.
pub fn topic_id_from_title(title: &str) -> String {
    let mut id = String::new();
    for c in title.to_lowercase().chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            id.push(c);
        } else if !id.is_empty() && !id.ends_with('-') {
            id.push('-');
        }
    }
    while id.ends_with('-') {
        id.pop();
    }
    id
}

/// Only one topic is created at a time, so two creates of the same title cannot both find its file free.
static CREATING: Mutex<()> = Mutex::new(());

/// Creates an empty topic in `vault/syntopicon/topics/<topic-id>.json` and returns it.
///
/// A topic file that is already there is never replaced. Titles that differ only in capitals or punctuation need
/// the same file, and creating a topic used to write an empty topic over the one saved there (DS-12). Such a
/// create is refused, and the message names the file and the topic in it. A title with no letter or digit gets the
/// first free `topic-<n>` file.
pub fn create_syntopic_topic(title: &str, description: &str) -> Result<SyntopicTopic> {
    let topics_dir = ensure_syntopicon_dirs()?;
    let _creating = CREATING.lock().unwrap_or_else(PoisonError::into_inner);

    let id = match topic_id_from_title(title) {
        id if id.is_empty() => first_free_numbered_id(&topics_dir)?,
        id => {
            refuse_a_taken_file(&topics_dir, &id)?;
            id
        }
    };
    let topic = SyntopicTopic {
        id,
        title: title.to_string(),
        description: description.to_string(),
        created_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        ..Default::default()
    };
    save_syntopic_topic(topic.clone())?;
    Ok(topic)
}

/// True when the topic file for `id` is there, or when that cannot be told.
fn is_taken(topics_dir: &Path, id: &str) -> bool {
    topics_dir.join(format!("{id}.json")).try_exists().unwrap_or(true)
}

/// Refuses a new topic whose file is already there, whether that file can be read or not.
fn refuse_a_taken_file(topics_dir: &Path, id: &str) -> Result<()> {
    if !is_taken(topics_dir, id) {
        return Ok(());
    }
    let existing = fs::read_to_string(topics_dir.join(format!("{id}.json")))
        .ok()
        .and_then(|text| serde_json::from_str::<SyntopicTopic>(&text).ok());
    match existing {
        Some(existing) => bail!(
            "This title needs the file {id}.json, and the topic \"{}\" already uses it. Open that topic, or choose \
             another title.",
            existing.title
        ),
        None => bail!(
            "This title needs the file {id}.json. That file is already there but cannot be read, so it is not \
             replaced. Choose another title."
        ),
    }
}

/// The first `topic-<n>` id whose file is not there.
fn first_free_numbered_id(topics_dir: &Path) -> Result<String> {
    (1..=10_000)
        .map(|n| format!("topic-{n}"))
        .find(|id| !is_taken(topics_dir, id))
        .ok_or_else(|| anyhow!("No free topic file name was found in {}.", topics_dir.display()))
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
