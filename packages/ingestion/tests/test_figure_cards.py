"""Tests for zero-redaction text integrity and unclipped figure card generation."""

from pathlib import Path
import re
import pytest
from PIL import Image


def test_zero_redaction_text_integrity() -> None:
    """Verifies that eliminating PDF text redaction prevents character and prefix amputation."""
    ch1_path = Path("vault/books/principles-of-marketing-19ed/ch-01.md")
    if not ch1_path.exists():
        pytest.skip("Chapter 1 not yet generated.")

    text = ch1_path.read_text(encoding="utf-8")

    # Critical word checks that previously suffered prefix amputations from redactions
    assert "Explain the importance of understanding the marketplace" in text
    assert "The most basic concept underlying marketing is that of human needs" in text
    assert "They include basic physical needs for food" in text
    assert "As a first step, marketers need to understand customer needs" in text

    # Broken prefix fragments must NOT be present
    assert not re.search(r"\bortance\b", text)
    assert not re.search(r"\blying marketing is that\b", text)


def test_full_width_figure_dimensions() -> None:
    """Verifies that vector diagram rasterization captures full-width diagrams without horizontal cropping."""
    assets_dir = Path("vault/books/principles-of-marketing-19ed/assets")
    if not assets_dir.exists():
        pytest.skip("Assets directory not found.")

    expected_figures = {
        "fig-01-1.png": (1400, 400),  # Full 5-box process flow
        "fig-01-2.png": (1400, 450),  # Modern marketing system
        "fig-01-3.png": (1400, 350),  # Selling vs Marketing concepts
        "fig-01-5.png": (1400, 550),  # Customer relationship groups 2x2 matrix
        "fig-01-6.png": (1400, 1000), # Expanded model with bottom bar
    }

    for filename, (min_w, min_h) in expected_figures.items():
        fig_path = assets_dir / filename
        assert fig_path.exists(), f"Expected figure {filename} not found."
        with Image.open(fig_path) as im:
            w, h = im.size
            assert w >= min_w, f"{filename} width {w} is below full-width threshold {min_w}"
            assert h >= min_h, f"{filename} height {h} is below height threshold {min_h}"


def test_leaked_table_suppression_and_prose_preservation() -> None:
    """Verifies that leaked ASCII tables for vector diagrams are replaced, preserving narrative text."""
    ch1_path = Path("vault/books/principles-of-marketing-19ed/ch-01.md")
    if not ch1_path.exists():
        pytest.skip("Chapter 1 not yet generated.")

    text = ch1_path.read_text(encoding="utf-8")

    # Steve Jobs quote must be preserved as clean narrative prose, not inside an ASCII table
    assert "As legendary Apple cofounder Steve Jobs once said" in text
    # Should not contain raw leaked figure table markers
    assert "|FIGURE  1. 3" not in text
    assert "|FIGURE 1. 3" not in text

    # Strangers narrative must be intact
    assert "_Strangers_ show low potential profitability and little projected loyalty" in text
    assert "The company can classify customers according to their potential profitability" in text
