"""Test suite for practice deck parsing, scenario drills, and audit grounding."""

from pathlib import Path
import importlib.util
import pytest


def get_audit_practice_module():
    skill_path = Path(".agent/skills/audit-practice.py")
    spec = importlib.util.spec_from_file_location("audit_practice", skill_path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_live_vault_practice_decks():
    """Verify that all live vault practice decks pass cloze and scenario verification."""
    mod = get_audit_practice_module()
    target_notes = sorted(Path("vault/notes").glob("*/practice-deck.md"))
    assert len(target_notes) > 0, "No practice decks found in live vault"

    for deck_path in target_notes:
        res = mod.audit_book_practice_deck(deck_path, Path("vault/books"))
        total, matches, mismatches, errors = res
        assert mismatches == 0, f"Deck {deck_path.name} failed with errors: {errors}"
        assert matches == total
        assert total > 0


def test_scenario_format_and_grounding_audit(tmp_path: Path):
    """Verify that scenario validation enforces anchor existence, option format, and verbatim rationale."""
    mod = get_audit_practice_module()

    # Setup mock book and chapter
    vault = tmp_path / "vault"
    books = vault / "books" / "b1"
    notes = vault / "notes" / "b1"
    books.mkdir(parents=True)
    notes.mkdir(parents=True)

    ch_text = (
        "# Consistency Models\n\n"
        "In distributed computing, linearizability is defined as a strong consistency guarantee "
        "where all operations appear to execute atomically at a specific point in time between "
        "their invocation and response. ^p-001\n\n"
        "Under network partitions, the CAP theorem states that a distributed data store can "
        "simultaneously provide at most two out of Consistency, Availability, and Partition tolerance. ^p-003\n"
    )
    (books / "ch-01.md").write_text(ch_text, encoding="utf-8")

    # 1. Valid scenario card
    valid_deck = (
        "### Scenario: sc-001\n"
        "<!-- citation: ch-01.md#^p-003 -->\n"
        "**Scenario:** A partition separates replicas from the coordinator.\n"
        "- [ ] (A) All replicas continue processing writes unconditionally.\n"
        "- [x] (B) The system must choose between consistency and availability.\n"
        "- [ ] (C) Eventual consistency guarantees zero data conflicts.\n"
        "- [ ] (D) Quorum consensus is bypassed.\n"
        '> **Rationale:** Under network partitions, "a distributed data store can simultaneously provide at most two out of Consistency, Availability, and Partition tolerance." (ch-01.md#^p-003)\n'
    )
    deck_path = notes / "practice-deck.md"
    deck_path.write_text(valid_deck, encoding="utf-8")

    res = mod.audit_book_practice_deck(deck_path, books.parent)
    total, matches, mismatches, errors = res
    assert total == 1
    assert matches == 1
    assert mismatches == 0
    assert res.scenario_count == 1

    # 2. Invalid: Anchor does not exist
    bad_anchor_deck = valid_deck.replace("^p-003", "^p-999")
    deck_path.write_text(bad_anchor_deck, encoding="utf-8")
    res = mod.audit_book_practice_deck(deck_path, books.parent)
    assert res.mismatches == 1
    assert any("Anchor '^p-999' not found" in err for err in res.errors)

    # 3. Invalid: Multiple [x] options (must have exactly 1)
    two_correct_deck = valid_deck.replace("- [ ] (A)", "- [x] (A)")
    deck_path.write_text(two_correct_deck, encoding="utf-8")
    res = mod.audit_book_practice_deck(deck_path, books.parent)
    assert res.mismatches == 1
    assert any("Format validation failed" in err for err in res.errors)

    # 4. Invalid: Zero [x] options
    no_correct_deck = valid_deck.replace("- [x] (B)", "- [ ] (B)")
    deck_path.write_text(no_correct_deck, encoding="utf-8")
    res = mod.audit_book_practice_deck(deck_path, books.parent)
    assert res.mismatches == 1
    assert any("Format validation failed" in err for err in res.errors)

    # 5. Invalid: Less than 2 [ ] distractors
    few_options_deck = (
        "### Scenario: sc-002\n"
        "<!-- citation: ch-01.md#^p-003 -->\n"
        "**Scenario:** A partition separates replicas.\n"
        "- [x] (A) Correct answer.\n"
        "- [ ] (B) Distractor.\n"
        '> **Rationale:** "a distributed data store can simultaneously provide at most two out of Consistency, Availability, and Partition tolerance."\n'
    )
    deck_path.write_text(few_options_deck, encoding="utf-8")
    res = mod.audit_book_practice_deck(deck_path, books.parent)
    assert res.mismatches == 1
    assert any("Format validation failed" in err for err in res.errors)

    # 6. Invalid: Rationale missing verbatim quote from anchor
    no_quote_deck = valid_deck.replace(
        '"a distributed data store can simultaneously provide at most two out of Consistency, Availability, and Partition tolerance."',
        '"totally hallucinated sentence with no correspondence to the text"',
    )
    deck_path.write_text(no_quote_deck, encoding="utf-8")
    res = mod.audit_book_practice_deck(deck_path, books.parent)
    assert res.mismatches == 1
    assert any("Rationale does not contain a verbatim quote" in err for err in res.errors)
