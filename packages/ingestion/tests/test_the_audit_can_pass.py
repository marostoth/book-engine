"""The health audit can pass on a vault whose owner took books out and has not yet written every kind of note (TL-15).

Five of its twelve checks failed on every run, and not one of them for a fault in the code. Three books left the vault
on 2026-09-17 by the owner's choice, and the ledger and a topic still named them. The analytical check demanded terms,
arguments, critiques and inquiries before it would pass, and the vault held none. A check that always fails is a check
nobody reads, so each of them now tells the owner's choice and an empty page apart from a fault, and still fails on the
fault.

Every test here builds its own little vault, so none of them needs a book of yours.
"""

import json
from pathlib import Path
from types import ModuleType

from conftest import load_skill
from ingest.ledger import SET_ASIDE


def system() -> ModuleType:
    return load_skill("audit-system.py")


# ---------------------------------------------------------------------------
# 1. The ledger: a book the owner set aside
# ---------------------------------------------------------------------------


def a_vault_with_a_book_that_left(root: Path, marked: bool, folder_left: bool = True) -> ModuleType:
    """A vault holding the book "kept", and a ledger that also names the book "left". Gives the audit, pointed at it."""
    vault = root / "vault"
    processed = root / "inbox" / "processed"
    processed.mkdir(parents=True)
    books = ["kept"] if folder_left else ["kept", "left"]
    for book_id in books:
        (vault / "books" / book_id).mkdir(parents=True)
        (vault / "books" / book_id / "_meta.json").write_text(
            json.dumps({"total_chapters": 1, "total_words": 5}), encoding="utf-8"
        )
    lines = []
    for book_id in ("kept", "left"):
        (processed / f"{book_id}.epub").write_bytes(book_id.encode())
        line = {"book_id": book_id, "filename": f"{book_id}.epub", "total_chapters": 1, "total_words": 5}
        if book_id == "left" and marked:
            line[SET_ASIDE] = "2026-09-17"
        lines.append(line)
    (vault / "_ledger.json").write_text(json.dumps(lines, indent=2), encoding="utf-8")

    mod = system()
    mod.VAULT_DIR = vault
    mod.BOOKS_DIR = vault / "books"
    mod.LEDGER_PATH = vault / "_ledger.json"
    mod.INBOX_PROCESSED_DIR = processed
    return mod


def test_a_book_the_owner_set_aside_is_not_a_book_the_vault_lost(tmp_path: Path):
    mod = a_vault_with_a_book_that_left(tmp_path, marked=True)

    result = mod.check_ledger_and_vault_parity()

    assert result.passed is True, result.errors
    assert "1 books, 1 set aside" in result.metric, result.metric


def test_a_book_that_left_with_no_mark_still_fails_the_check(tmp_path: Path):
    """The control: the check exists to catch a book the vault lost, and the mark must not blind it to one."""
    mod = a_vault_with_a_book_that_left(tmp_path, marked=False)

    result = mod.check_ledger_and_vault_parity()

    assert result.passed is False
    assert any("'left'" in error and "does not exist" in error for error in result.errors), result.errors


def test_a_book_marked_set_aside_that_is_still_in_the_vault_fails(tmp_path: Path):
    """A mark that says the book left, beside the book, is a ledger that is wrong about the vault."""
    mod = a_vault_with_a_book_that_left(tmp_path, marked=True, folder_left=False)

    result = mod.check_ledger_and_vault_parity()

    assert result.passed is False
    assert any("set aside on 2026-09-17" in error for error in result.errors), result.errors


# ---------------------------------------------------------------------------
# 9 and 10. The reader's own notes: nothing written yet
# ---------------------------------------------------------------------------


def a_book_with_notes(root: Path, analytical: dict | None) -> Path:
    vault = root / "vault"
    (vault / "books" / "b1").mkdir(parents=True)
    (vault / "books" / "b1" / "ch-01.md").write_text("# One\n\nA paragraph. ^p-001\n", encoding="utf-8")
    (vault / "notes" / "b1").mkdir(parents=True)
    if analytical is not None:
        (vault / "notes" / "b1" / "analytical.json").write_text(json.dumps(analytical), encoding="utf-8")
    return vault


def test_no_analytical_note_is_nothing_written_yet_not_a_fault(tmp_path: Path):
    """The vault has no `analytical.json` at all, and this failed on every run."""
    mod = system()
    vault = a_book_with_notes(tmp_path, analytical=None)

    passed, said = mod.audit_analytical_parity(vault)
    result = mod.check_analytical_parity(vault)

    assert passed is True, said
    assert said.startswith(mod.NOTHING_WRITTEN_YET), said
    assert result.nothing_to_check is True and result.passed is True


def test_an_analytical_note_with_empty_lists_is_nothing_written_yet(tmp_path: Path):
    mod = system()
    vault = a_book_with_notes(tmp_path, {"terms": [], "arguments": [], "critiques": [], "inquiries": []})

    passed, said = mod.audit_analytical_parity(vault)

    assert passed is True and said.startswith(mod.NOTHING_WRITTEN_YET), said


def test_one_term_is_checked_and_passes_without_the_other_three_kinds(tmp_path: Path):
    """It demanded terms and arguments and critiques and inquiries in one book before it would pass."""
    mod = system()
    term = {"id": "t1", "term": "Labour", "citation": {"chapterFile": "ch-01.md", "anchor": "^p-001"}}
    vault = a_book_with_notes(tmp_path, {"terms": [term], "arguments": [], "critiques": [], "inquiries": []})

    passed, said = mod.audit_analytical_parity(vault)
    result = mod.check_analytical_parity(vault)

    assert passed is True, said
    assert "1 terms" in said and not said.startswith(mod.NOTHING_WRITTEN_YET), said
    assert result.nothing_to_check is False


def test_entries_under_a_name_the_check_does_not_read_are_a_fault_not_nothing(tmp_path: Path):
    """The guard that made the old check fail on nothing was there for this: a check that reads the wrong name reads
    nothing, and nothing now passes. So a list under a name the check does not read fails instead."""
    mod = system()
    term = {"id": "t1", "term": "Labour", "citation": {"chapterFile": "ch-01.md", "anchor": "^p-001"}}
    vault = a_book_with_notes(tmp_path, {"authorTerms": [term]})

    passed, said = mod.audit_analytical_parity(vault)

    assert passed is False
    assert "does not read: authorTerms" in said, said


def test_an_analytical_note_that_cannot_be_read_is_still_a_fault(tmp_path: Path):
    mod = system()
    vault = a_book_with_notes(tmp_path, analytical=None)
    (vault / "notes" / "b1" / "analytical.json").write_text("{ this is not JSON", encoding="utf-8")

    passed, said = mod.audit_analytical_parity(vault)

    assert passed is False
    assert "Malformed JSON" in said, said


def test_no_topic_and_no_report_is_nothing_written_yet(tmp_path: Path):
    mod = system()
    vault = tmp_path / "vault"
    (vault / "syntopicon" / "topics").mkdir(parents=True)
    (vault / "syntopicon" / "reports").mkdir(parents=True)

    passed, said = mod.audit_syntopicon_parity(vault)
    result = mod.check_syntopical_parity(vault)

    assert passed is True and said.startswith(mod.NOTHING_WRITTEN_YET), said
    assert result.nothing_to_check is True


def test_a_report_with_no_topic_is_a_fault_not_nothing(tmp_path: Path):
    mod = system()
    vault = tmp_path / "vault"
    (vault / "syntopicon" / "topics").mkdir(parents=True)
    (vault / "syntopicon" / "reports").mkdir(parents=True)
    (vault / "syntopicon" / "reports" / "gone-synthesis.md").write_text(
        "---\ntopic_id: gone\n---\n# Dossier\n", encoding="utf-8"
    )

    passed, said = mod.audit_syntopicon_parity(vault)

    assert passed is False
    assert "topic_id 'gone' which does not exist" in said, said


def test_the_table_says_none_for_a_check_with_nothing_to_check(capsys):
    mod = system()
    results = [
        mod.DiagnosticResult("9. Analytical Parity", "t", "Nothing written yet: 0", True, nothing_to_check=True),
        mod.DiagnosticResult("1. Ledger & Vault Parity", "t", "1 books", True),
    ]

    mod.print_audit_table(results, use_color=False)

    rows = [line for line in capsys.readouterr().out.splitlines() if line.startswith(("| 9.", "| 1."))]
    assert len(rows) == 2, rows
    assert rows[0].split("|")[-2].strip() == "NONE", rows[0]
    assert rows[1].split("|")[-2].strip() == "PASS", rows[1]


# ---------------------------------------------------------------------------
# 12. The line ceiling: a ratchet
# ---------------------------------------------------------------------------


def test_a_long_file_held_at_its_length_passes():
    mod = system()
    assert mod.line_ceiling_faults({"a.rs": 400, "b.rs": 120}, {"a.rs": 400}) == []


def test_a_held_file_that_grows_fails():
    mod = system()
    (fault,) = mod.line_ceiling_faults({"a.rs": 401}, {"a.rs": 400})
    assert "a.rs (401 lines) grew past the 400 lines" in fault, fault


def test_a_new_file_past_the_ceiling_fails():
    mod = system()
    (fault,) = mod.line_ceiling_faults({"a.rs": 400, "new.rs": 301}, {"a.rs": 400})
    assert "new.rs (301 lines) is over the 300-line ceiling" in fault, fault
    assert mod.line_ceiling_faults({"new.rs": 300}, {}) == [], "300 lines is at the ceiling, not over it"


def test_a_held_file_that_got_shorter_must_lower_its_number():
    """The list only ever shrinks, so the room a split made cannot be spent again unseen."""
    mod = system()
    (lower,) = mod.line_ceiling_faults({"a.rs": 350}, {"a.rs": 400})
    (off,) = mod.line_ceiling_faults({"a.rs": 250}, {"a.rs": 400})
    (gone,) = mod.line_ceiling_faults({}, {"a.rs": 400})
    assert "lower its number to 350" in lower, lower
    assert "take it off the list" in off, off
    assert "not there any more" in gone, gone


def test_no_source_file_of_this_repository_is_longer_than_the_list_holds_it():
    """The ratchet itself. The audit is run by hand, so without this test the list would be stale by the next run,
    and check 12 would fail on every run again, which is the fault TL-15 is about."""
    mod = system()
    held = mod.files_held_long()
    counts = mod.source_line_counts(mod.ROOT_DIR)

    assert len(held) > 30, "the list of long files was not read, so this test checks nothing"
    assert len(counts) > 300, "the source files were not found, so this test checks nothing"
    assert {"packages/ingestion/tests/test_ledger.py", "scripts/free-dev-port.mjs"} <= set(counts), "TL-17"
    assert mod.line_ceiling_faults(counts, held) == []
