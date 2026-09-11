use std::path::Path;

pub struct RawCard {
    pub card_id: String,
    pub chapter_file: String,
    pub anchor: String,
    pub item_type: String,
    pub cloze: String,
    pub answer_key: String,
}

/// Parses a practice deck markdown section into a validated card, enforcing verbatim character substring check.
pub fn parse_card_section(section: &str, book_dir: &Path) -> Option<RawCard> {
    let trimmed = section.trim();
    if !trimmed.starts_with("card-") {
        return None;
    }

    let mut card_id = String::new();
    let mut chapter_id = String::new();
    let mut anchor = String::new();
    let mut cloze = String::new();
    let mut answer_key = String::new();
    let mut item_type = "cloze".to_string();

    let lines: Vec<&str> = trimmed.lines().collect();
    if let Some(first_line) = lines.first() {
        card_id = first_line.trim().to_string();
    }

    for line in &lines[1..] {
        let l = line.trim();
        if l.starts_with("- **Chapter:**") {
            chapter_id = l.trim_start_matches("- **Chapter:**").trim().to_string();
        } else if l.starts_with("- **Anchor:**") {
            anchor = l.trim_start_matches("- **Anchor:**").trim().to_string();
        } else if l.starts_with("- **Cloze:**") || l.starts_with("- **Prompt:**") {
            cloze = l.split(':').skip(1).collect::<Vec<_>>().join(":").trim().trim_start_matches('*').trim().to_string();
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

    // Programmatic Verbatim Validation against chapter Markdown
    let ch_path = book_dir.join(&chapter_file);
    if ch_path.exists() {
        if let Ok(ch_text) = std::fs::read_to_string(&ch_path) {
            let clean_ans = answer_key.replace("**", "").trim().to_string();
            let clean_text = ch_text.replace("**", "");
            if !clean_text.contains(&clean_ans) && !ch_text.contains(&answer_key) {
                eprintln!("Rejecting non-verbatim practice card {}: '{}' not found in {}", card_id, answer_key, chapter_file);
                return None;
            }
        }
    }

    Some(RawCard {
        card_id,
        chapter_file,
        anchor,
        item_type,
        cloze,
        answer_key,
    })
}
