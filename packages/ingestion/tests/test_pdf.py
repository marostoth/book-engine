"""Tests for PDF parser, slug generation, margin sanitization, and pipeline integration."""

from pathlib import Path

import pymupdf
from ingest.pdf_parser import generate_pdf_slug, sanitize_pdf_markdown
from ingest.pipeline import ingest_book


def test_generate_pdf_slug() -> None:
    # Test Kotler Marketing filename
    kotler_filename = "[MKTG] Kotler P., Armstrong G. Principles of Marketing 19ed 2023.pdf"
    assert (
        generate_pdf_slug(kotler_filename, "Principles of Marketing, Global Edition") == "principles-of-marketing-19ed"
    )

    # Test release year stripping and brackets
    assert (
        generate_pdf_slug(
            "[AI] Russell S. Artificial Intelligence 4th ed 2020.pdf", "Artificial Intelligence: A Modern Approach"
        )
        == "artificial-intelligence-4th-ed"
    )

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


def test_clean_chapter_markdown() -> None:
    # 1. Drop numeral stripping and run-in chapter subheading normalization
    raw_with_drop_and_runin = """1

# Chapter 1: Introduction

CHAPTER This first chapter introduces distributed systems and fault tolerance. ^p-001
"""
    cleaned = sanitize_pdf_markdown(raw_with_drop_and_runin)
    assert not cleaned.startswith("1\n")
    assert "# Chapter 1: Introduction" in cleaned
    assert "This first chapter introduces distributed systems and fault tolerance. ^p-001" in cleaned
    assert "CHAPTER This" not in cleaned

    # 2. Deduplication of identical title lines within opening paragraphs
    raw_with_duplicate_title = """# Chapter 1: Marketing: Creating Customer Value

Marketing: Creating Customer Value

This chapter introduces the fundamental concepts of customer value. ^p-001
"""
    deduped = sanitize_pdf_markdown(raw_with_duplicate_title)
    # The duplicate title paragraph should be removed, retaining the H1 header and the body
    assert deduped.count("Marketing: Creating Customer Value") == 1
    assert "This chapter introduces the fundamental concepts of customer value. ^p-001" in deduped

    # 3. Idempotency test
    idempotent_pass = sanitize_pdf_markdown(deduped)
    assert idempotent_pass == deduped


def test_pdf_parser_minimal_e2e(tmp_path: Path) -> None:
    # Create a minimal 2-chapter PDF using PyMuPDF
    pdf_path = tmp_path / "test-book.pdf"
    doc = pymupdf.open()

    # Chapter 1 (page 1)
    p1 = doc.new_page()
    p1.insert_text((50, 50), "# Chapter 1: Introduction\n\nMarketing is engaging customers and managing relationships.")

    # Chapter 2 (page 2)
    p2 = doc.new_page()
    p2.insert_text(
        (50, 50), "# Chapter 2: Strategy\n\nStrategic planning is the process of developing a strategic fit."
    )

    # Set TOC: [level, title, 1-based page]
    doc.set_toc(
        [
            [1, "Chapter 1: Introduction", 1],
            [1, "Chapter 2: Strategy", 2],
        ]
    )
    doc.set_metadata(
        {
            "title": "Minimal Test Book",
            "author": "Test Author",
        }
    )
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


def test_pad_and_clamp_rect() -> None:
    from ingest.assets import pad_and_clamp_rect

    page_rect = pymupdf.Rect(0, 0, 500, 700)

    # 1. Negative coordinate clamping
    raw_left_top = pymupdf.Rect(-5, -10, 100, 100)
    padded = pad_and_clamp_rect(raw_left_top, page_rect, padding=18.0)
    assert padded.x0 == 0.0
    assert padded.y0 == 0.0
    assert padded.x1 == 118.0
    assert padded.y1 == 118.0

    # 2. Maximum boundary clamping (right/bottom)
    raw_right_bottom = pymupdf.Rect(450, 650, 520, 710)
    padded_rb = pad_and_clamp_rect(raw_right_bottom, page_rect, padding=18.0)
    assert padded_rb.x0 == 432.0
    assert padded_rb.y0 == 632.0
    assert padded_rb.x1 == 500.0
    assert padded_rb.y1 == 700.0


def test_union_figure_with_caption() -> None:
    from ingest.assets import union_figure_with_caption

    doc = pymupdf.open()
    page = doc.new_page(width=600, height=800)
    # Insert caption text block at y: 100..120
    page.insert_text((50, 110), "FIGURE 1.3 Selling and Marketing Concepts Contrasted")

    # Figure drawing rect situated 15pt below caption (y: 135..250)
    figure_rect = pymupdf.Rect(50, 135, 300, 250)

    union_rect = union_figure_with_caption(page, figure_rect, padding=18.0, caption_margin=30.0)
    # The union rect must encompass both the caption (y0 <= 110) and figure rect with padding
    assert union_rect.y0 <= 100.0
    assert union_rect.y1 >= 268.0
    assert union_rect.x0 >= 0.0
    assert union_rect.x1 <= page.rect.width
    doc.close()


def test_replace_vector_diagram_streams() -> None:
    from ingest.vector_figures import replace_vector_diagram_streams

    raw_markdown = (
        "Some introductory text. ^p-139\n\n"
        "|FIGURE  1. 3<br>Selling and Marketing<br>Concepts Contrasted<br>The selling concept takes an...|Starting point|Focus|\n"
        "|---|---|---| ^p-140\n\n"
        "###### FIGURE  1. 4\n\n"
        "Three Considerations Underlying the Societal Marketing Concept ^p-141"
    )

    fig_map = {
        (1, 3): ("assets/fig-01-3.png", "Selling and Marketing Concepts Contrasted"),
    }

    replaced = replace_vector_diagram_streams(raw_markdown, fig_map)

    assert "assets/fig-01-3.png" in replaced
    assert "![Figure 1.3: Selling and Marketing Concepts Contrasted](assets/fig-01-3.png) ^p-140" in replaced
    assert "|FIGURE  1. 3" not in replaced
    assert "^p-141" in replaced


def test_deduplicate_figure_captions() -> None:
    from ingest.pdf_sanitizer import deduplicate_figure_captions

    # Figure tag followed by duplicate standalone caption
    raw1 = (
        "Paragraph before.\n\n"
        "![Figure 1.3: Selling and Marketing](assets/fig-01-03.png)\n\n"
        "FIGURE 1. 3 Selling and Marketing Concepts Contrasted\n\n"
        "Paragraph after."
    )
    res1 = deduplicate_figure_captions(raw1)
    assert "![Figure 1.3: Selling and Marketing](assets/fig-01-03.png)" in res1
    assert "FIGURE 1. 3 Selling and Marketing Concepts Contrasted" not in res1
    assert "Paragraph after." in res1

    # Standalone caption preceding figure tag
    raw2 = (
        "Paragraph before.\n\n"
        "FIGURE 1. 5 Customer Relationship Groups\n\n"
        "![Figure 1.5: Customer Relationship Groups](assets/fig-01-05.png)\n\n"
        "Paragraph after."
    )
    res2 = deduplicate_figure_captions(raw2)
    assert "![Figure 1.5: Customer Relationship Groups](assets/fig-01-05.png)" in res2
    assert "FIGURE 1. 5 Customer Relationship Groups" not in res2

    # Idempotency
    assert deduplicate_figure_captions(res1) == res1
    assert deduplicate_figure_captions(res2) == res2


def test_mask_page_figure_zones() -> None:
    from ingest.vector_figures import mask_page_figure_zones

    doc = pymupdf.open()
    page = doc.new_page(width=600, height=800)

    # Insert body text outside figure zone
    page.insert_text((50, 50), "Safe body text outside figure.")

    # Insert diagram zone with internal label text
    page.insert_text((100, 200), "Internal diagram label to be preserved.")
    fig_rect = pymupdf.Rect(80, 180, 400, 300)

    mask_page_figure_zones(page, extra_rects=[fig_rect])

    extracted_text = page.get_text()
    assert "Safe body text outside figure." in extracted_text
    # Redaction is abolished; text is strictly preserved
    assert "Internal diagram label to be preserved." in extracted_text
    doc.close()


def test_suppress_page_images(tmp_path: Path) -> None:
    from ingest.assets import suppress_page_images

    assets_dir = tmp_path / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    # Create dummy images on page 28 (0029 in 1-based numbering)
    img_sub = assets_dir / "book-0029-01.png"
    img_sub.write_bytes(b"dummy")
    img_other = assets_dir / "book-0030-01.png"
    img_other.write_bytes(b"dummy")
    img_fig = assets_dir / "fig-01-1.png"
    img_fig.write_bytes(b"dummy")

    raw_md = (
        "Intro text.\n\n"
        "![](assets/book-0029-01.png)\n\n"
        "![Figure 1.1: Test](assets/fig-01-1.png)\n\n"
        "![](assets/book-0030-01.png)\n\n"
    )

    cleaned_md = suppress_page_images(raw_md, assets_dir, {28})

    assert "book-0029-01.png" not in cleaned_md
    assert not img_sub.exists()
    assert "assets/fig-01-1.png" in cleaned_md
    assert img_fig.exists()
    assert "book-0030-01.png" in cleaned_md
    assert img_other.exists()


def test_filter_and_normalize_markdown_assets_aspect_ratio(tmp_path: Path) -> None:
    from ingest.assets import filter_and_normalize_markdown_assets

    assets_dir = tmp_path / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    # 1. Normal image: 300x200 (aspect 1.5) -> retained
    doc1 = pymupdf.open()
    p1 = doc1.new_page(width=300, height=200)
    p1.insert_text((20, 20), "Good image")
    pix1 = p1.get_pixmap()
    img_good = assets_dir / "good.png"
    pix1.save(str(img_good))
    doc1.close()

    # 2. Sliver / arrow image: 400x30 (aspect 13.3) -> discarded
    doc2 = pymupdf.open()
    p2 = doc2.new_page(width=400, height=30)
    pix2 = p2.get_pixmap()
    img_sliver = assets_dir / "sliver.png"
    pix2.save(str(img_sliver))
    doc2.close()

    raw_md = "![](assets/good.png)\n\n![](assets/sliver.png)"
    cleaned = filter_and_normalize_markdown_assets(raw_md, assets_dir)

    assert "assets/good.png" in cleaned
    assert img_good.exists()
    assert "assets/sliver.png" not in cleaned
    assert not img_sliver.exists()
