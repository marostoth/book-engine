"""A page with no text is no chapter, a chapter's name says what a reader reads, and a dead link goes (CQ-04).

The Wealth of Nations gave `ch-03` to a page that held nothing but "BOOK I. ...": a reader opened it and found
nothing to read, and it made no practice card, because it had no sentence. The same book put "BOOK III." and
"BOOK V." in one document with their first chapter, so the list of chapters called those chapters "BOOK III." and
"BOOK V." and never showed "CHAPTER I. OF THE NATURAL PROGRESS OF OPULENCE" at all. And the contents kept an entry
for the license of Project Gutenberg, which the import leaves out, so tapping it did nothing.

Every test here makes its own little book, so none of them needs a book of yours.
"""

import json
import re
import zipfile
from pathlib import Path

import pytest
from ingest.chapter_shape import (
    CHAPTER_TITLE,
    DIVISION_TITLE,
    chapter_name,
    heading_words,
    holds_no_text,
    names_a_chapter,
)
from ingest.models import TOCItem
from ingest.pipeline import ingest_epub
from ingest.toc_links import without_entries_that_lead_nowhere

BOOK_ID = "opulence-notes"

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""
PACKAGE = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">opulence-notes</dc:identifier>
    <dc:title>Opulence Notes</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    {manifest}
  </manifest>
  <spine>{spine}</spine>
</package>
"""
NAV = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol>{entries}</ol></nav></body>
</html>
"""
DOCUMENT = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Opulence Notes</title></head>
<body>{body}</body>
</html>
"""

# A paragraph of an ordinary chapter. It used to have to be long: a page of under 20 letters was dropped
# as blank, and five test files worked around that instead of pinning it. The length is gone now (CQ-09).
PARAGRAPH = (
    "<p>The great commerce of every civilized society is that carried on between the inhabitants of the town "
    "and those of the country.</p>"
)
SECOND = "<p>The country supplies the town with the means of subsistence and the materials of manufacture.</p>"


def make_epub(path: Path, documents: dict[str, str], entries: list[tuple[str, str]]) -> Path:
    """An EPUB with a document for each body of `documents`, and a contents of `(href, title)` entries."""
    manifest = "".join(
        f'<item id="d{n}" href="{name}" media-type="application/xhtml+xml"/>' for n, name in enumerate(documents)
    )
    spine = "".join(f'<itemref idref="d{n}"/>' for n in range(len(documents)))
    links = "".join(f'<li><a href="{href}">{title}</a></li>' for href, title in entries)
    with zipfile.ZipFile(path, "w") as book:
        book.writestr("mimetype", "application/epub+zip")
        book.writestr("META-INF/container.xml", CONTAINER)
        book.writestr("OEBPS/content.opf", PACKAGE.format(manifest=manifest, spine=spine))
        book.writestr("OEBPS/nav.xhtml", NAV.format(entries=links))
        for name, body in documents.items():
            book.writestr(f"OEBPS/{name}", DOCUMENT.format(body=body))
    return path


def import_book(folder: Path, documents: dict[str, str], entries: list[tuple[str, str]] = ()):
    """Imports a book into a new vault in `folder`, and gives its `_meta.json` as a dict and its folder."""
    ingest_epub(make_epub(folder / f"{BOOK_ID}.epub", documents, list(entries)), folder / "vault")
    book_dir = folder / "vault" / "books" / BOOK_ID
    return json.loads((book_dir / "_meta.json").read_text(encoding="utf-8")), book_dir


def blocks_of(book_dir: Path, name: str) -> list[str]:
    """The blocks of a chapter file, without their paragraph anchors."""
    text = (book_dir / name).read_text(encoding="utf-8")
    return [re.sub(r" \^p-\d{3}$", "", block) for block in text.split("\n\n")]


def entry(title: str, href: str = "", subitems: list[TOCItem] = ()) -> TOCItem:
    return TOCItem(id=title, title=title, href=href, level=1, subitems=list(subitems))


# --- a page that holds no text of its own ---


def test_a_page_of_nothing_but_a_title_holds_no_text():
    assert holds_no_text(["## BOOK I. OF THE CAUSES OF IMPROVEMENT"])
    assert holds_no_text(["## BOOK I. OF THE CAUSES", "### A SECOND HEADING"])


def test_a_page_with_a_paragraph_holds_text():
    assert not holds_no_text(["## BOOK I. OF THE CAUSES", "The great commerce of every civilized society."])
    assert not holds_no_text(["The great commerce of every civilized society."])


def test_a_page_of_a_picture_or_a_table_holds_text():
    # Everything that is not a heading gets a paragraph anchor, so a reader has something to open and to highlight
    assert not holds_no_text(["![A supply curve](assets/figure.png)"])
    assert not holds_no_text(["Year | Price", "1202 | 0 12 0"])
    assert not holds_no_text(["> A line of a song."])


def test_a_page_with_nothing_at_all_holds_no_text_to_hold_over():
    assert not holds_no_text([])


# --- the name of a chapter ---


def test_the_name_of_a_chapter_is_its_first_heading():
    assert chapter_name(["## CHAPTER IV. OF DRAWBACKS.", "A paragraph."]) == "CHAPTER IV. OF DRAWBACKS."


def test_a_chapter_that_starts_a_book_is_named_after_the_chapter():
    name = chapter_name(
        [
            "## BOOK III. OF THE DIFFERENT PROGRESS OF OPULENCE IN DIFFERENT NATIONS",
            "## CHAPTER I. OF THE NATURAL PROGRESS OF OPULENCE.",
            "The great commerce of every civilized society.",
        ]
    )
    assert name == "CHAPTER I. OF THE NATURAL PROGRESS OF OPULENCE."


def test_a_book_title_with_its_own_text_keeps_its_name():
    # BOOK IV holds two paragraphs of Adam Smith and no chapter title, so the division is what a reader opens
    name = chapter_name(
        [
            "## BOOK IV. OF SYSTEMS OF POLITICAL ECONOMY.",
            "Political economy, considered as a branch of the science of a statesman.",
        ]
    )
    assert name == "BOOK IV. OF SYSTEMS OF POLITICAL ECONOMY."


def test_a_book_title_before_a_heading_that_names_no_chapter_keeps_its_name():
    # BOOK II is followed by "INTRODUCTION.", which tells a reader nothing, so the division is the better name
    name = chapter_name(
        [
            "## BOOK II. OF THE NATURE, ACCUMULATION, AND EMPLOYMENT OF STOCK.",
            "### INTRODUCTION.",
            "In that rude state of society.",
        ]
    )
    assert name == "BOOK II. OF THE NATURE, ACCUMULATION, AND EMPLOYMENT OF STOCK."


def test_a_chapter_title_that_comes_after_a_paragraph_does_not_take_the_name():
    name = chapter_name(
        [
            "## BOOK III. OF THE DIFFERENT PROGRESS OF OPULENCE",
            "A paragraph of the division itself.",
            "## CHAPTER I. OF THE NATURAL PROGRESS OF OPULENCE.",
        ]
    )
    assert name == "BOOK III. OF THE DIFFERENT PROGRESS OF OPULENCE"


def test_only_the_title_of_a_division_gives_up_the_name():
    # A foreword has words of its own, so it stays what a reader opens, even when a chapter title follows it
    name = chapter_name(
        [
            "## A FOREWORD TO THIS EDITION",
            "## CHAPTER I. OF THE NATURAL PROGRESS OF OPULENCE.",
            "A paragraph.",
        ]
    )
    assert name == "A FOREWORD TO THIS EDITION"


def test_a_chapter_before_a_book_title_keeps_its_own_name():
    name = chapter_name(
        [
            "## CHAPTER IX. OF THE AGRICULTURAL SYSTEMS.",
            "## APPENDIX TO BOOK IV",
            "A paragraph.",
        ]
    )
    assert name == "CHAPTER IX. OF THE AGRICULTURAL SYSTEMS."


def test_a_part_inside_a_chapter_is_too_small_to_name_it():
    # "#### PART I." marks a part of a chapter, not a chapter, so it never becomes the name
    assert chapter_name(["#### PART I. Of the Expense of Defence.", "A paragraph."]) is None
    assert names_a_chapter("### PART II. Of the Expense of Justice")
    assert not names_a_chapter("#### PART II. Of the Expense of Justice")


def test_blocks_with_no_heading_have_no_name():
    assert chapter_name(["A paragraph.", "Another paragraph."]) is None
    assert chapter_name([]) is None


def test_the_words_of_a_heading_come_without_its_marks():
    assert heading_words("###### A margin term") == "A margin term"
    assert heading_words("# A title") == "A title"


@pytest.mark.parametrize("title", ["BOOK I.", "Book 2:", "PART III.", "VOLUME IV", "volume 9"])
def test_a_division_of_a_book_is_known_by_its_title(title):
    assert DIVISION_TITLE.match(title)


@pytest.mark.parametrize("title", ["BOOKS OF THE WORLD", "PARTING WORDS", "A BOOK I READ"])
def test_a_sentence_about_books_is_no_division_title(title):
    assert not DIVISION_TITLE.match(title)


@pytest.mark.parametrize("title", ["CHAPTER I.", "Chapter 12:", "CHAP. IV."])
def test_a_chapter_is_known_by_its_title(title):
    assert CHAPTER_TITLE.match(title)


def test_a_word_that_starts_like_chapter_is_no_chapter_title():
    assert not CHAPTER_TITLE.match("CHAPTERS OF A LIFE")


# --- the import joins a title page to the chapter it introduces ---


def test_a_page_of_nothing_but_a_title_joins_the_chapter_after_it(tmp_path: Path):
    meta, book_dir = import_book(
        tmp_path,
        {
            "book1.xhtml": "<h2>BOOK I. OF THE CAUSES OF IMPROVEMENT IN THE PRODUCTIVE POWERS OF LABOUR.</h2>",
            "ch1.xhtml": f"<h2>CHAPTER I. OF THE DIVISION OF LABOUR.</h2>{PARAGRAPH}",
        },
    )

    assert meta["total_chapters"] == 1
    assert not (book_dir / "ch-02.md").exists()
    assert blocks_of(book_dir, "ch-01.md") == [
        "## BOOK I. OF THE CAUSES OF IMPROVEMENT IN THE PRODUCTIVE POWERS OF LABOUR.",
        "## CHAPTER I. OF THE DIVISION OF LABOUR.",
        "The great commerce of every civilized society is that carried on between the inhabitants of the town "
        "and those of the country.",
    ]
    # The reader's list names the chapter, not the division it opens
    assert meta["spine"][0]["title"] == "CHAPTER I. OF THE DIVISION OF LABOUR."
    assert meta["spine"][0]["anchor_count"] == 1


def test_no_chapter_of_an_import_is_left_without_a_paragraph(tmp_path: Path):
    meta, _ = import_book(
        tmp_path,
        {
            "book1.xhtml": "<h2>BOOK I. OF THE CAUSES OF IMPROVEMENT IN THE PRODUCTIVE POWERS OF LABOUR.</h2>",
            "ch1.xhtml": f"<h2>CHAPTER I. OF THE DIVISION OF LABOUR.</h2>{PARAGRAPH}",
            "book2.xhtml": "<h2>BOOK II. OF THE NATURE, ACCUMULATION, AND EMPLOYMENT OF STOCK.</h2>",
            "ch2.xhtml": f"<h2>CHAPTER I. OF THE DIVISION OF STOCK.</h2>{SECOND}",
        },
    )

    assert [s["anchor_count"] for s in meta["spine"]] == [1, 1]
    assert [s["title"] for s in meta["spine"]] == [
        "CHAPTER I. OF THE DIVISION OF LABOUR.",
        "CHAPTER I. OF THE DIVISION OF STOCK.",
    ]


def test_two_title_pages_in_a_row_both_join_the_chapter_after_them(tmp_path: Path):
    meta, book_dir = import_book(
        tmp_path,
        {
            "book1.xhtml": "<h2>BOOK I. OF THE CAUSES OF IMPROVEMENT IN THE PRODUCTIVE POWERS OF LABOUR.</h2>",
            "half.xhtml": "<h3>A HALF TITLE THAT STANDS ALONE ON ITS OWN PAGE</h3>",
            "ch1.xhtml": f"<h2>CHAPTER I. OF THE DIVISION OF LABOUR.</h2>{PARAGRAPH}",
        },
    )

    assert meta["total_chapters"] == 1
    assert blocks_of(book_dir, "ch-01.md")[:2] == [
        "## BOOK I. OF THE CAUSES OF IMPROVEMENT IN THE PRODUCTIVE POWERS OF LABOUR.",
        "### A HALF TITLE THAT STANDS ALONE ON ITS OWN PAGE",
    ]


def test_a_title_page_with_no_chapter_after_it_loses_no_word(tmp_path: Path):
    # The last page of a book can be a title with nothing after it. Its words still reach the reader.
    meta, book_dir = import_book(
        tmp_path,
        {
            "ch1.xhtml": f"<h2>CHAPTER I. OF THE DIVISION OF LABOUR.</h2>{PARAGRAPH}",
            "end.xhtml": "<h2>BOOK II. OF THE NATURE AND ACCUMULATION OF STOCK.</h2>",
        },
    )

    assert meta["total_chapters"] == 1
    # Nothing was written for it, and nothing of it was lost from the count either
    assert "BOOK II" not in (book_dir / "ch-01.md").read_text(encoding="utf-8")
    assert meta["total_words"] == sum(s["word_count"] for s in meta["spine"])


def test_a_page_of_a_picture_stays_a_chapter_of_its_own(tmp_path: Path):
    meta, _book_dir = import_book(
        tmp_path,
        {
            "plate.xhtml": "<h2>PLATE I. A VIEW OF THE HARBOUR AT LEITH IN THE YEAR 1776</h2><p>A view of the harbour.</p>",
            "ch1.xhtml": f"<h2>CHAPTER I. OF THE DIVISION OF LABOUR.</h2>{PARAGRAPH}",
        },
    )

    assert meta["total_chapters"] == 2
    assert meta["spine"][0]["title"] == "PLATE I. A VIEW OF THE HARBOUR AT LEITH IN THE YEAR 1776"


def test_the_contents_of_a_title_page_opens_the_chapter_that_holds_it(tmp_path: Path):
    meta, _ = import_book(
        tmp_path,
        {
            "book1.xhtml": "<h2>BOOK I. OF THE CAUSES OF IMPROVEMENT IN THE PRODUCTIVE POWERS OF LABOUR.</h2>",
            "ch1.xhtml": f"<h2>CHAPTER I. OF THE DIVISION OF LABOUR.</h2>{PARAGRAPH}",
        },
        [("book1.xhtml", "BOOK I. OF THE CAUSES"), ("ch1.xhtml", "CHAPTER I. OF THE DIVISION OF LABOUR.")],
    )

    division = next(it for it in meta["toc"] if it["title"].startswith("BOOK I."))
    assert division["href"] == "ch-01.md"
    # Its heading now stands at the top of that chapter, so the entry opens the top
    assert division["anchor"] is None


def test_a_contents_entry_inside_a_joined_chapter_opens_the_right_paragraph(tmp_path: Path):
    # Every block of the chapter moved down by the held-over heading, so every entry must move with it
    meta, book_dir = import_book(
        tmp_path,
        {
            "book1.xhtml": "<h2>BOOK I. OF THE CAUSES OF IMPROVEMENT IN THE PRODUCTIVE POWERS OF LABOUR.</h2>",
            "ch1.xhtml": (
                f"<h2>CHAPTER I. OF THE DIVISION OF LABOUR.</h2>{PARAGRAPH}"
                f'<h3 id="part2">PART II. Of the Price of Silver.</h3>{SECOND}'
            ),
        },
        [
            ("book1.xhtml", "BOOK I. OF THE CAUSES"),
            ("ch1.xhtml", "CHAPTER I. OF THE DIVISION OF LABOUR."),
            ("ch1.xhtml#part2", "PART II. Of the Price of Silver."),
        ],
    )

    assert blocks_of(book_dir, "ch-01.md")[3] == "### PART II. Of the Price of Silver."
    part = next(it for it in meta["toc"] if it["title"].startswith("PART II."))
    assert (part["href"], part["anchor"]) == ("ch-01.md", "^p-002")


# --- a contents entry that opens nothing ---


def test_an_entry_that_opens_nothing_goes():
    kept = without_entries_that_lead_nowhere([entry("CHAPTER I.", "ch-01.md"), entry("THE FULL LICENSE")])

    assert [it.title for it in kept] == ["CHAPTER I."]


def test_an_entry_that_only_groups_other_entries_stays():
    group = entry("Part I: Foundations", "", [entry("CHAPTER I.", "ch-01.md")])

    kept = without_entries_that_lead_nowhere([group])

    assert [it.title for it in kept] == ["Part I: Foundations"]
    assert [it.title for it in kept[0].subitems] == ["CHAPTER I."]


def test_a_group_whose_every_child_opens_nothing_goes_with_them():
    group = entry("Back Matter", "", [entry("Endnotes"), entry("The License")])

    assert without_entries_that_lead_nowhere([group]) == []


def test_a_dead_entry_inside_a_group_goes_and_the_group_stays():
    group = entry("Part I: Foundations", "", [entry("Endnotes"), entry("CHAPTER I.", "ch-01.md")])

    kept = without_entries_that_lead_nowhere([group])

    assert [it.title for it in kept[0].subitems] == ["CHAPTER I."]


def test_the_import_drops_the_contents_entry_of_a_page_it_left_out(tmp_path: Path):
    meta, _ = import_book(
        tmp_path,
        {"ch1.xhtml": f"<h2>CHAPTER I. OF THE DIVISION OF LABOUR.</h2>{PARAGRAPH}"},
        [("ch1.xhtml", "CHAPTER I. OF THE DIVISION OF LABOUR."), ("gone.xhtml", "THE FULL LICENSE")],
    )

    assert [it["title"] for it in meta["toc"]] == ["CHAPTER I. OF THE DIVISION OF LABOUR."]


def test_every_contents_entry_of_an_import_opens_a_chapter_that_exists(tmp_path: Path):
    meta, book_dir = import_book(
        tmp_path,
        {
            "book1.xhtml": "<h2>BOOK I. OF THE CAUSES OF IMPROVEMENT IN THE PRODUCTIVE POWERS OF LABOUR.</h2>",
            "ch1.xhtml": f"<h2>CHAPTER I. OF THE DIVISION OF LABOUR.</h2>{PARAGRAPH}",
        },
        [
            ("book1.xhtml", "BOOK I. OF THE CAUSES"),
            ("ch1.xhtml", "CHAPTER I. OF THE DIVISION OF LABOUR."),
            ("gone.xhtml", "THE FULL LICENSE"),
        ],
    )

    assert meta["toc"]
    for it in meta["toc"]:
        assert it["href"], it["title"]
        assert (book_dir / it["href"]).exists()


# --- one rule for a division and for a chapter ---


def test_the_contents_of_a_book_uses_the_same_two_rules_as_a_chapter_file():
    parser = (Path(__file__).resolve().parents[1] / "ingest" / "epub_parser.py").read_text(encoding="utf-8")

    assert "from ingest.chapter_shape import CHAPTER_TITLE, DIVISION_TITLE" in parser
    assert "book_part_pattern = DIVISION_TITLE" in parser
    assert "chapter_pattern = CHAPTER_TITLE" in parser
