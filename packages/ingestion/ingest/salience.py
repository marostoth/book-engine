"""Autonomous salience scoring and deterministic Cloze deck generator.

Extracts top 5-8 high-signal sentences per chapter.
Strictly zero-hallucination and extractive: every answer key is verified as
an exact character substring of the source chapter text.
"""

from __future__ import annotations
import re
from typing import List, Optional, Tuple
from ingest.models import PracticeCard
from ingest.anchors import extract_anchors

# Definitional syntax patterns
DEFINITIONAL_REGEX = re.compile(
    r"\b(is defined as|refers to|means|is characterized by|consists of|is known as|"
    r"denotes|is considered to be|the primary purpose of|the fundamental principle of|"
    r"is essential for|plays a critical role in|represents the)\b",
    re.IGNORECASE
)

# Analytical / contrastive markers
ANALYTICAL_REGEX = re.compile(
    r"\b(consequently|therefore|furthermore|crucially|specifically|in particular|"
    r"in contrast|most importantly|the core mechanism|as a result)\b",
    re.IGNORECASE
)

# Bold markdown pattern
BOLD_REGEX = re.compile(r"\*\*([a-zA-Z0-9_\s'-]{2,50})\*\*")

# Sentence splitter (handles basic abbreviations)
SENTENCE_SPLIT_REGEX = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"])")
ABBREVIATIONS = ("e.g.", "i.e.", "dr.", "mr.", "mrs.", "prof.", "fig.", "vs.", "al.")


def split_sentences(text: str) -> List[str]:
    """Split paragraph text into individual sentences."""
    clean = re.sub(r"\s+", " ", text).strip()
    if not clean:
        return []
    raw_parts = SENTENCE_SPLIT_REGEX.split(clean)
    merged: List[str] = []
    for part in raw_parts:
        if merged and any(merged[-1].lower().endswith(abbr) for abbr in ABBREVIATIONS):
            merged[-1] = f"{merged[-1]} {part}"
        else:
            merged.append(part)
    return [p.strip() for p in merged if len(p.strip()) > 15]


def score_sentence(sentence: str, is_first: bool = False, is_last: bool = False) -> float:
    """Calculate deterministic salience score for a candidate sentence."""
    score = 0.0

    # Definitional weight
    if DEFINITIONAL_REGEX.search(sentence):
        score += 5.0

    # Emphasized / bold weight
    bold_matches = BOLD_REGEX.findall(sentence)
    if bold_matches:
        score += 4.0 * len(bold_matches)

    # Analytical / thesis weight
    if ANALYTICAL_REGEX.search(sentence):
        score += 2.0

    # Structural position weight
    if is_first:
        score += 1.5
    elif is_last:
        score += 1.0

    # Length preference: 40 - 220 chars
    length = len(sentence)
    if 40 <= length <= 220:
        score += 1.0
    elif length < 30 or length > 350:
        score -= 2.0

    # Penalize meta-text or figure references
    if re.search(r"\b(see figure|as shown in|table \d|chapter \d)\b", sentence, re.IGNORECASE):
        score -= 4.0

    return score


def extract_cloze_target(sentence: str) -> Optional[Tuple[str, str]]:
    """Deterministically find the best target phrase to mask for a Cloze item.

    Returns:
        (cloze_sentence, answer_key) or None
    """
    # 1. Highest priority: Bolded phrase in sentence
    bold_match = BOLD_REGEX.search(sentence)
    if bold_match:
        answer_key = bold_match.group(1).strip()
        # Ensure answer key is not trivially short
        if len(answer_key) >= 3:
            # Replace **phrase** with {{c1::phrase}}
            cloze = sentence.replace(f"**{answer_key}**", f"{{{{c1::{answer_key}}}}}")
            return cloze, answer_key

    # 2. Definitional pattern: "X is defined as Y" -> mask X
    def_match = re.search(
        r"^([A-Z][a-zA-Z0-9_\s'-]{2,40}?)\s+(?:is defined as|refers to|means|denotes|is characterized by|is considered)\b",
        sentence
    )
    if def_match:
        answer_key = def_match.group(1).strip()
        if len(answer_key) >= 3 and answer_key in sentence:
            cloze = sentence.replace(answer_key, f"{{{{c1::{answer_key}}}}}", 1)
            return cloze, answer_key

    # 3. Quoted term or capitalized domain phrase
    quoted_match = re.search(r'"([a-zA-Z0-9_\s\'-]{3,40})"', sentence)
    if quoted_match:
        answer_key = quoted_match.group(1).strip()
        if answer_key in sentence:
            cloze = sentence.replace(f'"{answer_key}"', f'"{{{{c1::{answer_key}}}}}"', 1)
            return cloze, answer_key

    # 4. Pattern: "The fundamental principle of X is..." -> mask X
    key_phrase_match = re.search(
        r"\b(?:purpose of|principle of|concept of|role of)\s+([a-zA-Z0-9_\s'-]{3,35})\s+(?:is|are)\b",
        sentence,
        re.IGNORECASE
    )
    if key_phrase_match:
        answer_key = key_phrase_match.group(1).strip()
        if answer_key in sentence:
            cloze = sentence.replace(answer_key, f"{{{{c1::{answer_key}}}}}", 1)
            return cloze, answer_key

    return None


def generate_chapter_practice_cards(
    chapter_id: str,
    chapter_markdown: str,
    min_items: int = 5,
    max_items: int = 8
) -> List[PracticeCard]:
    """Autonomous salience scoring and deterministic Cloze generation for a single chapter.

    Every answer key is strictly validated as an exact character substring
    of the source chapter text.
    """
    anchored_paragraphs = extract_anchors(chapter_markdown)
    candidates: List[Tuple[float, str, str, str, str]] = []  # (score, cloze, answer, source, anchor)
    seen_answers = set()

    for anchor_id, para_text in anchored_paragraphs:
        # Skip footnote definitions
        if para_text.startswith("[^"):
            continue

        sentences = split_sentences(para_text)
        for i, sentence in enumerate(sentences):
            is_first = (i == 0)
            is_last = (i == len(sentences) - 1)
            score = score_sentence(sentence, is_first, is_last)

            cloze_data = extract_cloze_target(sentence)
            if not cloze_data:
                continue

            cloze_text, answer_key = cloze_data

            # Programmatic Verbatim Validation:
            # 1. Answer key must be exact substring of source sentence (ignoring bold markers)
            clean_sentence = sentence.replace("**", "")
            if answer_key not in clean_sentence:
                continue
            # 2. Answer key must exist in chapter markdown
            if answer_key not in chapter_markdown:
                continue
            # 3. Deduplicate answers
            answer_lower = answer_key.lower()
            if answer_lower in seen_answers:
                continue

            candidates.append((score, cloze_text, answer_key, sentence, anchor_id))
            seen_answers.add(answer_lower)

    # Sort descending by salience score
    candidates.sort(key=lambda c: c[0], reverse=True)

    # Select top items (up to max_items)
    selected = candidates[:max_items]

    cards: List[PracticeCard] = []
    for idx, (score, cloze_text, answer_key, sentence, anchor_id) in enumerate(selected, start=1):
        card = PracticeCard(
            card_id=f"card-{chapter_id}-{idx:03d}",
            chapter_id=chapter_id,
            anchor_id=anchor_id,
            cloze_text=cloze_text,
            answer_key=answer_key,
            exact_source=sentence,
            score=round(score, 2)
        )
        cards.append(card)

    return cards


def format_practice_deck_markdown(book_title: str, all_cards: List[PracticeCard]) -> str:
    """Format practice cards into vault/notes/<book-id>/practice-deck.md."""
    lines = [
        f"# Practice Deck: {book_title}",
        "",
        "> Deterministic, extractive practice cards programmatically verified against chapter source text.",
        ""
    ]

    # Group cards by chapter
    cards_by_ch: dict[str, List[PracticeCard]] = {}
    for card in all_cards:
        cards_by_ch.setdefault(card.chapter_id, []).append(card)

    for ch_id, cards in cards_by_ch.items():
        lines.append(f"## Chapter: {ch_id}")
        lines.append("")
        for card in cards:
            lines.append(f"### {card.card_id}")
            lines.append(f"- **Chapter:** {card.chapter_id}")
            lines.append(f"- **Anchor:** {card.anchor_id}")
            lines.append(f"- **Cloze:** {card.cloze_text}")
            lines.append(f"- **Answer Key:** `{card.answer_key}`")
            lines.append(f"- **Exact Source:** {card.exact_source}")
            lines.append("")

    return "\n".join(lines)
