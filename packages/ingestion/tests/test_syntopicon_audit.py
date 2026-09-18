"""Test suite for Diagnostic Vector 10: Syntopical Cross-Vault Referential Parity."""

import json
from pathlib import Path
import importlib.util
import pytest


def get_audit_module():
    skill_path = Path(".agent/skills/audit-system.py")
    spec = importlib.util.spec_from_file_location("audit_system", skill_path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_audit_syntopicon_parity_on_live_vault():
    """Verify that audit_syntopicon_parity passes on the live repository vault."""
    mod = get_audit_module()
    passed, metric = mod.audit_syntopicon_parity(Path("vault"))
    assert passed is True, f"Syntopicon parity failed: {metric}"
    assert "topic(s)" in metric
    assert "terms" in metric
    assert "controversies" in metric
    assert "book(s)" in metric


def test_audit_syntopicon_parity_catches_invalid_data(tmp_path: Path):
    """Verify that audit_syntopicon_parity catches missing books, bad anchors, orphan questions, and multi-book violations."""
    mod = get_audit_module()

    # 1. Missing topics directory fails
    empty_vault = tmp_path / "empty_vault"
    passed, err = mod.audit_syntopicon_parity(empty_vault)
    assert passed is False
    assert "does not exist" in err

    # Setup dummy vault with 2 books
    vault = tmp_path / "vault"
    book_a = vault / "books" / "book-a"
    book_b = vault / "books" / "book-b"
    topics = vault / "syntopicon" / "topics"
    book_a.mkdir(parents=True)
    book_b.mkdir(parents=True)
    topics.mkdir(parents=True)

    (book_a / "ch-01.md").write_text("# Chapter 1\n\nFirst paragraph here. ^p-001\n", encoding="utf-8")
    (book_b / "ch-01.md").write_text("# Chapter 1\n\nSecond book paragraph. ^p-010\n", encoding="utf-8")

    base_topic = {
        "id": "test-topic",
        "title": "Comparative Inquiry",
        "description": "A cross-book study.",
        "neutralTerms": [
            {
                "id": "term-1",
                "term": "Equilibrium",
                "neutralDefinition": "State of balance.",
                "mappings": [
                    {
                        "bookId": "book-a",
                        "authorVariant": "Market balance",
                        "citation": {
                            "bookId": "book-a",
                            "chapterFile": "ch-01.md",
                            "anchor": "^p-001",
                            "quote": "First paragraph here."
                        }
                    },
                    {
                        "bookId": "book-b",
                        "authorVariant": "Dynamic steady-state",
                        "citation": {
                            "bookId": "book-b",
                            "chapterFile": "ch-01.md",
                            "anchor": "^p-010",
                            "quote": "Second book paragraph."
                        }
                    }
                ]
            }
        ],
        "questions": [
            {
                "id": "q-1",
                "question": "Is equilibrium spontaneously achievable?",
                "order": 1
            }
        ],
        "controversies": [
            {
                "id": "c-1",
                "questionId": "q-1",
                "title": "Spontaneous Order vs Central Planning",
                "perspectives": [
                    {
                        "bookId": "book-a",
                        "stance": "Emerges naturally.",
                        "citations": [
                            {
                                "bookId": "book-a",
                                "chapterFile": "ch-01.md",
                                "anchor": "^p-001",
                                "quote": "First paragraph here."
                            }
                        ]
                    },
                    {
                        "bookId": "book-b",
                        "stance": "Requires external stabilizing input.",
                        "citations": [
                            {
                                "bookId": "book-b",
                                "chapterFile": "ch-01.md",
                                "anchor": "^p-010",
                                "quote": "Second book paragraph."
                            }
                        ]
                    }
                ]
            }
        ],
        "createdAt": "2026-09-13T10:00:00Z"
    }

    # 2. Valid topic passes
    topic_file = topics / "test-topic.json"
    topic_file.write_text(json.dumps(base_topic), encoding="utf-8")
    passed, metric = mod.audit_syntopicon_parity(vault)
    assert passed is True, f"Expected pass, got error: {metric}"
    assert "1 topic(s)" in metric

    # 3. Invariant: Multi-book violation (only 1 book cited)
    single_book_topic = json.loads(json.dumps(base_topic))
    single_book_topic["neutralTerms"][0]["mappings"] = [single_book_topic["neutralTerms"][0]["mappings"][0]]
    single_book_topic["controversies"][0]["perspectives"] = [single_book_topic["controversies"][0]["perspectives"][0]]
    topic_file.write_text(json.dumps(single_book_topic), encoding="utf-8")
    passed, err = mod.audit_syntopicon_parity(vault)
    assert passed is False
    assert "Multi-book invariant violated" in err

    # 4. Invariant: Non-existent referenced book
    bad_book_topic = json.loads(json.dumps(base_topic))
    bad_book_topic["neutralTerms"][0]["mappings"][1]["citation"]["bookId"] = "non-existent-book"
    topic_file.write_text(json.dumps(bad_book_topic), encoding="utf-8")
    passed, err = mod.audit_syntopicon_parity(vault)
    assert passed is False
    assert "Referenced book 'non-existent-book' does not exist" in err

    # 5. Invariant: Anchor not found in chapter
    bad_anchor_topic = json.loads(json.dumps(base_topic))
    bad_anchor_topic["neutralTerms"][0]["mappings"][0]["citation"]["anchor"] = "^p-999"
    topic_file.write_text(json.dumps(bad_anchor_topic), encoding="utf-8")
    passed, err = mod.audit_syntopicon_parity(vault)
    assert passed is False
    assert "Anchor '^p-999' not found" in err

    # 6. Invariant: Orphan controversy pointing to non-existent questionId
    orphan_controversy = json.loads(json.dumps(base_topic))
    orphan_controversy["controversies"][0]["questionId"] = "q-unknown"
    topic_file.write_text(json.dumps(orphan_controversy), encoding="utf-8")
    passed, err = mod.audit_syntopicon_parity(vault)
    assert passed is False
    assert "questionId 'q-unknown' does not match any framed question" in err

    # 7. A dossier whose links open from the folder it is saved in passes (CQ-06). A report lives in
    # vault/syntopicon/reports/, so a link to a passage climbs two folders.
    topic_file.write_text(json.dumps(base_topic), encoding="utf-8")
    reports = vault / "syntopicon" / "reports"
    reports.mkdir(parents=True)
    report_file = reports / "test-topic-synthesis.md"
    report_content = (
        "---\n"
        "topic_id: test-topic\n"
        "title: Comparative Inquiry\n"
        "---\n\n"
        "# Syntopical Dossier\n\n"
        "— [`ch-01.md#^p-001`](../../books/book-a/ch-01.md#^p-001)\n"
        "— [`ch-01.md#^p-010`](../../books/book-b/ch-01.md#^p-010)\n"
        "— [the review](https://example.invalid/review) and [the top](#syntopical-dossier)\n"
    )
    report_file.write_text(report_content, encoding="utf-8")
    passed, metric = mod.audit_syntopicon_parity(vault)
    assert passed is True, f"Expected pass, got error: {metric}"
    assert "1 dossier(s)" in metric

    # 8. Invariant: Dossier referencing unknown topic fails
    bad_report = reports / "orphan-topic-synthesis.md"
    bad_report.write_text("---\ntopic_id: unknown-topic\n---\n# Dossier\n", encoding="utf-8")
    passed, err = mod.audit_syntopicon_parity(vault)
    assert passed is False
    assert "References topic_id 'unknown-topic' which does not exist" in err
    bad_report.unlink()

    # 9. Invariant: a dossier link that names no such paragraph fails (CQ-06)
    broken_cite_report = reports / "test-topic-synthesis.md"
    broken_cite_report.write_text(
        "---\ntopic_id: test-topic\n---\n# Dossier\n"
        "— [`ch-01.md#^p-999`](../../books/book-a/ch-01.md#^p-999)\n",
        encoding="utf-8",
    )
    passed, err = mod.audit_syntopicon_parity(vault)
    assert passed is False
    assert "names a file that has no such paragraph" in err

    # 10. Invariant: a dossier link that starts where the repository starts, as the app used to write it, fails
    # because it reaches no file from the folder the report is saved in (CQ-06).
    broken_cite_report.write_text(
        "---\ntopic_id: test-topic\n---\n# Dossier\n"
        "— [`ch-01.md#^p-001`](vault/books/book-a/ch-01.md)\n",
        encoding="utf-8",
    )
    passed, err = mod.audit_syntopicon_parity(vault)
    assert passed is False
    assert "names a folder that is not in the vault" in err

    # 10b. A link written from the right place, to a chapter the book no longer has, says so instead (CQ-06)
    broken_cite_report.write_text(
        "---\ntopic_id: test-topic\n---\n# Dossier\n"
        "— [`ch-09.md#^p-001`](../../books/book-a/ch-09.md#^p-001)\n",
        encoding="utf-8",
    )
    passed, err = mod.audit_syntopicon_parity(vault)
    assert passed is False
    assert "reaches no file" in err
    broken_cite_report.write_text(report_content, encoding="utf-8")

    # 11. Invariant: a quote that is not in the paragraph it names fails (CQ-06)
    moved_quote = json.loads(json.dumps(base_topic))
    moved_quote["neutralTerms"][0]["mappings"][0]["citation"]["quote"] = "Words the book never wrote."
    topic_file.write_text(json.dumps(moved_quote), encoding="utf-8")
    passed, err = mod.audit_syntopicon_parity(vault)
    assert passed is False
    assert "is not in that paragraph any more" in err

    # 12. A quote that only a line wrap or a mark tells apart is the same quote (CQ-06)
    (book_a / "ch-01.md").write_text("# Chapter 1\n\nFirst\nparagraph  here. ^p-001\n", encoding="utf-8")
    wrapped_quote = json.loads(json.dumps(base_topic))
    wrapped_quote["neutralTerms"][0]["mappings"][0]["citation"]["quote"] = "**First** paragraph here"
    topic_file.write_text(json.dumps(wrapped_quote), encoding="utf-8")
    passed, metric = mod.audit_syntopicon_parity(vault)
    assert passed is True, f"Expected pass, got error: {metric}"
