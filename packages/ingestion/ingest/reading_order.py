"""Read a page in the order a reader reads it, not the order the layout engine guessed (CQ-07).

`pymupdf4llm` builds the markdown of a page from layout boxes, and it walks the spans of a box in the
order they sit in `box.textlines`. That order is by the top edge of each span. On a page where two
different things stand side by side, sorting by the top edge reads across the gap between them instead
of down one and then the other.

Two shapes of that fault were measured on the owner's PDF book:

- A box label. "CHAPTER" and "PREVIEW" are two lines of a heading at the left of the column, and the
  first lines of the paragraph sit to the right of them. The engine gave CHAPTER, then a line of the
  paragraph, then PREVIEW, so the label's second word landed inside a word the layout had cut in two:
  the reader saw `consumPREVIEW`, and `ers` arrived as a paragraph of its own.
- A drop cap. The large first letter of a story sits to the left of the first three lines, so the
  engine put it after them, and the story opened with `ou` instead of `You`.

The rule here is the one the finding asked for, one level down from the page. Inside a box, find a
vertical gap that no span crosses AND no block of the PDF crosses either. Read everything left of it,
then everything right of it, and look at each side again in case it holds a gap of its own.

Nothing is guessed. The gap must already be in the PDF, and the PDF's own blocks must agree that the two
sides are two different things. That second part carries the weight: a gap inside one block is a space
between two words. One page of the trading book holds a line whose every word is a span of its own, and
the space before its seventh word is as wide as the space beside a drop cap, so without the block test
that sentence would have been read in two halves with a word from the line below wedged between them.

What it does not do. It moves spans and never changes one: the letters of a page are the same letters
after it, in another order. It cannot join a word the layout cut in two - it only puts the two halves
next to each other, so that `ingest/layout_stitcher.py` can join them by its own rules (CQ-03).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import pymupdf4llm
from pymupdf4llm.helpers.document_layout import parse_document

__all__ = ["gap_in", "in_reading_order", "put_in_column_order", "spans_of", "to_markdown_in_reading_order"]

# A span may hang over the gap by this much and still count as being wholly on one side of it. Half a
# point is below the width of a space at any size this book uses, so it cannot swallow a real gap.
NUDGE = 0.5

# Two spans cannot show a column and a gap between them: one of the sides would hold a single span and
# there would be nothing to read in an order.
FEWEST_SPANS = 3

#: One span of text as the layout engine gives it: the rectangle it covers, the block and the line of
#: the PDF it came from, its font size and its words.
Span = dict[str, Any]

NO_LAYOUT_ENGINE = (
    "The reading order of a page comes from the pymupdf layout engine, and this environment has none. "
    "Install `pymupdf-layout`, which `packages/ingestion/requirements.lock` pins to the version of "
    "`pymupdf`. Without it every page with two things side by side is read across the gap again (CQ-07)."
)


def spans_of(box: Any) -> list[Span]:
    """Every span of a layout box, in the order the markdown step reads them."""
    return [span for line in box.textlines or [] for span in line.get("spans", [])]


def gap_in(spans: Sequence[Span]) -> float | None:
    """The x of the widest vertical gap that no span crosses, or None when the box holds no two sides.

    Three things must hold, and each of them comes from the PDF and not from a guess:

    - No span crosses the gap. A candidate is the right edge of a span, so the gap is one the PDF
      already has.
    - No block of the PDF crosses it either. This is the one that matters. A gap inside a block is a
      space between two words, not a boundary between two columns: one page of Mind Over Markets holds
      a line whose every word is a span of its own, and the 4-point space before its seventh word looks
      exactly like the 4-point space beside a drop cap. A column never cuts a block in half, so a gap
      that does is not a column.
    - The two sides share some height. Side by side is the fault; one thing above another is a normal
      page and is left alone.
    """
    if len(spans) < FEWEST_SPANS:
        return None
    widest: tuple[float, float] | None = None  # (width of the gap, its x)
    for candidate in sorted({span["bbox"][2] for span in spans}):
        left = [span for span in spans if span["bbox"][2] <= candidate + NUDGE]
        right = [span for span in spans if span["bbox"][0] >= candidate - NUDGE]
        if not left or not right or len(left) + len(right) != len(spans):
            continue
        if {span["block"] for span in left} & {span["block"] for span in right}:
            continue
        if not _share_a_height(left, right):
            continue
        width = min(span["bbox"][0] for span in right) - candidate
        if width > 0 and (widest is None or width > widest[0]):
            widest = (width, candidate)
    return None if widest is None else widest[1]


def _share_a_height(left: Sequence[Span], right: Sequence[Span]) -> bool:
    """True when some span on the left stands beside some span on the right."""
    return any(
        one["bbox"][1] < other["bbox"][3] and other["bbox"][1] < one["bbox"][3] for one in left for other in right
    )


def in_reading_order(spans: Sequence[Span]) -> list[Span]:
    """The spans of one box, left of the gap first and then right of it, as deep as the gaps go.

    A page can hold a column inside a column: a two-column index whose page number stands further right
    again, or a drop cap inside the left column of two. So the rule is applied to each side of a gap as
    well, until no side holds one. Where no gap is found, the order is left exactly as it was, because
    the engine's own order down a single column is already the order a reader reads.
    """
    gap = gap_in(spans)
    if gap is None:
        return list(spans)
    left = [span for span in spans if span["bbox"][2] <= gap + NUDGE]
    right = [span for span in spans if span["bbox"][0] >= gap - NUDGE]
    return in_reading_order(left) + in_reading_order(right)


def put_in_column_order(box: Any) -> bool:
    """Read every column of a box in turn. True when this changed the order.

    The lines of the box are built again from the new order of its spans. Spans that sat in one line of
    the PDF and still stand next to each other keep that line, because the markdown step asks a line
    whether it is a footnote or a piece of code, and those answers must still be about a real line.
    """
    spans = spans_of(box)
    in_order = in_reading_order(spans)
    if in_order == spans:
        return False
    box.textlines = _lines_from(in_order)
    return True


def _lines_from(spans: Sequence[Span]) -> list[Span]:
    """Lines built from spans in reading order, keeping a line of the PDF whole where it survived."""
    lines: list[Span] = []
    last: tuple[Any, Any] | None = None
    for span in spans:
        here = (span["block"], span["line"])
        if lines and here == last:
            lines[-1]["spans"].append(span)
            lines[-1]["bbox"] = _around(lines[-1]["bbox"], span["bbox"])
        else:
            lines.append({"bbox": tuple(span["bbox"]), "spans": [span]})
        last = here
    return lines


def _around(one: Sequence[float], other: Sequence[float]) -> tuple[float, float, float, float]:
    """The smallest rectangle holding both."""
    return (min(one[0], other[0]), min(one[1], other[1]), max(one[2], other[2]), max(one[3], other[3]))


def to_markdown_in_reading_order(
    doc: Any,
    *,
    pages: Sequence[int] | None = None,
    write_images: bool = False,
    image_path: str = "",
    image_dpi: int = 150,
    image_format: str = "png",
) -> str:
    """The markdown of `pages`, with every box read in column order.

    This is `pymupdf4llm.to_markdown` with one step added between reading the page and writing the
    markdown. Every other argument is passed exactly as that function passes it, including the two it
    does not leave at the default of `parse_document`: `force_text=True`, so the text drawn over a
    picture is still written out, and `use_ocr=True`, so a page that needs OCR still gets it.

    The markdown is written once. `ParsedDocument.to_markdown` is not safe to call twice on the same
    parse: on one page of the owner's book every call added 1,160 letters to the answer.
    """
    if not pymupdf4llm._use_layout:
        raise RuntimeError(NO_LAYOUT_ENGINE)
    parsed = parse_document(
        doc,
        pages=list(pages) if pages is not None else None,
        write_images=write_images,
        image_path=image_path,
        image_dpi=image_dpi,
        image_format=image_format,
        force_text=True,
        use_ocr=True,
        show_progress=False,
    )
    for page in parsed.pages:
        for box in page.boxes:
            put_in_column_order(box)
    markdown = parsed.to_markdown(write_images=write_images, show_progress=False)
    if not isinstance(markdown, str):
        # The library gives back a list of pages only when it is asked for page chunks, and it never is
        # here. A list would mean the library changed, and writing it into a chapter file as a string
        # would put `[{'text': ...}]` into the book.
        raise TypeError(f"The markdown step gave back {type(markdown).__name__} and not the text of the pages.")
    return markdown
