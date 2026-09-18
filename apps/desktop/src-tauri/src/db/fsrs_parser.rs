use super::models::{ScenarioOption, ScenarioPayload};
use crate::vault::text_file::read_text_file;
use crate::vault::AnchoredCitation;
use std::path::Path;

pub struct RawCard {
    pub card_id: String,
    pub chapter_file: String,
    pub anchor: String,
    pub item_type: String,
    pub cloze: String,
    pub answer_key: String,
    pub card_type: String,
    pub scenario_payload: Option<ScenarioPayload>,
}

fn normalize_for_match(s: &str) -> String {
    s.replace(['*', '`'], "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Parses a practice deck markdown section into a validated card (cloze or scenario).
pub fn parse_card_section(section: &str, book_dir: &Path) -> Option<RawCard> {
    let trimmed = section.trim();
    if trimmed.starts_with("Scenario:") || trimmed.starts_with("scenario-") || trimmed.starts_with("sc-") {
        parse_scenario_section(trimmed, book_dir)
    } else if trimmed.starts_with("card-") || trimmed.starts_with("Card:") {
        parse_cloze_section(trimmed, book_dir)
    } else {
        None
    }
}

fn parse_scenario_section(trimmed: &str, book_dir: &Path) -> Option<RawCard> {
    let lines: Vec<&str> = trimmed.lines().collect();
    let first_line = lines.first()?.trim();
    let card_id = if let Some(rest) = first_line.strip_prefix("Scenario:") {
        rest.trim().to_string()
    } else {
        first_line.to_string()
    };

    let mut chapter_file = String::new();
    let mut anchor = String::new();
    let mut scenario_stem = String::new();
    let mut options: Vec<ScenarioOption> = Vec::new();
    let mut rationale_lines: Vec<String> = Vec::new();
    let mut in_scenario = false;

    for line in &lines[1..] {
        let l = line.trim();
        if let Some(cit_start) = l.strip_prefix("<!--").and_then(|s| s.find("citation:")) {
            let cit_part = l[cit_start + 9..].trim().trim_end_matches("-->").trim();
            let parts: Vec<&str> = cit_part.split('#').collect();
            if let Some(ch) = parts.first() {
                chapter_file = ch.trim().to_string();
            }
            if parts.len() > 1 {
                anchor = parts[1].trim().to_string();
            }
        } else if let Some(rest) = l.strip_prefix("- **Chapter:**") {
            chapter_file = rest.trim().to_string();
        } else if let Some(rest) = l.strip_prefix("- **Anchor:**") {
            anchor = rest.trim().to_string();
        } else if let Some(rest) = l.strip_prefix("**Scenario:**") {
            scenario_stem = rest.trim().to_string();
            in_scenario = true;
        } else if l.starts_with("- [ ]") || l.starts_with("- [x]") || l.starts_with("- [X]") {
            in_scenario = false;
            let is_correct = l.starts_with("- [x]") || l.starts_with("- [X]");
            let rest = l[5..].trim();
            let (key, text) = if rest.starts_with('(') && rest.len() > 3 && rest.chars().nth(2) == Some(')') {
                (
                    rest.chars().nth(1).unwrap_or('A').to_string(),
                    rest[3..].trim().to_string(),
                )
            } else if rest.len() > 2 && rest.chars().nth(1) == Some('.') {
                (
                    rest.chars().next().unwrap_or('A').to_string(),
                    rest[2..].trim().to_string(),
                )
            } else {
                let idx = (b'A' + options.len() as u8) as char;
                (idx.to_string(), rest.to_string())
            };
            options.push(ScenarioOption { key, text, is_correct });
        } else if let Some(rest) = l.strip_prefix("> **Rationale:**") {
            in_scenario = false;
            rationale_lines.push(rest.trim().to_string());
        } else if l.starts_with('>') && !rationale_lines.is_empty() {
            let r = l.trim_start_matches('>').trim().to_string();
            if !r.is_empty() {
                rationale_lines.push(r);
            }
        } else if in_scenario && !l.is_empty() && !l.starts_with('#') {
            if !scenario_stem.is_empty() {
                scenario_stem.push('\n');
            }
            scenario_stem.push_str(l);
        }
    }

    if card_id.is_empty() || chapter_file.is_empty() || anchor.is_empty() || scenario_stem.is_empty() {
        return None;
    }

    if !chapter_file.ends_with(".md") {
        chapter_file = format!("{}.md", chapter_file);
    }

    // Format check: exactly 1 [x] and at least 2 [ ]
    let correct_count = options.iter().filter(|o| o.is_correct).count();
    let incorrect_count = options.iter().filter(|o| !o.is_correct).count();
    if correct_count != 1 || incorrect_count < 2 {
        eprintln!(
            "Rejecting scenario {}: must have exactly 1 [x] and at least 2 [ ]",
            card_id
        );
        return None;
    }

    let rationale = rationale_lines.join(" ");
    let ch_path = book_dir.join(&chapter_file);
    if !ch_path.exists() {
        eprintln!("Rejecting scenario {}: chapter {} not found", card_id, chapter_file);
        return None;
    }

    // With `\n` line endings only, so that a blank line ends the paragraph of the anchor (IN-06)
    let ch_text = read_text_file(&ch_path).ok()?;
    if !ch_text.contains(&anchor) {
        eprintln!(
            "Rejecting scenario {}: anchor {} not found in {}",
            card_id, anchor, chapter_file
        );
        return None;
    }

    // Verbatim quote grounding against paragraph containing anchor
    let anchor_paragraph = ch_text.split("\n\n").find(|p| p.contains(&anchor)).unwrap_or_default();

    let norm_para = normalize_for_match(anchor_paragraph);
    let norm_rationale = normalize_for_match(&rationale);

    // Extract any quote in quotation marks from rationale
    let mut has_verbatim_quote = false;
    let mut quote_str = String::new();

    if let Some(start_q) = rationale.find('"') {
        if let Some(end_q) = rationale[start_q + 1..].find('"') {
            let q = &rationale[start_q + 1..start_q + 1 + end_q];
            let norm_q = normalize_for_match(q);
            if !norm_q.is_empty() && norm_para.contains(&norm_q) {
                has_verbatim_quote = true;
                quote_str = q.to_string();
            }
        }
    }

    if !has_verbatim_quote {
        // Fallback: check if rationale shares a substantive phrase (>= 20 chars) with anchor paragraph
        let words: Vec<&str> = norm_rationale.split_whitespace().collect();
        for window_size in (4..=words.len().min(12)).rev() {
            for i in 0..=words.len() - window_size {
                let phrase = words[i..i + window_size].join(" ");
                if phrase.len() >= 20 && norm_para.contains(&phrase) {
                    has_verbatim_quote = true;
                    quote_str = phrase;
                    break;
                }
            }
            if has_verbatim_quote {
                break;
            }
        }
    }

    if !has_verbatim_quote {
        eprintln!(
            "Rejecting scenario {}: rationale quote not found verbatim in anchor {}",
            card_id, anchor
        );
        return None;
    }

    let correct_option = options.iter().find(|o| o.is_correct)?;
    let answer_key = format!("({}) {}", correct_option.key, correct_option.text);

    let payload = ScenarioPayload {
        scenario: scenario_stem.clone(),
        options,
        citation: AnchoredCitation {
            chapter_file: chapter_file.clone(),
            anchor: anchor.clone(),
            quote: quote_str,
        },
        rationale,
    };

    Some(RawCard {
        card_id,
        chapter_file,
        anchor,
        item_type: "scenario".to_string(),
        cloze: scenario_stem,
        answer_key,
        card_type: "scenario".to_string(),
        scenario_payload: Some(payload),
    })
}

fn parse_cloze_section(trimmed: &str, book_dir: &Path) -> Option<RawCard> {
    let mut card_id = String::new();
    let mut chapter_id = String::new();
    let mut anchor = String::new();
    let mut cloze = String::new();
    let mut answer_key = String::new();
    let mut item_type = "cloze".to_string();

    let lines: Vec<&str> = trimmed.lines().collect();
    if let Some(first_line) = lines.first() {
        let fl = first_line.trim();
        card_id = fl.strip_prefix("Card:").unwrap_or(fl).trim().to_string();
    }

    for line in &lines[1..] {
        let l = line.trim();
        if l.starts_with("<!--") && l.contains("citation:") {
            if let Some(cit_start) = l.find("citation:") {
                let cit_part = l[cit_start + 9..].trim().trim_end_matches("-->").trim();
                let parts: Vec<&str> = cit_part.split('#').collect();
                if let Some(ch) = parts.first() {
                    chapter_id = ch.trim().to_string();
                }
                if parts.len() > 1 {
                    anchor = parts[1].trim().to_string();
                }
            }
        } else if l.starts_with("- **Chapter:**") {
            chapter_id = l.trim_start_matches("- **Chapter:**").trim().to_string();
        } else if l.starts_with("- **Anchor:**") {
            anchor = l.trim_start_matches("- **Anchor:**").trim().to_string();
        } else if l.starts_with("- **Cloze:**") || l.starts_with("- **Prompt:**") {
            cloze = l
                .split(':')
                .skip(1)
                .collect::<Vec<_>>()
                .join(":")
                .trim()
                .trim_start_matches('*')
                .trim()
                .to_string();
        } else if l.starts_with("- **Answer Key:**") {
            let ans = l.trim_start_matches("- **Answer Key:**").trim();
            answer_key = ans.trim_matches('`').to_string();
        } else if l.starts_with("- **Type:**") {
            let t = l.trim_start_matches("- **Type:**").trim().to_lowercase();
            if t == "scramble" {
                item_type = "scramble".to_string();
            }
        } else if l.starts_with("- **Scramble:**") {
            cloze = l.trim_start_matches("- **Scramble:**").trim().to_string();
            item_type = "scramble".to_string();
        }
    }

    if card_id.is_empty() || chapter_id.is_empty() {
        return None;
    }

    let chapter_file = if chapter_id.ends_with(".md") {
        chapter_id
    } else {
        format!("{}.md", chapter_id)
    };

    if answer_key.is_empty() {
        if let Some(start) = cloze.find("{{c1::") {
            if let Some(end) = cloze[start + 6..].find("}}") {
                answer_key = cloze[start + 6..start + 6 + end].to_string();
            }
        } else if let Some(start) = cloze.find("==") {
            if let Some(end) = cloze[start + 2..].find("==") {
                answer_key = cloze[start + 2..start + 2 + end].to_string();
            }
        }
    }

    if answer_key.is_empty() {
        return None;
    }

    // Programmatic Verbatim Validation against chapter Markdown. A card whose chapter is missing or cannot be read
    // cannot be checked, so it is left out, as a scenario card is. It used to be kept without the check (LC-02).
    let ch_path = book_dir.join(&chapter_file);
    let ch_text = match std::fs::read_to_string(&ch_path) {
        Ok(ch_text) => ch_text,
        Err(e) => {
            eprintln!(
                "Rejecting practice card {}: chapter {} could not be read ({})",
                card_id, chapter_file, e
            );
            return None;
        }
    };
    let clean_ans = answer_key.replace("**", "").trim().to_string();
    let clean_text = ch_text.replace("**", "");
    if !clean_text.contains(&clean_ans) && !ch_text.contains(&answer_key) {
        eprintln!(
            "Rejecting non-verbatim practice card {}: '{}' not found in {}",
            card_id, answer_key, chapter_file
        );
        return None;
    }

    Some(RawCard {
        card_id,
        chapter_file,
        anchor,
        item_type,
        cloze,
        answer_key,
        card_type: "cloze".to_string(),
        scenario_payload: None,
    })
}
