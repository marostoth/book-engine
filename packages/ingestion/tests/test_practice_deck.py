"""Test suite for practice deck parsing, scenario drills, and audit grounding."""

from pathlib import Path

from conftest import load_skill


def get_audit_practice_module():
    """The audit script, found by an anchored path, not by the folder pytest was started in (TL-02)."""
    return load_skill("audit-practice.py")


def test_every_practice_deck_of_the_vault_of_the_tests(vault_of_the_tests: Path):
    """Every card of every deck of a whole vault that this test run built says what its chapter says (TL-02).

    It used to read the vault beside the repository and assert that it held at least one deck. A fresh clone
    holds none, so the test did not skip there: it failed on `0 > 0`.
    """
    mod = get_audit_practice_module()
    decks = sorted((vault_of_the_tests / "notes").glob("*/practice-deck.md"))
    assert len(decks) == 2, f"The vault of the tests has {len(decks)} practice decks, and it should have two"

    for deck_path in decks:
        total, matches, mismatches, errors = mod.audit_book_practice_deck(deck_path, vault_of_the_tests / "books")
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
        "Replicas exchange heartbeat messages to detect failed peers. ^p-002\n\n"
        "A partition separates replicas from the coordinator. "
        "Under network partitions, the CAP theorem states that a distributed data store can "
        "simultaneously provide at most two out of Consistency, Availability, and Partition tolerance. ^p-003\n\n"
        "Quorum reads contact a majority of replicas before they answer a client. ^p-004\n"
    )
    (books / "ch-01.md").write_text(ch_text, encoding="utf-8")

    # 1. Valid scenario card: it asks which sentence comes right after its passage, and every option is chapter text (LE-06)
    valid_deck = (
        "### Scenario: sc-001\n"
        "<!-- citation: ch-01.md#^p-003 -->\n"
        "**Scenario:** Which sentence comes right after this passage in the book?\n"
        '"A partition separates replicas from the coordinator."\n'
        "- [ ] (A) Replicas exchange heartbeat messages to detect failed peers.\n"
        "- [x] (B) Under network partitions, the CAP theorem states that a distributed data store can "
        "simultaneously provide at most two out of Consistency, Availability, and Partition tolerance.\n"
        "- [ ] (C) Quorum reads contact a majority of replicas before they answer a client.\n"
        "- [ ] (D) In distributed computing, linearizability is defined as a strong consistency guarantee "
        "where all operations appear to execute atomically at a specific point in time between "
        "their invocation and response.\n"
        '> **Rationale:** Under network partitions, "a distributed data store can simultaneously provide at most two out of Consistency, Availability, and Partition tolerance." (ch-01.md#^p-003)\n'
    )
    deck_path = notes / "practice-deck.md"
    deck_path.write_text(valid_deck, encoding="utf-8")

    res = mod.audit_book_practice_deck(deck_path, books.parent)
    total, matches, mismatches, _errors = res
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
