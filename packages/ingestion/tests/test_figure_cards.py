"""A wide drawing keeps its full width, and the words of a page come through whole (TL-02).

These three tests used to open one commercial book in the vault beside the repository, name its chapter file,
and assert exact sentences and exact picture sizes of it. That book is not in any clone, so all three SKIPPED,
on a fresh clone and on the owner's computer alike. A test that only ever skips is not a test, and this one had
gone stale without anyone seeing it: it still expected the picture names `fig-01-1.png`, which IN-10 changed to
`fig-01-1-1.png` so that two figures of one part stop writing one file.

Each test now builds the PDF it needs, so it runs everywhere and names no book. The first one pins the rendered
size of a wide drawing, which nothing else in the suite pins at all.
"""

import re
from pathlib import Path

import pymupdf
from PIL import Image

from ingest.pipeline import ingest_book
from ingest.vector_figures import detect_and_rasterize_vector_figures, figure_file_name

#: The import renders a figure at this many dots per inch, and a PDF measures in points, of which there are 72
#: to the inch (`detect_and_rasterize_vector_figures`).
DPI = 200
POINTS_PER_INCH = 72


def _page_with_a_wide_drawing(doc: pymupdf.Document, left: float = 40.0, right: float = 572.0) -> pymupdf.Page:
    """A page holding a figure heading and a drawing that runs almost the whole width of it."""
    page = doc.new_page(width=612, height=792)
    page.insert_text((left, 120), "FIGURE 1.1 A Wide Diagram of the Whole Process")
    top, bottom = 150.0, 400.0
    page.draw_rect(pymupdf.Rect(left, top, right, bottom), color=(0, 0, 0), width=2)
    # Five boxes in a row, so the drawing is wide because of what it holds, not because of one long line.
    step = (right - left) / 5
    for box in range(5):
        x0 = left + box * step + 6
        page.draw_rect(pymupdf.Rect(x0, top + 40, x0 + step - 12, bottom - 40), color=(0, 0, 0), width=1)
        page.insert_text((x0 + 8, top + 80), f"Step {box + 1}")
    return page


def test_a_wide_drawing_is_rendered_at_its_full_width(tmp_path: Path) -> None:
    """The picture of a wide figure covers the whole drawing, and is not cut off at the side."""
    doc = pymupdf.open()
    left, right = 40.0, 572.0
    _page_with_a_wide_drawing(doc, left, right)

    assets = tmp_path / "assets"
    figures = detect_and_rasterize_vector_figures(doc, [0], chapter_idx=1, assets_dir=assets)
    doc.close()

    assert (1, 1) in figures, "the figure heading of the page made no picture"
    picture = assets / figure_file_name(1, 1, 1)
    assert picture.exists()

    with Image.open(picture) as rendered:
        width, height = rendered.size

    # The drawing is 532 points wide, and the import adds 12 points of padding on each side.
    least = int((right - left) * DPI / POINTS_PER_INCH)
    assert width >= least, f"the picture is {width} wide, and the drawing alone needs {least}"
    assert height > 0
    assert width > height, "a drawing wider than it is tall gives a picture wider than it is tall"


def test_the_picture_of_a_figure_carries_the_whole_number_of_that_figure(tmp_path: Path) -> None:
    """Figure 1.1 and Figure 2.1 of one part keep two pictures, because the name carries both numbers (IN-10)."""
    doc = pymupdf.open()
    for major in (1, 2):
        page = doc.new_page(width=612, height=792)
        page.insert_text((40, 120), f"FIGURE {major}.1 A Diagram")
        page.draw_rect(pymupdf.Rect(40, 150, 500, 400), color=(0, 0, 0), width=2)
        page.draw_line(pymupdf.Point(60, 200), pymupdf.Point(480, 380))

    assets = tmp_path / "assets"
    figures = detect_and_rasterize_vector_figures(doc, [0, 1], chapter_idx=1, assets_dir=assets)
    doc.close()

    assert (1, 1) in figures and (2, 1) in figures
    names = sorted(path.name for path in assets.glob("*.png"))
    assert names == ["fig-01-1-1.png", "fig-01-2-1.png"], names


def test_the_words_of_a_page_come_through_whole(tmp_path: Path) -> None:
    """No word of the book loses its opening letters on the way into a chapter file.

    The import used to lay redactions over a page, which cut the first letters off words next to them, so
    "importance" reached the chapter as "ortance". Nothing does that now (`apply_text_redactions` does nothing at
    all), and this holds it that way.
    """
    sentences = [
        "Explain the importance of understanding the marketplace before any plan is made.",
        "The most basic concept underlying this work is that of human needs and wants.",
        "They include basic physical needs for food, clothing, warmth and safety.",
        "As a first step, a maker needs to understand what the customer needs.",
    ]

    pdf_path = tmp_path / "whole-words.pdf"
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    for line, sentence in enumerate(sentences):
        page.insert_text((60, 100 + line * 40), sentence, fontsize=11)
    doc.set_toc([[1, "Chapter One", 1]])
    doc.set_metadata({"title": "A Book of Whole Words", "author": "A Test"})
    doc.save(str(pdf_path))
    doc.close()

    vault = tmp_path / "vault"
    meta = ingest_book(pdf_path, vault)
    text = (vault / "books" / meta.book_id / "ch-01.md").read_text(encoding="utf-8")

    for sentence in sentences:
        assert sentence in text, f"the page said {sentence!r}, and the chapter does not"

    # A word of its own, not a piece of a longer one: "ortance" sits inside the real word "importance".
    for cut in ("ortance", "derstanding", "othing", "afety"):
        assert not re.search(rf"\b{cut}\b", text), f"a word lost its opening letters and became {cut!r}"
