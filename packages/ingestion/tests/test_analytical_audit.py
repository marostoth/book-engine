"""Test suite for Diagnostic Vector 9: Analytical Logic & Citation Parity."""

import json
from pathlib import Path

from conftest import load_skill


def get_audit_module():
    """The audit script, found by an anchored path, not by the folder pytest was started in (TL-02)."""
    return load_skill("audit-system.py")


def test_audit_analytical_parity_on_the_vault_of_the_tests(vault_of_the_tests: Path):
    """The analytical audit passes on a whole vault that this test run built (TL-02).

    It used to read the vault beside the repository, which holds the reader's own books. That failed on a fresh
    clone, which has no books, and it failed on the owner's computer too, because those books carry no analytical
    notes. Neither failure was ever about the code this test is here to check.
    """
    mod = get_audit_module()
    passed, metric = mod.audit_analytical_parity(vault_of_the_tests)
    assert passed is True, f"Analytical parity failed: {metric}"
    assert "terms" in metric
    assert "args" in metric
    assert "critiques" in metric
    assert "inquiries" in metric


def test_audit_analytical_parity_catches_invalid_data(tmp_path: Path):
    """Verify that audit_analytical_parity catches bad anchors, missing arguments, and Rule 9/12 defect violations."""
    mod = get_audit_module()

    # Empty vault fails
    empty_vault = tmp_path / "empty_vault"
    passed, err = mod.audit_analytical_parity(empty_vault)
    assert passed is False
    assert "Notes directory does not exist" in err

    # Setup dummy vault
    vault = tmp_path / "vault"
    books = vault / "books" / "b1"
    notes = vault / "notes" / "b1"
    books.mkdir(parents=True)
    notes.mkdir(parents=True)
    (books / "ch-01.md").write_text("# Title\n\nParagraph text here. ^p-001\n\nSecond paragraph. ^p-002\n", encoding="utf-8")

    # Base valid store
    base_data = {
        "terms": [{"id": "t1", "term": "Atomicity", "citation": {"chapterFile": "ch-01.md", "anchor": "^p-001"}}],
        "arguments": [{"id": "a1", "title": "Arg 1", "conclusion": {"chapterFile": "ch-01.md", "anchor": "^p-001"}, "premises": []}],
        "critiques": [{
            "id": "c1",
            "targetArgumentId": "a1",
            "judgment": "disagree",
            "defects": ["incomplete"],
            "understandingDeclared": True,
            "rationale": "Missing proof."
        }],
        "inquiries": [{
            "id": "i1",
            "question": "What is atomicity?",
            "domain": "theoretical",
            "priority": "primary",
            "citation": {"chapterFile": "ch-01.md", "anchor": "^p-001"},
            "resolution": "solved",
            "solutionArgumentIds": ["a1"],
            "solutionCitation": {"chapterFile": "ch-01.md", "anchor": "^p-002"}
        }]
    }

    # 1. Valid data passes
    (notes / "analytical.json").write_text(json.dumps(base_data), encoding="utf-8")
    passed, metric = mod.audit_analytical_parity(vault)
    assert passed is True
    assert "1 inquiries" in metric

    # 2. Invalid: inquiry solutionArgumentId points to non-existent argument
    bad_data = json.loads(json.dumps(base_data))
    bad_data["inquiries"][0]["solutionArgumentIds"] = ["a999"]
    (notes / "analytical.json").write_text(json.dumps(bad_data), encoding="utf-8")
    passed, err = mod.audit_analytical_parity(vault)
    assert passed is False
    assert "solutionArgumentId 'a999' does not match any argument" in err

    # 3. Invalid: inquiry question citation anchor not found
    bad_data = json.loads(json.dumps(base_data))
    bad_data["inquiries"][0]["citation"] = {"chapterFile": "ch-01.md", "anchor": "^p-999"}
    (notes / "analytical.json").write_text(json.dumps(bad_data), encoding="utf-8")
    passed, err = mod.audit_analytical_parity(vault)
    assert passed is False
    assert "anchor '^p-999' not found in 'ch-01.md'" in err

    # 4. Invalid: inquiry solution citation anchor not found
    bad_data = json.loads(json.dumps(base_data))
    bad_data["inquiries"][0]["solutionCitation"] = {"chapterFile": "ch-01.md", "anchor": "^p-888"}
    (notes / "analytical.json").write_text(json.dumps(bad_data), encoding="utf-8")
    passed, err = mod.audit_analytical_parity(vault)
    assert passed is False
    assert "anchor '^p-888' not found in 'ch-01.md'" in err
