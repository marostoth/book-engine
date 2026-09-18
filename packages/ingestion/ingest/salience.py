"""Autonomous salience scoring and the practice deck writer.

Scores sentences for the cloze cards of `ingest/cloze.py` and the quiz cards of `ingest/scenarios.py`, and writes both
kinds of card into `practice-deck.md`. Strictly zero-hallucination and extractive: every answer key is verified as
an exact character substring of the source chapter text.
"""

from __future__ import annotations

import re

from ingest.models import PracticeCard, ScenarioCard

# Definitional syntax patterns
DEFINITIONAL_REGEX = re.compile(
    r"\b(is defined as|refers to|means|is characterized by|consists of|is known as|"
    r"denotes|is considered to be|the primary purpose of|the fundamental principle of|"
    r"is essential for|plays a critical role in|represents the)\b",
    re.IGNORECASE,
)

# Analytical / contrastive markers
ANALYTICAL_REGEX = re.compile(
    r"\b(consequently|therefore|furthermore|crucially|specifically|in particular|"
    r"in contrast|most importantly|the core mechanism|as a result)\b",
    re.IGNORECASE,
)

# Bold markdown pattern
BOLD_REGEX = re.compile(r"\*\*([^*]{2,50})\*\*")

# Sentence splitter (handles basic abbreviations)
SENTENCE_SPLIT_REGEX = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"])")
ABBREVIATIONS = ("e.g.", "i.e.", "dr.", "mr.", "mrs.", "prof.", "fig.", "vs.", "al.")


def split_sentences(text: str) -> list[str]:
    """Split paragraph text into individual sentences."""
    clean = re.sub(r"\s+", " ", text).strip()
    if not clean:
        return []
    raw_splits = SENTENCE_SPLIT_REGEX.split(clean)
    merged: list[str] = []
    for s in raw_splits:
        s_strip = s.strip()
        if not s_strip:
            continue
        if merged and any(merged[-1].lower().endswith(abbr) for abbr in ABBREVIATIONS):
            merged[-1] = f"{merged[-1]} {s_strip}"
        else:
            merged.append(s_strip)
    return merged


def score_sentence(sentence: str, is_first_sentence: bool = False, is_last_sentence: bool = False) -> float:
    """Deterministic salience scoring for a sentence."""
    score = 0.0

    # Definitional markers (+5.0)
    if DEFINITIONAL_REGEX.search(sentence):
        score += 5.0

    # Analytical / contrastive markers (+2.0)
    if ANALYTICAL_REGEX.search(sentence):
        score += 2.0

    # Key terms in bold (+4.0 per match)
    bold_matches = BOLD_REGEX.findall(sentence)
    if bold_matches:
        score += 4.0 * len(bold_matches)

    # Paragraph boundary heuristics
    if is_first_sentence:
        score += 1.5
    elif is_last_sentence:
        score += 1.0

    # Penalize sentences that are too short (< 40 chars) or too long (> 250 chars)
    length = len(sentence)
    if length < 40:
        score -= 2.0
    elif length > 250:
        score -= 1.0

    return score


# Re-export the cloze and scenario generators from their modules. They sit here, below the functions, because
# `ingest.cloze` reads names of this module, and `__all__` says they belong to what this module offers, so a check
# that looks for imports nobody uses does not take them away (TL-05).
from ingest.cloze import extract_cloze_target, generate_chapter_practice_cards  # noqa: E402
from ingest.scenarios import generate_chapter_scenario_cards  # noqa: E402

__all__ = [
    "ABBREVIATIONS",
    "SENTENCE_SPLIT_REGEX",
    "extract_cloze_target",
    "format_practice_deck_markdown",
    "generate_chapter_practice_cards",
    "generate_chapter_scenario_cards",
    "score_sentence",
    "split_sentences",
]


def format_practice_deck_markdown(
    book_title: str,
    all_cards: list[PracticeCard],
    all_scenarios: list[ScenarioCard] | None = None,
) -> str:
    """Format practice cards into vault/notes/<book-id>/practice-deck.md."""
    lines = [
        f"# Practice Deck: {book_title}",
        "",
        "> Deterministic, extractive practice cards programmatically verified against chapter source text.",
        "",
    ]

    cards_by_ch: dict[str, list[PracticeCard]] = {}
    for card in all_cards:
        cards_by_ch.setdefault(card.chapter_id, []).append(card)

    scenarios_by_ch: dict[str, list[ScenarioCard]] = {}
    if all_scenarios:
        for sc in all_scenarios:
            scenarios_by_ch.setdefault(sc.chapter_id, []).append(sc)

    all_ch_ids = sorted(
        set(list(cards_by_ch.keys()) + list(scenarios_by_ch.keys())),
        key=lambda x: int(m.group(0)) if (m := re.search(r"\d+", x)) else x,
    )

    for ch_id in all_ch_ids:
        lines.append(f"## Chapter: {ch_id}")
        lines.append("")
        for card in cards_by_ch.get(ch_id, []):
            lines.append(f"### {card.card_id}")
            lines.append(f"- **Chapter:** {card.chapter_id}")
            lines.append(f"- **Anchor:** {card.anchor_id}")
            lines.append(f"- **Cloze:** {card.cloze_text}")
            lines.append(f"- **Answer Key:** `{card.answer_key}`")
            lines.append(f"- **Exact Source:** {card.exact_source}")
            lines.append("")

        for sc in scenarios_by_ch.get(ch_id, []):
            lines.append(f"### Scenario: {sc.card_id}")
            lines.append(f"- **Chapter:** {sc.chapter_id}")
            lines.append(f"- **Anchor:** {sc.anchor_id}")
            lines.append(f"**Scenario:** {sc.scenario}")
            for opt in sc.options:
                mark = "x" if opt.is_correct else " "
                lines.append(f"- [{mark}] ({opt.key}) {opt.text}")
            lines.append(f"> **Rationale:** {sc.rationale}")
            lines.append("")

    return "\n".join(lines)
