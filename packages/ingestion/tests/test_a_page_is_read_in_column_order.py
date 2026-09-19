"""A page with two things side by side is read down one and then the other, not across (CQ-07).

Every rectangle in this file was measured on the owner's two PDF books and is written down with the page
it came from. The words are ours: no line of either book is in this repository.

Why the shapes are written down instead of built here. A PDF built in a test does not show this fault.
Two were tried: a two-line label beside a paragraph, and a page of two columns. The layout engine put
both of them in the right order on its own. The fault needs the pages of a real book, where the engine
merges two different things into one box and then reads them by their top edge. So the rule is proved
against the geometry those pages really have, and the whole path is proved to give exactly what the
library gives on a page built here, where nothing stands side by side.

A row of a shape is (rectangle, the PDF's block, the line inside that block, the font size, the words,
the line of the BOX the engine put it in). The last one matters: on page 121 the engine put a word of the
label and a line of the paragraph into one line of the box, which is how the two ran together.
"""

from __future__ import annotations

from inspect import signature
from pathlib import Path
from typing import Any

import pymupdf
import pymupdf4llm
import pytest
from ingest import reading_order
from ingest.reading_order import (
    NO_LAYOUT_ENGINE,
    gap_in,
    in_reading_order,
    put_in_column_order,
    spans_of,
    to_markdown_in_reading_order,
)
from pymupdf4llm.helpers.document_layout import LayoutBox, ParsedDocument, parse_document

# --------------------------------------------------------------------------------------------------
# The shapes, measured on the real books
# --------------------------------------------------------------------------------------------------

#: Page 121 of the marketing textbook, box 7. "CHAPTER" and "PREVIEW" are two lines of a 13-point label
#: at the left of the column; the first two lines of the paragraph are 9-point and sit to the right of
#: them. The engine gave them by top edge, and it put CHAPTER and the paragraph's first line into ONE
#: line of the box. That is how the label's second word landed inside a word the layout had cut in two.
A_LABEL_BESIDE_A_PARAGRAPH = [
    ((27.5, 402.6, 95.8, 412.3), 3, 0, 13.0, "CHAPTER", 0),
    ((102.2, 402.7, 279.6, 410.9), 0, 0, 9.0, "This line of the paragraph ends in the middle of custom-", 0),
    ((102.2, 414.7, 277.2, 423.0), 0, 1, 9.0, "ers, which is where the next line of it begins.", 1),
    ((27.5, 417.8, 88.6, 427.1), 3, 1, 13.0, "PREVIEW", 2),
]

#: Page 121 again, box 12. A drop cap: one letter 63.6 points tall at the left, and the first four lines
#: of the story to the right of it. The engine put the letter after three of those lines, so the story
#: opened with the rest of its first word.
A_DROP_CAP_BESIDE_A_STORY = [
    ((60.9, 601.7, 277.2, 610.8), 14, 0, 9.0, "ou may already know the company that", 0),
    ((60.9, 614.7, 279.4, 623.8), 14, 1, 9.0, "counts what people watch and buy, and", 1),
    ((60.9, 627.7, 279.4, 636.8), 14, 2, 9.0, "what it does with the numbers it keeps.", 2),
    ((27.4, 601.8, 56.8, 647.2), 13, 1, 63.6, "Y", 3),
    ((60.9, 640.7, 279.4, 649.8), 14, 3, 9.0, "The rest of the story follows here.", 3),
]

#: Page 77 of the trading book, box 4. ONE line of 12-point text whose every word is a span of its own,
#: and one word of the next block below it. The 4.1-point space before the seventh word is exactly as
#: wide as the space beside the drop cap above. Reading the left of it and then the right would break the
#: sentence, so nothing here may move.
ONE_LINE_WRITTEN_WORD_BY_WORD = [
    ((66.0, 226.4, 90.6, 236.9), 2, 0, 12.0, "Which", 0),
    ((94.7, 226.4, 109.7, 236.9), 2, 0, 12.0, "way", 0),
    ((113.7, 226.4, 119.5, 236.9), 2, 0, 12.0, "is", 0),
    ((123.6, 226.4, 135.3, 236.9), 2, 0, 12.0, "the", 0),
    ((139.3, 226.4, 165.1, 236.9), 2, 0, 12.0, "market", 0),
    ((169.1, 226.4, 192.0, 236.9), 2, 0, 12.0, "trying", 0),
    ((196.1, 226.4, 203.4, 236.9), 2, 0, 12.0, "to", 0),
    ((207.4, 226.4, 220.0, 236.9), 2, 0, 12.0, "go", 0),
    ((77.9, 240.0, 93.0, 247.6), 3, 0, 12.0, "and", 1),
]

#: Page 365 of the trading book, box 1, the start of its index, cut down to the first eleven spans. Two
#: columns of entries, and a page number further right again. The engine put one entry of each column on
#: one line of the box, so it read across. The WIDEST gap on the page is the one before that page number,
#: not the one between the columns, which is why each side of a gap is looked at again.
A_TWO_COLUMN_INDEX = [
    ((54.1, 260.2, 98.5, 269.6), 1, 0, 11.0, "Acceptance", 0),
    ((221.5, 259.6, 286.3, 266.6), 11, 0, 11.0, "Balanced market", 0),
    ((65.0, 272.6, 180.0, 282.8), 2, 0, 11.0, "open to accepting a price", 1),
    ((232.4, 272.6, 364.9, 281.4), 12, 0, 11.0, "balance found and held for a day", 1),
    ((65.0, 285.5, 191.2, 295.5), 2, 1, 11.0, "open to accepting a range as well", 2),
    ((232.4, 285.5, 358.1, 295.7), 12, 1, 11.0, "estimating where the balance sits", 2),
    ((76.0, 299.0, 128.4, 308.7), 3, 0, 11.0, "range of it", 3),
    ((243.3, 298.9, 268.4, 305.5), 13, 0, 11.0, "day of", 3),
    ((65.0, 311.4, 165.6, 321.4), 3, 1, 11.0, "open to a wider range", 4),
    ((232.4, 311.4, 366.4, 320.2), 13, 1, 11.0, "and the day the balance held", 4),
    ((408.9, 320.2, 425.0, 327.5), 21, 0, 12.0, "365", 5),
]

#: An ordinary paragraph: every line is one span of one block, and every line runs the width of the
#: column. There is no gap for a rule to find, and nothing may move.
AN_ORDINARY_PARAGRAPH = [
    ((72.0, 100.0, 400.0, 110.0), 0, 0, 10.0, "The first line of a paragraph that runs the whole", 0),
    ((72.0, 112.0, 400.0, 122.0), 0, 1, 10.0, "width of its column, as most lines of a book do,", 1),
    ((72.0, 124.0, 340.0, 134.0), 0, 2, 10.0, "and a last line that stops short of the edge.", 2),
]

#: A paragraph with a phrase in bold in the middle of its first line. Three spans of ONE block sit on one
#: line, so a gap between two of them is a space inside a block and never a column.
A_BOLD_PHRASE_INSIDE_A_LINE = [
    ((72.0, 100.0, 180.0, 110.0), 0, 0, 10.0, "A sentence with", 0),
    ((184.0, 100.0, 260.0, 110.0), 0, 0, 10.0, "two bold words", 0),
    ((264.0, 100.0, 400.0, 110.0), 0, 0, 10.0, "and then the rest of the line.", 0),
    ((72.0, 112.0, 400.0, 122.0), 0, 1, 10.0, "The second line of the same paragraph.", 1),
]

#: A heading above a paragraph, both starting at the left margin. They never stand side by side.
ONE_THING_ABOVE_ANOTHER = [
    ((72.0, 100.0, 200.0, 114.0), 0, 0, 14.0, "A heading", 0),
    ((72.0, 130.0, 400.0, 140.0), 1, 0, 10.0, "The first line of the paragraph under it.", 1),
    ((72.0, 142.0, 400.0, 152.0), 1, 1, 10.0, "The second line of the same paragraph.", 2),
]

#: A drop cap and a single line beside it: two spans, so neither side holds anything to order.
A_DROP_CAP_AND_ONE_LINE = [
    ((27.0, 100.0, 56.0, 140.0), 0, 0, 40.0, "T", 0),
    ((60.0, 100.0, 400.0, 110.0), 1, 0, 10.0, "he story starts here.", 0),
]

#: A label and the paragraph beside it whose rectangles INTERLOCK by a tenth of a point: the label's first
#: line ends at 56.4 and the paragraph's first line starts at 56.3. A rectangle from a PDF is not exact, so
#: a hair of overlap is normal. Without the half-point of give, no gap can be found here at all: the gap at
#: 56.2 leaves the 56.4 span on neither side, and the gap at 56.4 leaves the 56.3 span on neither side.
A_LABEL_AND_A_PARAGRAPH_THAT_INTERLOCK = [
    ((27.0, 100.0, 56.4, 112.0), 0, 0, 12.0, "One", 0),
    ((27.0, 114.0, 56.2, 126.0), 0, 1, 12.0, "Two", 1),
    ((56.3, 100.0, 400.0, 112.0), 1, 0, 10.0, "The line beside them.", 0),
    ((60.0, 114.0, 400.0, 126.0), 1, 1, 10.0, "And the next line.", 1),
]

#: A note at the top right of a page and the paragraph below it at the left. Every span falls cleanly on one
#: side of x=150 and the two blocks do not mix, so only the test that they must share some HEIGHT keeps this
#: page alone. Without it the paragraph would be read before the note that stands above it.
A_NOTE_ABOVE_AND_TO_THE_RIGHT = [
    ((200.0, 100.0, 400.0, 112.0), 0, 0, 9.0, "A note that stands above the text", 0),
    ((27.0, 130.0, 150.0, 142.0), 1, 0, 10.0, "The first line of the paragraph below it.", 1),
    ((27.0, 144.0, 150.0, 156.0), 1, 1, 10.0, "The second line of that paragraph.", 2),
]

#: The page-121 shape with one change of our own: the paragraph's first line is written as TWO spans, which
#: is what happens wherever a phrase of a paragraph is in bold. It is here because the four shapes above
#: never put two spans of one line next to each other after the move, so nothing else proves that a line is
#: built again with both of them and with a rectangle that holds them.
A_LABEL_BESIDE_A_PARAGRAPH_IN_TWO_SPANS = [
    ((27.5, 402.6, 95.8, 412.3), 3, 0, 13.0, "CHAPTER", 0),
    ((102.2, 402.7, 190.0, 410.9), 0, 0, 9.0, "This line of the paragraph", 0),
    ((193.0, 402.7, 279.6, 410.9), 0, 0, 9.0, "ends in the middle of custom-", 0),
    ((102.2, 414.7, 277.2, 423.0), 0, 1, 9.0, "ers, which is where the next line begins.", 1),
    ((27.5, 417.8, 88.6, 427.1), 3, 1, 13.0, "PREVIEW", 2),
]

EVERY_SHAPE = {
    "a label beside a paragraph": (A_LABEL_BESIDE_A_PARAGRAPH, 4),
    "a drop cap beside a story": (A_DROP_CAP_BESIDE_A_STORY, 5),
    "one line written word by word": (ONE_LINE_WRITTEN_WORD_BY_WORD, 9),
    "a two-column index": (A_TWO_COLUMN_INDEX, 11),
    "an ordinary paragraph": (AN_ORDINARY_PARAGRAPH, 3),
    "a bold phrase inside a line": (A_BOLD_PHRASE_INSIDE_A_LINE, 4),
    "one thing above another": (ONE_THING_ABOVE_ANOTHER, 3),
    "a drop cap and one line": (A_DROP_CAP_AND_ONE_LINE, 2),
    "a label and a paragraph that interlock": (A_LABEL_AND_A_PARAGRAPH_THAT_INTERLOCK, 4),
    "a note above and to the right": (A_NOTE_ABOVE_AND_TO_THE_RIGHT, 3),
    "a label beside a paragraph in two spans": (A_LABEL_BESIDE_A_PARAGRAPH_IN_TWO_SPANS, 5),
}

MOVES = (
    A_LABEL_AND_A_PARAGRAPH_THAT_INTERLOCK,
    A_LABEL_BESIDE_A_PARAGRAPH,
    A_DROP_CAP_BESIDE_A_STORY,
    A_TWO_COLUMN_INDEX,
    A_LABEL_BESIDE_A_PARAGRAPH_IN_TWO_SPANS,
)
STAYS = (
    ONE_LINE_WRITTEN_WORD_BY_WORD,
    AN_ORDINARY_PARAGRAPH,
    A_BOLD_PHRASE_INSIDE_A_LINE,
    ONE_THING_ABOVE_ANOTHER,
    A_DROP_CAP_AND_ONE_LINE,
    A_NOTE_ABOVE_AND_TO_THE_RIGHT,
)


# --------------------------------------------------------------------------------------------------
# Building the shapes into the dictionaries the library uses
# --------------------------------------------------------------------------------------------------


def a_span(row: tuple) -> dict:
    """One span, with the keys the layout engine puts on one."""
    rect, block, line, size, text, _line_of_the_box = row
    return {
        "bbox": rect,
        "block": block,
        "line": line,
        "size": size,
        "text": text,
        "font": "Test-Roman",
        "flags": 0,
        "char_flags": 0,
        "origin": (rect[0], rect[3]),
        "ascender": 0.8,
        "descender": -0.2,
    }


def spans_from(shape: list[tuple]) -> list[dict]:
    return [a_span(row) for row in shape]


class FakeBox:
    """A layout box, as far as this module reads one: a class and a list of lines holding spans."""

    def __init__(self, textlines: list[dict] | None, boxclass: str = "text") -> None:
        self.textlines = textlines
        self.boxclass = boxclass


def a_box(shape: list[tuple]) -> FakeBox:
    """A box whose lines are the lines the engine really made, which the last field of a row names."""
    lines: dict[int, dict] = {}
    for row in shape:
        span = a_span(row)
        where = row[5]
        if where in lines:
            lines[where]["spans"].append(span)
            lines[where]["bbox"] = _around(lines[where]["bbox"], span["bbox"])
        else:
            lines[where] = {"bbox": tuple(span["bbox"]), "spans": [span]}
    return FakeBox([lines[where] for where in sorted(lines)])


def _around(one: tuple, other: tuple) -> tuple[float, float, float, float]:
    return (min(one[0], other[0]), min(one[1], other[1]), max(one[2], other[2]), max(one[3], other[3]))


def words_of(box: Any) -> list[str]:
    return [span["text"] for span in spans_of(box)]


def a_pdf_of_plain_paragraphs(path: Path, pages: int = 2) -> Path:
    """A PDF with nothing side by side: one column of text, written line by line."""
    doc = pymupdf.open()
    for number in range(pages):
        page = doc.new_page(width=420, height=600)
        page.insert_text((60, 80), f"Page {number + 1} of a plain book", fontsize=14, fontname="hebo")
        for i in range(12):
            page.insert_text(
                (60, 120 + i * 16),
                f"Line {i + 1} of a paragraph that runs the width of the column and no further.",
                fontsize=9,
                fontname="helv",
            )
    doc.save(str(path))
    doc.close()
    return path


# --------------------------------------------------------------------------------------------------
# The shapes themselves must be real, or every test below proves nothing (TL-04)
# --------------------------------------------------------------------------------------------------


@pytest.mark.parametrize("name", sorted(EVERY_SHAPE))
def test_every_shape_holds_the_spans_it_claims(name: str) -> None:
    """A shape that lost its rows would make the test of it pass while reading nothing."""
    shape, how_many = EVERY_SHAPE[name]
    assert len(shape) == how_many, f"{name} holds {len(shape)} spans"
    for rect, _block, _line, size, text, line_of_the_box in shape:
        assert rect[0] < rect[2] and rect[1] < rect[3], f"{name} holds an empty rectangle {rect}"
        assert size > 0 and text, f"{name} holds a span with no size or no words"
        assert line_of_the_box >= 0


def test_a_shape_builds_the_lines_the_engine_really_made() -> None:
    """Page 121 held four spans in three lines, because two of them shared one."""
    box = a_box(A_LABEL_BESIDE_A_PARAGRAPH)
    assert len(box.textlines or []) == 3
    assert len(box.textlines[0]["spans"]) == 2, "the label's first word shares a line with the paragraph's"
    assert len(spans_of(box)) == 4


# --------------------------------------------------------------------------------------------------
# Finding the gap
# --------------------------------------------------------------------------------------------------


def test_a_label_beside_a_paragraph_is_two_things_with_a_gap_between_them() -> None:
    gap = gap_in(spans_from(A_LABEL_BESIDE_A_PARAGRAPH))
    assert gap == pytest.approx(95.8), "the gap is the right edge of the widest line of the label"


def test_a_drop_cap_is_one_thing_and_the_lines_beside_it_are_another() -> None:
    assert gap_in(spans_from(A_DROP_CAP_BESIDE_A_STORY)) == pytest.approx(56.8)


def test_a_space_between_two_words_of_one_block_is_not_a_gap_between_two_columns() -> None:
    """The whole reason the rule asks the PDF about its blocks.

    Every word of that line is block 2, so a gap inside it would cut block 2 in half, and a column never
    does that. Without this the sentence of page 77 came out as "Which way is the market trying", then
    the word from the line below, then "to go".
    """
    assert gap_in(spans_from(ONE_LINE_WRITTEN_WORD_BY_WORD)) is None


def test_a_bold_phrase_inside_a_line_is_not_a_gap_between_two_columns() -> None:
    assert gap_in(spans_from(A_BOLD_PHRASE_INSIDE_A_LINE)) is None


def test_an_ordinary_paragraph_holds_no_gap() -> None:
    assert gap_in(spans_from(AN_ORDINARY_PARAGRAPH)) is None


def test_two_things_one_above_the_other_are_not_two_columns() -> None:
    assert gap_in(spans_from(ONE_THING_ABOVE_ANOTHER)) is None


def test_a_note_above_and_to_the_right_is_not_a_column_beside_the_text() -> None:
    """The one shape that only the test of a shared height keeps alone.

    Every span of it falls cleanly on one side of x=150 and the two blocks do not mix, so without
    that test the paragraph would be read before the note standing above it.
    """
    assert gap_in(spans_from(A_NOTE_ABOVE_AND_TO_THE_RIGHT)) is None
    box = a_box(A_NOTE_ABOVE_AND_TO_THE_RIGHT)
    assert put_in_column_order(box) is False
    assert words_of(box)[0].startswith("A note"), "the note above the text is read first"


def test_a_box_of_two_spans_is_never_read_as_two_columns() -> None:
    """One span on each side of a gap leaves nothing to read in an order."""
    assert gap_in(spans_from(A_DROP_CAP_AND_ONE_LINE)) is None


def test_a_span_may_hang_over_the_gap_by_half_a_point() -> None:
    """Two rectangles that interlock by a tenth of a point still have a gap between them.

    Without the give, this page has no gap at all: the candidate at 56.2 leaves the 56.4 span on
    neither side, and the candidate at 56.4 leaves the 56.3 span on neither side.
    """
    assert gap_in(spans_from(A_LABEL_AND_A_PARAGRAPH_THAT_INTERLOCK)) == pytest.approx(56.2)
    box = a_box(A_LABEL_AND_A_PARAGRAPH_THAT_INTERLOCK)
    assert put_in_column_order(box) is True
    assert words_of(box)[:2] == ["One", "Two"]


def test_a_box_with_no_lines_at_all_holds_no_gap() -> None:
    assert gap_in([]) is None
    assert spans_of(FakeBox(None)) == []
    assert spans_of(FakeBox([])) == []
    assert put_in_column_order(FakeBox(None)) is False


# --------------------------------------------------------------------------------------------------
# Reading in the new order
# --------------------------------------------------------------------------------------------------


def test_the_label_is_read_before_the_paragraph_it_stood_beside() -> None:
    """The whole finding in one test.

    Today the reader is given CHAPTER, a line of the paragraph, another line, then PREVIEW, so PREVIEW
    lands inside the word the layout cut and the rest of that word opens the next paragraph. Both words
    of the label must come first.
    """
    box = a_box(A_LABEL_BESIDE_A_PARAGRAPH)
    assert words_of(box)[1].startswith("This line"), "the shape must start in the wrong order"
    assert put_in_column_order(box) is True
    assert words_of(box)[0] == "CHAPTER"
    assert words_of(box)[1] == "PREVIEW", "the second word of the label must not sit inside the paragraph"
    assert words_of(box)[2].endswith("custom-"), "the cut word now ends the last span before the next box"


def test_a_drop_cap_is_read_before_the_lines_it_stood_beside() -> None:
    """A second shape of the same fault, which the finding did not name.

    The big first letter of a story sits to the left of its first lines, so the engine gave it after
    them and the story opened with `ou` instead of `You`.
    """
    box = a_box(A_DROP_CAP_BESIDE_A_STORY)
    assert words_of(box)[0].startswith("ou "), "the shape must start with the tail of the first word"
    assert put_in_column_order(box) is True
    assert words_of(box)[0] == "Y"
    assert words_of(box)[1].startswith("ou "), "the letter and the rest of its word are now next to each other"


def test_an_index_is_read_down_one_column_and_then_the_other() -> None:
    box = a_box(A_TWO_COLUMN_INDEX)
    assert words_of(box)[:2] == ["Acceptance", "Balanced market"], "the shape must start by reading across"
    assert put_in_column_order(box) is True
    words = words_of(box)
    first_column = [row[4] for row in A_TWO_COLUMN_INDEX if row[0][2] < 200]
    second_column = [row[4] for row in A_TWO_COLUMN_INDEX if 200 < row[0][0] < 380]
    assert len(first_column) == len(second_column) == 5, "the shape must hold both columns"
    assert [w for w in words if w in first_column] == first_column, "a column keeps its own order"
    assert max(words.index(w) for w in first_column) < min(words.index(w) for w in second_column), (
        "the whole of one column must come before the whole of the other"
    )


def test_a_column_inside_a_column_is_found_too() -> None:
    """Why each side of a gap is looked at again.

    On the index page the widest gap is the one before the page number at the far right, not the one
    between the two columns of entries. Splitting only at the widest gap would move that number and
    leave the two columns interleaved.
    """
    box = a_box(A_TWO_COLUMN_INDEX)
    put_in_column_order(box)
    assert words_of(box)[0] == "Acceptance"
    assert words_of(box)[-1] == "365", "the number at the far right is read last"


@pytest.mark.parametrize(
    "shape",
    STAYS,
    ids=["word-by-word", "paragraph", "bold-phrase", "stacked", "two-spans", "note-above"],
)
def test_a_shape_with_no_two_columns_is_left_exactly_as_it_was(shape: list[tuple]) -> None:
    box = a_box(shape)
    before = list(box.textlines or [])
    assert put_in_column_order(box) is False
    assert box.textlines == before


def test_the_sentence_written_word_by_word_still_runs_in_one_piece() -> None:
    box = a_box(ONE_LINE_WRITTEN_WORD_BY_WORD)
    put_in_column_order(box)
    assert words_of(box)[5:8] == ["trying", "to", "go"]


@pytest.mark.parametrize("shape", MOVES, ids=["interlock", "label", "drop-cap", "index", "label-two-spans"])
def test_no_span_is_lost_or_written_twice_by_the_move(shape: list[tuple]) -> None:
    """The letters of a page are the same letters afterwards, in another order."""
    box = a_box(shape)
    before = sorted(span["text"] for span in spans_of(box))
    put_in_column_order(box)
    assert sorted(span["text"] for span in spans_of(box)) == before
    assert len(spans_of(box)) == len(shape)


@pytest.mark.parametrize("shape", MOVES, ids=["interlock", "label", "drop-cap", "index", "label-two-spans"])
def test_a_second_run_changes_nothing_more(shape: list[tuple]) -> None:
    """The new order is already the right order, so reading it again must move nothing."""
    box = a_box(shape)
    assert put_in_column_order(box) is True
    assert put_in_column_order(box) is False


def test_the_spans_are_moved_and_never_copied_or_changed() -> None:
    spans = spans_from(A_LABEL_BESIDE_A_PARAGRAPH)
    ordered = in_reading_order(spans)
    assert len(ordered) == len(spans)
    for span in ordered:
        assert any(span is original for original in spans), "a span was copied instead of moved"


# --------------------------------------------------------------------------------------------------
# Building the lines again
# --------------------------------------------------------------------------------------------------


def test_a_line_the_gap_runs_through_becomes_two_lines() -> None:
    """On page 121 one line of the box held a word of the label and a line of the paragraph."""
    box = a_box(A_LABEL_BESIDE_A_PARAGRAPH)
    assert len(box.textlines or []) == 3
    put_in_column_order(box)
    assert len(box.textlines or []) == 4, "the label and the paragraph are no longer in one line"
    for line in box.textlines or []:
        assert len({span["block"] for span in line["spans"]}) == 1, "a line still holds two blocks"


def test_a_line_that_the_gap_misses_stays_one_line() -> None:
    """The markdown step asks a line whether it is a footnote or code, so a line must stay a line."""
    box = a_box(A_TWO_COLUMN_INDEX)
    put_in_column_order(box)
    assert all(len(line["spans"]) == 1 for line in box.textlines or []), (
        "every line of that index held one entry of each column, so every one of them is split"
    )
    sat_together = a_box(A_BOLD_PHRASE_INSIDE_A_LINE)
    assert len(sat_together.textlines[0]["spans"]) == 3
    put_in_column_order(sat_together)
    assert len(sat_together.textlines[0]["spans"]) == 3, "a line no gap runs through keeps all its spans"


def test_two_spans_of_one_line_that_stay_together_are_built_back_into_one_line() -> None:
    """A line the gap misses keeps every span it had, and its rectangle grows to hold them."""
    box = a_box(A_LABEL_BESIDE_A_PARAGRAPH_IN_TWO_SPANS)
    assert put_in_column_order(box) is True
    sizes = [len(line["spans"]) for line in box.textlines or []]
    assert sizes == [1, 1, 2, 1], f"the paragraph's two spans must come back as one line, got {sizes}"
    assert words_of(box)[:2] == ["CHAPTER", "PREVIEW"]
    for line in box.textlines or []:
        left = min(span["bbox"][0] for span in line["spans"])
        top = min(span["bbox"][1] for span in line["spans"])
        right = max(span["bbox"][2] for span in line["spans"])
        bottom = max(span["bbox"][3] for span in line["spans"])
        assert tuple(line["bbox"]) == pytest.approx((left, top, right, bottom))


# --------------------------------------------------------------------------------------------------
# The whole path: the same answer as the library, everywhere the rule does not apply
# --------------------------------------------------------------------------------------------------


def test_a_page_with_nothing_side_by_side_gives_exactly_what_the_library_gives(tmp_path: Path) -> None:
    """The one test that protects every page of every book.

    The fix must be invisible where it does not apply. On the owner's marketing textbook, 113 of the 113
    pages where no box moved came out byte for byte the same; here the same is asked of a book built in
    the test.
    """
    pdf = a_pdf_of_plain_paragraphs(tmp_path / "plain.pdf", pages=2)
    doc = pymupdf.open(str(pdf))
    try:
        theirs = pymupdf4llm.to_markdown(doc, pages=[0, 1], show_progress=False)
        ours = to_markdown_in_reading_order(doc, pages=[0, 1])
    finally:
        doc.close()
    assert ours == theirs
    assert "Line 1 of a paragraph" in ours, "the markdown must hold the words of the page"


def test_only_the_pages_asked_for_are_read(tmp_path: Path) -> None:
    pdf = a_pdf_of_plain_paragraphs(tmp_path / "plain.pdf", pages=3)
    doc = pymupdf.open(str(pdf))
    try:
        second = to_markdown_in_reading_order(doc, pages=[1])
    finally:
        doc.close()
    assert "Page 2 of a plain book" in second
    assert "Page 1 of a plain book" not in second
    assert "Page 3 of a plain book" not in second


def test_reading_the_same_pages_twice_gives_the_same_answer(tmp_path: Path) -> None:
    """`ParsedDocument.to_markdown` is not safe to call twice on one parse.

    On page 55 of the owner's marketing textbook every call added 1,160 letters to the answer. So this
    function reads the page again for each answer and never writes out one parse twice.
    """
    pdf = a_pdf_of_plain_paragraphs(tmp_path / "plain.pdf", pages=1)
    doc = pymupdf.open(str(pdf))
    try:
        once = to_markdown_in_reading_order(doc, pages=[0])
        twice = to_markdown_in_reading_order(doc, pages=[0])
    finally:
        doc.close()
    assert once == twice


def test_it_names_the_package_to_install_when_there_is_no_layout_engine(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Without the layout engine the whole fix is off, so it must say so and not read the book anyway."""
    pdf = a_pdf_of_plain_paragraphs(tmp_path / "plain.pdf", pages=1)
    doc = pymupdf.open(str(pdf))
    monkeypatch.setattr(pymupdf4llm, "_use_layout", False)
    try:
        with pytest.raises(RuntimeError) as raised:
            to_markdown_in_reading_order(doc, pages=[0])
    finally:
        doc.close()
    assert "pymupdf-layout" in str(raised.value)
    assert "CQ-07" in NO_LAYOUT_ENGINE


def test_a_picture_of_a_page_is_written_where_it_is_told(tmp_path: Path) -> None:
    """The import writes a book's pictures into its own folder, so that argument must still arrive."""
    doc = pymupdf.open()
    page = doc.new_page(width=300, height=300)
    page.insert_text((40, 40), "A page that holds a picture", fontsize=11, fontname="helv")
    picture = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 120, 120))
    picture.set_rect(picture.irect, (200, 30, 30))
    page.insert_image(pymupdf.Rect(40, 80, 160, 200), pixmap=picture)
    pdf = tmp_path / "with-a-picture.pdf"
    doc.save(str(pdf))
    doc.close()

    assets = tmp_path / "assets"
    assets.mkdir()
    doc = pymupdf.open(str(pdf))
    try:
        to_markdown_in_reading_order(doc, pages=[0], write_images=True, image_path=str(assets))
    finally:
        doc.close()
    assert list(assets.iterdir()), "no picture was written into the folder it was given"


# --------------------------------------------------------------------------------------------------
# The parts of the library this depends on
# --------------------------------------------------------------------------------------------------


def test_the_library_still_has_the_parts_this_fix_reaches_into(tmp_path: Path) -> None:
    """This module reaches inside `pymupdf4llm`, so a new version could move what it holds on to.

    `requirements.lock` pins the version, and this test says what the pin protects: a parse that can be
    changed before it is written out, boxes that carry their lines, and spans that carry their rectangle
    and the block of the PDF they came from.
    """
    assert callable(parse_document)
    assert hasattr(ParsedDocument, "to_markdown")
    assert {"boxclass", "textlines"} <= set(LayoutBox.__dataclass_fields__)

    pdf = a_pdf_of_plain_paragraphs(tmp_path / "plain.pdf", pages=1)
    doc = pymupdf.open(str(pdf))
    try:
        parsed = parse_document(doc, pages=[0], show_progress=False, force_text=True, use_ocr=True)
        assert len(parsed.pages) == 1
        boxes = parsed.pages[0].boxes
        assert boxes, "a page of words gave no layout box"
        spans = [span for box in boxes for span in spans_of(box)]
        assert spans, "a page of words gave no span"
        for key in ("bbox", "block", "line", "size", "text"):
            assert key in spans[0], f"a span no longer carries {key!r}"
        assert len(spans[0]["bbox"]) == 4
    finally:
        doc.close()


def test_the_two_arguments_the_library_does_not_default_are_passed_on() -> None:
    """`parse_document` and the wrapper that normally calls it do NOT agree on two arguments.

    `pymupdf4llm.to_markdown` passes `force_text=True`, so words drawn over a picture are still written
    out, and `use_ocr=True`, so a page that needs reading by eye still gets it. `parse_document` itself
    defaults to neither. Calling it directly and forgetting them would quietly drop text from a book, and
    no page built in a test shows it, because the engine calls such words text and not a picture.

    This also watches the library: if a version ever changes those defaults, the first two checks fail and
    say that the pass-through has stopped carrying weight.
    """
    defaults = signature(parse_document).parameters
    assert defaults["force_text"].default is False, "force_text no longer needs passing; say so here"
    assert defaults["use_ocr"].default is not True, "use_ocr no longer needs passing; say so here"

    source = Path(reading_order.__file__).read_text(encoding="utf-8")
    assert "force_text=True," in source, "the words drawn over a picture would be dropped"
    assert "use_ocr=True," in source, "a page that needs reading by eye would be left blank"


def test_the_markdown_step_walks_the_lines_in_the_order_the_box_holds_them(tmp_path: Path) -> None:
    """The fix works only because the order of the spans IS the order of the markdown.

    If a new version sorted the lines again before writing them, moving them would change nothing and
    every test above would still pass. So this asks the library directly: turn one box's lines around,
    and the words must come out turned around.
    """
    pdf = a_pdf_of_plain_paragraphs(tmp_path / "plain.pdf", pages=1)
    doc = pymupdf.open(str(pdf))
    try:
        parsed = parse_document(doc, pages=[0], show_progress=False, force_text=True, use_ocr=True)
        box = max(parsed.pages[0].boxes, key=lambda one: len(spans_of(one)))
        assert len(box.textlines or []) >= 3, "the biggest box of the page holds too few lines to turn around"
        first_words = spans_of(box)[0]["text"]
        last_words = spans_of(box)[-1]["text"]
        box.textlines = list(reversed(box.textlines))
        written = parsed.to_markdown(show_progress=False)
    finally:
        doc.close()
    assert written.index(last_words) < written.index(first_words), (
        "the markdown did not follow the order of the lines, so moving spans cannot fix a reading order"
    )
