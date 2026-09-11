"""Unit tests for autonomous salience scoring and deterministic Cloze generation."""

from ingest.salience import (
    score_sentence,
    extract_cloze_target,
    generate_chapter_practice_cards,
    format_practice_deck_markdown
)
from ingest.anchors import inject_paragraph_anchors


def test_score_sentence_definitional_and_bold():
    plain = "This is an ordinary sentence discussing trivial details of the system."
    high_signal = "In distributed computing, **linearizability** is defined as a strong consistency guarantee."

    score_plain = score_sentence(plain)
    score_high = score_sentence(high_signal)

    assert score_high > score_plain
    # Definitional (+5) and bold (+4) yields high score
    assert score_high >= 9.0


def test_extract_cloze_target():
    sentence = "The **vector clock** is essential for determining partial order."
    result = extract_cloze_target(sentence)

    assert result is not None
    cloze, answer = result
    assert answer == "vector clock"
    assert "{{c1::vector clock}}" in cloze
    assert answer in sentence.replace("**", "")


def test_zero_hallucination_verbatim_standard():
    chapter_md = (
        "# Chapter 1: Consistency\n\n"
        "In distributed computing, **linearizability** is defined as a strong consistency guarantee. ^p-001\n\n"
        "The primary purpose of **vector clocks** is determining the partial ordering of events. ^p-002\n\n"
        "Under network partitions, the **CAP theorem** is defined as the trade-off between consistency and availability. ^p-003\n\n"
        "The fundamental principle of **eventual consistency** is that all replicas converge over time. ^p-004\n\n"
        "A **quorums system** refers to a subset of nodes whose intersection guarantees safety. ^p-005\n\n"
        "**Byzantine fault tolerance** represents the capability to defend against arbitrary node failures. ^p-006\n\n"
        "[^1]: Citation text for linearizability. ^p-007"
    )

    cards = generate_chapter_practice_cards("ch-01", chapter_md, min_items=5, max_items=8)

    assert len(cards) >= 5
    for card in cards:
        # 1. Answer key must be an exact substring of the source chapter text
        assert card.answer_key in chapter_md, f"Hallucination detected! '{card.answer_key}' not in chapter text"
        # 2. Cloze text must contain {{c1::...}}
        assert f"{{{{c1::{card.answer_key}}}}}" in card.cloze_text
        # 3. Anchor must be present
        assert card.anchor_id.startswith("^p-")


def test_format_practice_deck_markdown():
    chapter_md = (
        "In distributed systems, **linearizability** is defined as real-time consistency. ^p-001\n\n"
        "The **CAP theorem** is defined as the fundamental trade-off of distributed storage. ^p-002"
    )
    cards = generate_chapter_practice_cards("ch-01", chapter_md, min_items=1, max_items=2)
    deck_md = format_practice_deck_markdown("Test Book", cards)

    assert "# Practice Deck: Test Book" in deck_md
    assert "## Chapter: ch-01" in deck_md
    assert "- **Cloze:**" in deck_md
    assert "- **Answer Key:**" in deck_md
