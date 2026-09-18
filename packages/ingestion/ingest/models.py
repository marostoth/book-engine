"""Pydantic schemas and contracts for vault metadata, TOC, and practice decks."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class TOCItem(BaseModel):
    """Hierarchical Table of Contents node.

    In `_meta.json`, `href` is the chapter file that holds the entry (`ch-07.md`), or "" when no chapter holds it, and
    `anchor` is the paragraph where the entry starts (`^p-012`), or None for the top of the chapter (CQ-01).
    """

    id: str
    title: str
    href: str
    anchor: str | None = None
    level: int = 1
    subitems: list[TOCItem] = Field(default_factory=list)


class ElementaryMetrics(BaseModel):
    """Readability and reading time metrics for Level 1 Elementary Reading."""

    flesch_kincaid_grade: float
    avg_sentence_length_words: float
    estimated_reading_minutes: int


class InspectionalSampling(BaseModel):
    """Head and tail anchor sampling and previews for Level 2 Inspectional Reading."""

    head_anchors: list[str] = Field(default_factory=list)
    tail_anchors: list[str] = Field(default_factory=list)
    head_text_preview: str = ""
    tail_text_preview: str = ""


class InspectionalBlueprint(BaseModel):
    """Structural blueprint and synthetic index for Level 2 Inspectional Reading.

    The reader's exit assessment is not part of it. An import writes `_meta.json` again, so the app keeps the
    assessment in `vault/notes/<book-id>/inspectional.json` (DS-09).
    """

    front_matter: dict[str, Any] = Field(default_factory=dict)
    pivotal_chapters: list[str] = Field(default_factory=list)
    synthetic_index_clusters: list[dict[str, Any]] = Field(default_factory=list)


class ChapterMeta(BaseModel):
    """Metadata for a processed chapter."""

    id: str
    title: str
    file_path: str
    order: int
    word_count: int = 0
    anchor_count: int = 0
    first_anchor: str | None = None
    last_anchor: str | None = None
    footnotes_count: int = 0
    inspectional_sampling: InspectionalSampling | None = None


class BookSource(BaseModel):
    """The file that an import of a book read: its name, and the SHA-256 of its bytes (IN-03)."""

    file_name: str
    sha256: str


class BookMeta(BaseModel):
    """Schema for vault/books/<book-id>/_meta.json.

    It holds no time of the import, so two imports of the same file write the same bytes (IN-05).
    """

    book_id: str
    title: str
    author: str
    language: str = "en"
    total_words: int = 0
    total_chapters: int = 0
    toc: list[TOCItem] = Field(default_factory=list)
    spine: list[ChapterMeta] = Field(default_factory=list)
    source: BookSource | None = None
    elementary_metrics: ElementaryMetrics | None = None
    inspectional_blueprint: InspectionalBlueprint | None = None


class PracticeCard(BaseModel):
    """Extractive, zero-hallucination practice card."""

    card_id: str
    chapter_id: str
    anchor_id: str
    cloze_text: str
    answer_key: str
    exact_source: str
    score: float = 0.0


class ScenarioOptionModel(BaseModel):
    """Multiple-choice scenario option item."""

    key: str  # 'A', 'B', 'C', 'D'
    text: str
    is_correct: bool


class ScenarioCard(BaseModel):
    """Extractive, zero-hallucination deductive scenario card (MCQ)."""

    card_id: str
    chapter_id: str
    anchor_id: str
    scenario: str
    options: list[ScenarioOptionModel]
    rationale: str
