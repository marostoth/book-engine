"""Test suite for Level 1 and Level 2 metadata schemas and backward compatibility."""

import json
from pathlib import Path
import pytest

from ingest.models import (
    BookMeta,
    ChapterMeta,
    ElementaryMetrics,
    InspectionalBlueprint,
    InspectionalSampling,
)
from ingest.anchors import clean_preview_text, extract_inspectional_sampling
from ingest.elementary import compute_elementary_metrics
from ingest.sample_generator import create_sample_epub
from ingest.pipeline import ingest_epub


def test_elementary_metrics_schema():
    """Verify ElementaryMetrics model serialization and validation."""
    metrics = ElementaryMetrics(
        flesch_kincaid_grade=10.2,
        avg_sentence_length_words=18.5,
        estimated_reading_minutes=12,
    )
    data = metrics.model_dump()
    assert data["flesch_kincaid_grade"] == 10.2
    assert data["avg_sentence_length_words"] == 18.5
    assert data["estimated_reading_minutes"] == 12

    restored = ElementaryMetrics.model_validate(data)
    assert restored.flesch_kincaid_grade == 10.2


def test_inspectional_sampling_schema():
    """Verify InspectionalSampling schema contract."""
    sampling = InspectionalSampling(
        head_anchors=["^p-001", "^p-002"],
        tail_anchors=["^p-007", "^p-008"],
        head_text_preview="Opening argument of the chapter.",
        tail_text_preview="Concluding thoughts of the author.",
    )
    data = sampling.model_dump()
    assert len(data["head_anchors"]) == 2
    assert len(data["tail_anchors"]) == 2
    assert "Opening" in data["head_text_preview"]

    restored = InspectionalSampling.model_validate(data)
    assert restored.head_anchors == ["^p-001", "^p-002"]


def test_inspectional_blueprint_schema():
    """Verify InspectionalBlueprint schema contract."""
    blueprint = InspectionalBlueprint(
        front_matter={
            "has_preface": True,
            "preface_path": "preface.md",
            "publisher_blurb": "A landmark work on computing.",
        },
        pivotal_chapters=["ch-01", "ch-04"],
        synthetic_index_clusters=[
            {"term": "Consensus", "anchors": ["^p-001", "^p-015"]}
        ],
    )
    data = blueprint.model_dump()
    assert data["front_matter"]["has_preface"] is True
    assert data["pivotal_chapters"] == ["ch-01", "ch-04"]

    restored = InspectionalBlueprint.model_validate(data)
    assert restored.pivotal_chapters == ["ch-01", "ch-04"]


def test_backward_compatibility_with_legacy_meta():
    """Ensure older _meta.json without Phase 0 fields parses without error."""
    legacy_json = json.dumps({
        "book_id": "legacy-book",
        "title": "Legacy Book",
        "author": "Old Author",
        "language": "en",
        "total_words": 1000,
        "total_chapters": 1,
        "toc": [],
        "spine": [
            {
                "id": "ch-01",
                "title": "Chapter 1",
                "file_path": "ch-01.md",
                "order": 1,
                "word_count": 1000,
                "anchor_count": 10,
                "footnotes_count": 0,
            }
        ],
    })
    book_meta = BookMeta.model_validate_json(legacy_json)
    assert book_meta.book_id == "legacy-book"
    assert book_meta.elementary_metrics is None
    assert book_meta.inspectional_blueprint is None
    assert book_meta.spine[0].inspectional_sampling is None


def test_clean_preview_text():
    """Verify clean_preview_text strips formatting, citations, and anchors."""
    raw = (
        "# Heading\n\n"
        "In **distributed** systems, _linearizability_ is key[^1] `code`. ^p-042"
    )
    cleaned = clean_preview_text(raw)
    assert "#" not in cleaned
    assert "*" not in cleaned
    assert "_" not in cleaned
    assert "`" not in cleaned
    assert "[^1]" not in cleaned
    assert "^p-042" not in cleaned
    assert cleaned == "Heading In distributed systems, linearizability is key code."


def test_sample_vault_meta_validation():
    """Verify that vault/books/sample/_meta.json passes BookMeta validation."""
    sample_meta_path = Path("vault/books/sample/_meta.json")
    if sample_meta_path.exists():
        content = sample_meta_path.read_text(encoding="utf-8")
        book_meta = BookMeta.model_validate_json(content)
        assert book_meta.book_id == "sample"
        assert book_meta.elementary_metrics is not None
        assert book_meta.elementary_metrics.flesch_kincaid_grade > 0
        assert book_meta.inspectional_blueprint is not None
        for ch in book_meta.spine:
            assert ch.inspectional_sampling is not None
            assert len(ch.inspectional_sampling.head_anchors) > 0
            assert len(ch.inspectional_sampling.tail_anchors) > 0


def test_end_to_end_pipeline_generates_valid_meta(tmp_path: Path):
    """Verify pipeline ingestion generates valid elementary metrics and inspectional sampling."""
    epub_path = tmp_path / "sample.epub"
    create_sample_epub(epub_path)

    vault_dir = tmp_path / "vault"
    meta = ingest_epub(epub_path, vault_dir, custom_book_id="sample-e2e")

    assert meta.elementary_metrics is not None
    assert meta.elementary_metrics.flesch_kincaid_grade > 0
    assert meta.elementary_metrics.avg_sentence_length_words > 0
    assert meta.elementary_metrics.estimated_reading_minutes >= 1

    assert meta.inspectional_blueprint is not None
    assert len(meta.inspectional_blueprint.pivotal_chapters) > 0

    assert len(meta.spine) == 2
    for ch in meta.spine:
        assert ch.inspectional_sampling is not None
        assert len(ch.inspectional_sampling.head_anchors) == 2
        assert len(ch.inspectional_sampling.tail_anchors) == 2
        assert len(ch.inspectional_sampling.head_text_preview) > 10
        assert len(ch.inspectional_sampling.tail_text_preview) > 10
        assert "^p-" not in ch.inspectional_sampling.head_text_preview

    # Verify written _meta.json passes strict validation
    written_meta_json = (vault_dir / "books" / "sample-e2e" / "_meta.json").read_text(encoding="utf-8")
    validated = BookMeta.model_validate_json(written_meta_json)
    assert validated.book_id == "sample-e2e"
    assert validated.elementary_metrics is not None


def test_audit_inspectional_parity_on_live_vault():
    """Verify that audit_inspectional_parity passes 100% on the live vault."""
    import importlib.util

    skill_path = Path(".agent/skills/audit-system.py")
    spec = importlib.util.spec_from_file_location("audit_system", skill_path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    passed, metric = mod.audit_inspectional_parity(Path("vault"))
    assert passed is True
    assert "head/tail pairs" in metric
    assert "chapters" in metric


def test_audit_inspectional_parity_detects_corrupt_sampling(tmp_path: Path):
    """Verify that audit_inspectional_parity fails when anchors do not match markdown."""
    import importlib.util

    skill_path = Path(".agent/skills/audit-system.py")
    spec = importlib.util.spec_from_file_location("audit_system", skill_path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    # Empty vault -> should fail (zero sampling detected)
    empty_vault = tmp_path / "empty_vault"
    (empty_vault / "books").mkdir(parents=True)
    passed, err = mod.audit_inspectional_parity(empty_vault)
    assert passed is False
    assert "Zero inspectional sampling items detected" in err


def test_audit_inspectional_parity_checks_the_exit_assessment_next_to_the_notes(tmp_path: Path):
    """The reader's exit assessment lives in vault/notes/<book-id>/inspectional.json, so the audit checks it there (DS-09)."""
    import importlib.util

    skill_path = Path(".agent/skills/audit-system.py")
    spec = importlib.util.spec_from_file_location("audit_system", skill_path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    epub_path = tmp_path / "sample.epub"
    create_sample_epub(epub_path)
    vault_dir = tmp_path / "vault"
    ingest_epub(epub_path, vault_dir, custom_book_id="sample")
    passed, metric = mod.audit_inspectional_parity(vault_dir)
    assert passed is True, metric

    answers = {
        "exitAssessment": {
            "classification": "Theoretical - Science",
            "unityStatement": " ",
            "partsStructure": ["Consistency models", "Consensus"],
            "completedAt": "2026-09-16T10:00:00.000Z",
        }
    }
    (vault_dir / "notes" / "sample" / "inspectional.json").write_text(json.dumps(answers), encoding="utf-8")
    passed, err = mod.audit_inspectional_parity(vault_dir)
    assert passed is False
    assert "unityStatement" in err



