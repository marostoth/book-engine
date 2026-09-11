"""Pydantic schemas and contracts for vault metadata, TOC, and practice decks."""

from __future__ import annotations
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field


class TOCItem(BaseModel):
    """Hierarchical Table of Contents node."""
    id: str
    title: str
    href: str
    level: int = 1
    subitems: List[TOCItem] = Field(default_factory=list)


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


class PracticeCard(BaseModel):
    """Extractive, zero-hallucination practice card."""
    card_id: str
    chapter_id: str
    anchor_id: str
    cloze_text: str
    answer_key: str
    exact_source: str
    score: float = 0.0
