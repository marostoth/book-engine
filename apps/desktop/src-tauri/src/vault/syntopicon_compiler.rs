use std::collections::BTreeSet;
use super::syntopicon_models::SyntopicTopic;

/// Compiles a publication-grade academic Markdown synthesis dossier from a `SyntopicTopic`.
/// Implements Mortimer Adler's Syntopical Rule 5: "Analyzing the Discussion".
pub fn compile_dialectical_dossier(topic: &SyntopicTopic) -> String {
    let mut doc = String::new();

    // 1. Header & Metadata
    doc.push_str(&format!("# Syntopical Reading Dossier: {}\n\n", topic.title));
    if !topic.description.is_empty() {
        doc.push_str(&format!("> **Syntopical Inquiry Subject:** {}\n", topic.description));
    }
    doc.push_str(&format!("> **Registry Topic ID:** `{}`\n", topic.id));

    let mut books = BTreeSet::new();
    for term in &topic.neutral_terms {
        for m in &term.mappings {
            if !m.book_id.is_empty() {
                books.insert(m.book_id.clone());
            }
        }
    }
    for c in &topic.controversies {
        for p in &c.perspectives {
            if !p.book_id.is_empty() {
                books.insert(p.book_id.clone());
            }
        }
    }

    let books_list: Vec<String> = books.into_iter().collect();
    doc.push_str(&format!("> **Primary Sources Investigated:** {}\n\n", books_list.join(", ")));
    doc.push_str("---\n\n");

    // 2. Section 1: Neutral Vocabulary Translation Table (Rule 2)
    doc.push_str("## Section 1: Neutral Vocabulary Translation Table (Rule 2)\n\n");
    doc.push_str("*Adlerian Rule 2: Coming to Terms with the Authors by constructing a common, objective semantic bridge.*\n\n");

    if topic.neutral_terms.is_empty() {
        doc.push_str("_No neutral terms defined for this topic._\n\n");
    } else {
        doc.push_str("| Neutral Term | Synthesized Definition | Author Terminology Mappings |\n");
        doc.push_str("| :--- | :--- | :--- |\n");
        for term in &topic.neutral_terms {
            let mut mappings_str = Vec::new();
            for m in &term.mappings {
                mappings_str.push(format!(
                    "• **[{}]** &ldquo;{}&rdquo; (`{}#{}`)",
                    m.book_id, m.author_variant, m.citation.chapter_file, m.citation.anchor
                ));
            }
            doc.push_str(&format!(
                "| **{}** | {} | {} |\n",
                term.term.replace('|', "\\|"),
                term.neutral_definition.replace('|', "\\|"),
                mappings_str.join("<br/>")
            ));
        }
        doc.push_str("\n### Textual Citation Evidence (Rule 2)\n\n");
        for term in &topic.neutral_terms {
            doc.push_str(&format!("#### Term: {}\n", term.term));
            doc.push_str(&format!("*Definition:* &ldquo;{}&rdquo;\n\n", term.neutral_definition));
            for m in &term.mappings {
                doc.push_str(&format!(
                    "- **[{}]** &ldquo;{}&rdquo; — [`{}#{}`](vault/books/{}/{})\n",
                    m.book_id, m.author_variant, m.citation.chapter_file, m.citation.anchor,
                    m.book_id, m.citation.chapter_file
                ));
                if !m.citation.quote.is_empty() {
                    doc.push_str(&format!("  > &ldquo;{}&rdquo; ({})\n", m.citation.quote, m.citation.anchor));
                }
            }
            doc.push('\n');
        }
    }

    doc.push_str("---\n\n");

    // 3. Section 2: Universal Inquiries & Controversy Matrix (Rules 3 & 4)
    doc.push_str("## Section 2: Universal Inquiries & Controversy Matrix (Rules 3 & 4)\n\n");
    doc.push_str("*Adlerian Rule 3: Framing the Questions across the authors.*\n");
    doc.push_str("*Adlerian Rule 4: Defining the Issues by mapping major cleavages of opinion.*\n\n");

    if topic.questions.is_empty() {
        doc.push_str("_No framed questions established for this topic._\n\n");
    } else {
        for q in &topic.questions {
            doc.push_str(&format!("### Inquiry #{}: {}\n\n", q.order, q.question));
            let controversies: Vec<_> = topic.controversies.iter().filter(|c| c.question_id == q.id).collect();

            if controversies.is_empty() {
                doc.push_str("_No controversies documented for this inquiry._\n\n");
            } else {
                for c in controversies {
                    doc.push_str(&format!("#### Issue: {}\n\n", c.title));
                    for p in &c.perspectives {
                        doc.push_str(&format!("##### Author Perspective: [{}]\n", p.book_id));
                        doc.push_str(&format!("**Stance:** {}\n\n", p.stance));
                        if !p.citations.is_empty() {
                            doc.push_str("**Textual Evidence:**\n");
                            for cit in &p.citations {
                                doc.push_str(&format!(
                                    "- [`{}#{}`](vault/books/{}/{}):\n",
                                    cit.chapter_file, cit.anchor, cit.book_id, cit.chapter_file
                                ));
                                if !cit.quote.is_empty() {
                                    doc.push_str(&format!("  > &ldquo;{}&rdquo; ({})\n", cit.quote, cit.anchor));
                                }
                            }
                            doc.push('\n');
                        }
                    }
                }
            }
        }
    }

    doc.push_str("---\n\n");

    // 4. Section 3: Dialectical Synthesis & Analysis of Discussion (Rule 5)
    doc.push_str("## Section 3: Dialectical Synthesis & Analysis of Discussion (Rule 5)\n\n");
    doc.push_str("*Adlerian Rule 5: Analyzing the Discussion by ordering the debate and distilling truth with dialectical detachment.*\n\n");

    doc.push_str("### 3.1 Dialectical Discussion & Cleavages of Opinion\n\n");
    match &topic.synthesis_notes {
        Some(notes) if !notes.trim().is_empty() => {
            doc.push_str(notes.trim());
            doc.push_str("\n\n");
        }
        _ => {
            doc.push_str("_No dialectical discussion notes recorded._\n\n");
        }
    }

    doc.push_str("### 3.2 Dialectical Resolution & Distillation of Truth\n\n");
    match &topic.dialectical_resolution {
        Some(res) if !res.trim().is_empty() => {
            doc.push_str(res.trim());
            doc.push_str("\n\n");
        }
        _ => {
            doc.push_str("_No dialectical resolution recorded._\n\n");
        }
    }

    doc.push_str("---\n*Generated by Book Engine Syntopicon Subsystem.*\n");
    doc
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::syntopicon_models::*;

    #[test]
    fn test_compile_dialectical_dossier_formatting() {
        let topic = SyntopicTopic {
            id: "test-topic".into(),
            title: "Division of Labor".into(),
            description: "Study of specialization.".into(),
            neutral_terms: vec![NeutralTerm {
                id: "term-1".into(),
                term: "Operational Specialization".into(),
                neutral_definition: "Granular division of labor.".into(),
                mappings: vec![TermMapping {
                    book_id: "book-a".into(),
                    author_variant: "Division of work".into(),
                    author_term_id: None,
                    citation: CrossBookCitation {
                        book_id: "book-a".into(),
                        chapter_file: "ch-01.md".into(),
                        anchor: "^p-001".into(),
                        quote: "Specialization increases dexterity.".into(),
                    },
                }],
            }],
            questions: vec![SyntopicQuestion {
                id: "q-1".into(),
                question: "Does division increase output?".into(),
                order: 1,
            }],
            controversies: vec![SyntopicControversy {
                id: "c-1".into(),
                question_id: "q-1".into(),
                title: "Output amplification".into(),
                perspectives: vec![SyntopicPerspective {
                    book_id: "book-a".into(),
                    stance: "Dramatically multiplies goods.".into(),
                    argument_ids: None,
                    citations: vec![CrossBookCitation {
                        book_id: "book-a".into(),
                        chapter_file: "ch-01.md".into(),
                        anchor: "^p-001".into(),
                        quote: "Specialization increases dexterity.".into(),
                    }],
                }],
            }],
            synthesis_notes: Some("The authors agree on productivity, but diverge on social consequences.".into()),
            dialectical_resolution: Some("Specialization creates systemic efficiency while requiring educational offsets.".into()),
            created_at: "2026-09-13T10:00:00Z".into(),
        };

        let report = compile_dialectical_dossier(&topic);

        assert!(report.contains("# Syntopical Reading Dossier: Division of Labor"));
        assert!(report.contains("Section 1: Neutral Vocabulary Translation Table (Rule 2)"));
        assert!(report.contains("Section 2: Universal Inquiries & Controversy Matrix (Rules 3 & 4)"));
        assert!(report.contains("Section 3: Dialectical Synthesis & Analysis of Discussion (Rule 5)"));
        assert!(report.contains("Specialization increases dexterity."));
        assert!(report.contains("^p-001"));
        assert!(report.contains("The authors agree on productivity"));
        assert!(report.contains("Specialization creates systemic efficiency"));
    }
}
