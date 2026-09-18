"""Unit tests for autonomous salience scoring and deterministic Cloze generation."""

from ingest.salience import (
    extract_cloze_target,
    format_practice_deck_markdown,
    generate_chapter_practice_cards,
    generate_chapter_scenario_cards,
    score_sentence,
)


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


def test_zero_hallucination_scenario_standard():
    chapter_md = (
        "# Chapter 1: Consistency\n\n"
        "In distributed computing, linearizability is defined as a strong consistency guarantee. "
        "Every operation appears to take effect at a single point in time. ^p-001\n\n"
        "The primary purpose of vector clocks is determining the partial ordering of events. "
        "Each node keeps a counter for every other node in the system. ^p-002\n\n"
        "Under network partitions, the CAP theorem establishes the trade-off between consistency and availability. "
        "A partitioned system must therefore refuse some requests or accept stale reads. ^p-003\n\n"
        "The fundamental principle of eventual consistency requires that all replicas converge over time. "
        "Replicas that stop receiving writes reach the same state after enough exchanges. ^p-004\n\n"
        "A quorums system refers to a subset of nodes whose intersection guarantees safety. "
        "Any two quorums share at least one node that has seen the latest write. ^p-005\n\n"
        "Byzantine fault tolerance represents the capability to defend against arbitrary node failures. "
        "Such systems need more than three times as many nodes as the faults they tolerate. ^p-006\n"
    )

    scenarios = generate_chapter_scenario_cards(chapter_md, "ch-01", max_items=3)

    assert len(scenarios) >= 1
    for sc in scenarios:
        assert sc.card_id.startswith("sc-ch-01-")
        assert sc.chapter_id == "ch-01"
        assert sc.anchor_id.startswith("^p-")
        assert len(sc.options) == 4

        # Correct option must exist and be an exact substring of the source chapter text
        correct_opts = [opt for opt in sc.options if opt.is_correct]
        assert len(correct_opts) == 1
        correct_text = correct_opts[0].text
        assert correct_text in chapter_md, f"Correct option '{correct_text}' not in source text!"

        # Distractor options must also be exact verbatim extracts
        for opt in sc.options:
            assert opt.text in chapter_md, f"Option '{opt.text}' is not an exact verbatim extract!"

        # Rationale must match the audit-practice format
        assert sc.rationale.startswith('Right after this passage, the book says: "')
        quote = sc.rationale[len('Right after this passage, the book says: "') : -1]
        assert quote == correct_text
        assert quote in chapter_md


def test_format_practice_deck_with_scenarios():
    chapter_md = (
        "In distributed computing, **linearizability** is defined as a strong consistency guarantee. "
        "Every operation appears to take effect at a single point in time. ^p-001\n\n"
        "The primary purpose of **vector clocks** is determining the partial ordering of events. "
        "Each node keeps a counter for every other node in the system. ^p-002\n\n"
        "Under network partitions, the **CAP theorem** establishes the trade-off between consistency and availability. "
        "A partitioned system must therefore refuse some requests or accept stale reads. ^p-003\n\n"
        "The fundamental principle of eventual consistency requires that all replicas converge over time. "
        "Replicas that stop receiving writes reach the same state after enough exchanges. ^p-004\n\n"
        "A quorums system refers to a subset of nodes whose intersection guarantees safety. "
        "Any two quorums share at least one node that has seen the latest write. ^p-005\n"
    )
    clozes = generate_chapter_practice_cards("ch-01", chapter_md, min_items=1, max_items=2)
    scenarios = generate_chapter_scenario_cards(chapter_md, "ch-01", max_items=2)

    deck_md = format_practice_deck_markdown("Test Book", clozes, scenarios)

    assert "### card-ch-01-" in deck_md
    assert "### Scenario: sc-ch-01-" in deck_md
    assert "> **Rationale:**" in deck_md


def test_contextual_scenario_premise_and_narrative_filtering():
    chapter_md = (
        "# Chapter 1: Introduction\n\n"
        "One morning, Jim got up at 6:00, as he always did, and went to his study. "
        "He sat and watched his quote terminal for a moment. ^p-001\n\n"
        "To reach the fourth level and become proficient, the learner must master the foundational rules. "
        "The written work becomes an intuitive part of the mind. "
        "Therefore, if the student is proficient, they will express emotion naturally in performance. ^p-002\n\n"
        "Linearizability guarantees real-time consistency across all distributed replicas. ^p-003\n\n"
        "Eventual consistency requires that nodes converge over sufficient time intervals. ^p-004\n\n"
        "Fault tolerance represents the capability to defend against arbitrary node crash failures. ^p-005\n\n"
        "Partition tolerance keeps the system working when messages between nodes are lost. ^p-006\n"
    )

    scenarios = generate_chapter_scenario_cards(chapter_md, "ch-01", max_items=1)

    assert len(scenarios) == 1
    sc = scenarios[0]
    assert sc.anchor_id == "^p-002"
    assert sc.scenario.startswith("Which sentence comes right after this passage in the book?\n")
    assert "To reach the fourth level and become proficient" in sc.scenario
    assert "Jim got up at 6:00" not in sc.scenario

    correct_opts = [opt for opt in sc.options if opt.is_correct]
    assert len(correct_opts) == 1
    assert "Therefore, if the student is proficient" in correct_opts[0].text

    # Narrative sentence from p-001 must NOT be used as a distractor
    for opt in sc.options:
        assert "Jim got up" not in opt.text
        assert opt.text in chapter_md
