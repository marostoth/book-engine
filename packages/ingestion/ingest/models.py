"""Pydantic schemas and contracts for vault metadata, TOC, and practice decks."""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class TOCItem(BaseModel):
    """Hierarchical Table of Contents node."""
    id: str
    title: str
    href: str
    level: int = 1
    subitems: List[TOCItem] = Field(default_factory=list)


class ElementaryMetrics(BaseModel):
    """Readability and reading time metrics for Level 1 Elementary Reading."""
    flesch_kincaid_grade: float
    avg_sentence_length_words: float
    estimated_reading_minutes: int


class InspectionalSampling(BaseModel):
    """Head and tail anchor sampling and previews for Level 2 Inspectional Reading."""
    head_anchors: List[str] = Field(default_factory=list)
    tail_anchors: List[str] = Field(default_factory=list)
    head_text_preview: str = ""
    tail_text_preview: str = ""


class InspectionalBlueprint(BaseModel):
    """Structural blueprint and synthetic index for Level 2 Inspectional Reading.

    The reader's exit assessment is not part of it. An import writes `_meta.json` again, so the app keeps the
    assessment in `vault/notes/<book-id>/inspectional.json` (DS-09).
    """
    front_matter: Dict[str, Any] = Field(default_factory=dict)
    pivotal_chapters: List[str] = Field(default_factory=list)
    synthetic_index_clusters: List[Dict[str, Any]] = Field(default_factory=list)


class ChapterMeta(BaseModel):
    """Metadata for a processed chapter."""
    id: str
    title: str
    file_path: str
    order: int
    word_count: int = 0
    anchor_count: int = 0
    first_anchor: Optional[str] = None
    last_anchor: Optional[str] = None
    footnotes_count: int = 0
    inspectional_sampling: Optional[InspectionalSampling] = None


class BookMeta(BaseModel):
    """Schema for vault/books/<book-id>/_meta.json."""
    book_id: str
    title: str
    author: str
    language: str = "en"
    total_words: int = 0
    total_chapters: int = 0
    toc: List[TOCItem] = Field(default_factory=list)
    spine: List[ChapterMeta] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    elementary_metrics: Optional[ElementaryMetrics] = None
    inspectional_blueprint: Optional[InspectionalBlueprint] = None


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
    options: List[ScenarioOptionModel]
    rationale: str

