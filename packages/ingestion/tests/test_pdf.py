"""Tests for PDF parser, slug generation, margin sanitization, and pipeline integration."""

import tempfile
from pathlib import Path
import pymupdf
import pytest

from ingest.pdf_parser import PDFParser, generate_pdf_slug, sanitize_pdf_markdown
from ingest.pipeline import ingest_book


def test_generate_pdf_slug() -> None:
    # Test Kotler Marketing filename
    kotler_filename = "[MKTG] Kotler P., Armstrong G. Principles of Marketing 19ed 2023.pdf"
    assert generate_pdf_slug(kotler_filename, "Principles of Marketing, Global Edition") == "principles-of-marketing-19ed"

    # Test release year stripping and brackets
    assert generate_pdf_slug("[AI] Russell S. Artificial Intelligence 4th ed 2020.pdf", "Artificial Intelligence: A Modern Approach") == "artificial-intelligence-4th-ed"

    # Test simple filename
    assert generate_pdf_slug("deep-learning.pdf", "Deep Learning") == "deep-learning"


def test_sanitize_pdf_markdown() -> None:
    raw = """
Some introductory text.

> CHAPTER 1 | Marketing: Creating Customer Value and Engagement 25

First real paragraph of content.

26<sup>PART 1</sup> |<sup>Defining Marketing and the Marketing Process</sup>

42

Another regular paragraph with some definition.
"""
    cleaned = sanitize_pdf_markdown(raw)
    assert "> CHAPTER 1 |" not in cleaned
    assert "26<sup>PART 1" not in cleaned
    assert "\n42\n" not in cleaned
    assert "First real paragraph of content." in cleaned
    assert "Another regular paragraph with some definition." in cleaned


def test_pdf_parser_minimal_e2e(tmp_path: Path) -> None:
    # Create a minimal 2-chapter PDF using PyMuPDF
    pdf_path = tmp_path / "test-book.pdf"
    doc = pymupdf.open()

    # Chapter 1 (page 1)
    p1 = doc.new_page()
    p1.insert_text((50, 50), "# Chapter 1: Introduction\n\nMarketing is engaging customers and managing relationships.")

    # Chapter 2 (page 2)
    p2 = doc.new_page()
    p2.insert_text((50, 50), "# Chapter 2: Strategy\n\nStrategic planning is the process of developing a strategic fit.")

    # Set TOC: [level, title, 1-based page]
    doc.set_toc([
        [1, "Chapter 1: Introduction", 1],
        [1, "Chapter 2: Strategy", 2],
    ])
    doc.set_metadata({
        "title": "Minimal Test Book",
        "author": "Test Author",
    })
    doc.save(str(pdf_path))
    doc.close()

    vault_dir = tmp_path / "vault"
    meta = ingest_book(pdf_path, vault_dir)

    assert meta.title == "Minimal Test Book"
    assert meta.total_chapters == 2
    assert (vault_dir / "books" / meta.book_id / "_meta.json").exists()
    assert (vault_dir / "books" / meta.book_id / "ch-01.md").exists()
    assert (vault_dir / "books" / meta.book_id / "ch-02.md").exists()
    assert (vault_dir / "notes" / meta.book_id / "practice-deck.md").exists()
