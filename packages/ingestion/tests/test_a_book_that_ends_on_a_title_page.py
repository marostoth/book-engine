"""A book whose last page is a title keeps that page, and the test that says so looks for the words (CQ-10).

A page that holds nothing but a title is no chapter of its own. Its headings wait for the chapter they introduce,
and go to the top of it, which is right and is CQ-04. But a book can end on such a page: "BOOK II." with nothing
after it, an afterword title, a colophon. Nothing came after, nothing drained the waiting headings, and those
words were in no file of the vault.

`docs/rules/ingestion.md` promises the opposite in as many words: "its headings go to the top of the chapter they
introduce, so no word is lost."

The guard that should have caught this asserted the loss instead. `test_a_title_page_with_no_chapter_after_it_loses_no_word`
checked that the words were **absent** from `ch-01.md`, and then compared `total_words` against the sum of the
per-chapter counts it was built from, which is true of every book ever imported. Its name said the words were kept
and both of its lines agreed that they were not.

So every test here looks for the words in the files on disk, and each one that searches carries a sight check: it
first proves the search can find something, because a search that reads nothing finds nothing and passes.

Every test here makes its own little book, so none of them needs a book of yours.
"""

import re
from pathlib import Path

from ingest.chapter_shape import HeldOverBlocks
from tests.test_chapter_shape import PARAGRAPH, SECOND, blocks_of, import_book

#: A page of a book that holds one title and nothing else. Eight words, no sentence, no paragraph.
CLOSING_TITLE = "<h2>BOOK II. OF THE NATURE AND ACCUMULATION OF STOCK.</h2>"
CLOSING_WORDS = "BOOK II. OF THE NATURE AND ACCUMULATION OF STOCK."

#: A second one, so a book can end on two title pages in a row.
COLOPHON_TITLE = "<h3>PRINTED AT EDINBURGH IN THE YEAR MDCCLXXVI.</h3>"
COLOPHON_WORDS = "PRINTED AT EDINBURGH IN THE YEAR MDCCLXXVI."

#: The first chapter, which every book here has, and which every sight check looks for.
ORDINARY_CHAPTER = f"<h2>CHAPTER I. OF THE DIVISION OF LABOUR.</h2>{PARAGRAPH}"
ORDINARY_WORDS = "OF THE DIVISION OF LABOUR"


def everything_the_vault_holds(book_dir: Path) -> str:
    """Every chapter file of the book, one after the other.

    A word of the book is in the book when it is in here. Which file it is in is a separate question, and a test
    that asks this one first cannot be fooled by a chapter being numbered differently than it expects.
    """
    return "\n".join(path.read_text(encoding="utf-8") for path in sorted(book_dir.glob("ch-*.md")))


def words_on_disk(book_dir: Path) -> int:
    """The words of every chapter file, counted the way the import counts them.

    This is the number `total_words` is supposed to be. The old test compared `total_words` against the sum of the
    per-chapter counts, and the import builds the first by adding up the second, so that comparison holds for any
    book at all and asks nothing.
    """
    return sum(
        len(re.findall(r"\b\w+\b", path.read_text(encoding="utf-8"))) for path in sorted(book_dir.glob("ch-*.md"))
    )


# --- the fault itself ---


def test_a_book_that_ends_on_a_title_page_still_holds_that_title(tmp_path: Path):
    """The words of a closing title page are somewhere in the vault."""
    _meta, book_dir = import_book(
        tmp_path,
        {"ch1.xhtml": ORDINARY_CHAPTER, "end.xhtml": CLOSING_TITLE},
    )

    everything = everything_the_vault_holds(book_dir)
    assert ORDINARY_WORDS in everything, "no chapter file was read, so this test is asking nothing"
    assert CLOSING_WORDS in everything


def test_a_book_that_ends_on_two_title_pages_holds_both(tmp_path: Path):
    """Two of them in a row, because one held-over page can follow another."""
    _meta, book_dir = import_book(
        tmp_path,
        {"ch1.xhtml": ORDINARY_CHAPTER, "end.xhtml": CLOSING_TITLE, "colophon.xhtml": COLOPHON_TITLE},
    )

    everything = everything_the_vault_holds(book_dir)
    assert ORDINARY_WORDS in everything, "no chapter file was read, so this test is asking nothing"
    assert CLOSING_WORDS in everything
    assert COLOPHON_WORDS in everything


def test_a_book_that_is_nothing_but_a_title_page_still_holds_it(tmp_path: Path):
    """The smallest book of this shape: one page, one title, nothing after it.

    There is no chapter for the headings to join, so if they are only ever drained into one, this book comes out
    empty.
    """
    _meta, book_dir = import_book(tmp_path, {"only.xhtml": CLOSING_TITLE})

    everything = everything_the_vault_holds(book_dir)
    assert everything, "the import wrote no chapter file at all"
    assert CLOSING_WORDS in everything


def test_the_closing_title_page_makes_a_chapter_of_its_own(tmp_path: Path):
    """It has nowhere else to go, so it is a part of the book in its own right."""
    meta, book_dir = import_book(
        tmp_path,
        {"ch1.xhtml": ORDINARY_CHAPTER, "end.xhtml": CLOSING_TITLE},
    )

    assert meta["total_chapters"] == 2
    assert blocks_of(book_dir, "ch-02.md") == [f"## {CLOSING_WORDS}"]


def test_the_closing_title_page_is_named_after_its_own_title(tmp_path: Path):
    """A reader looking at the list of chapters reads the title, not "Chapter 2"."""
    meta, _book_dir = import_book(
        tmp_path,
        {"ch1.xhtml": ORDINARY_CHAPTER, "end.xhtml": CLOSING_TITLE},
    )

    assert [part["title"] for part in meta["spine"]] == ["CHAPTER I. OF THE DIVISION OF LABOUR.", CLOSING_WORDS]


def test_the_words_of_the_closing_title_page_are_counted(tmp_path: Path):
    """`total_words` is checked against the files on disk, not against the numbers it was added up from."""
    meta, book_dir = import_book(
        tmp_path,
        {"ch1.xhtml": ORDINARY_CHAPTER, "end.xhtml": CLOSING_TITLE},
    )

    on_disk = words_on_disk(book_dir)
    assert on_disk > 0, "no chapter file was read, so this test is asking nothing"
    assert meta["total_words"] == on_disk


def test_the_contents_entry_of_a_closing_title_page_opens_something(tmp_path: Path):
    """An entry with no href is dropped as a dead link, so the entry goes with the page."""
    meta, _book_dir = import_book(
        tmp_path,
        {"ch1.xhtml": ORDINARY_CHAPTER, "end.xhtml": CLOSING_TITLE},
        [("ch1.xhtml", "Chapter I"), ("end.xhtml", "Book II")],
    )

    titles = [item["title"] for item in meta["toc"]]
    assert "Chapter I" in titles, "the contents were not read, so this test is asking nothing"
    assert "Book II" in titles
    opens = next(item["href"] for item in meta["toc"] if item["title"] == "Book II")
    assert opens.startswith("ch-")


# --- the controls: none of this changes what CQ-04 does ---


def test_a_title_page_with_a_chapter_after_it_still_joins_that_chapter(tmp_path: Path):
    """CQ-04, unchanged. A held-over title still goes to the top of the chapter it introduces."""
    meta, book_dir = import_book(
        tmp_path,
        {"book1.xhtml": "<h2>BOOK I. OF THE CAUSES OF IMPROVEMENT.</h2>", "ch1.xhtml": ORDINARY_CHAPTER},
    )

    assert meta["total_chapters"] == 1
    assert blocks_of(book_dir, "ch-01.md")[0] == "## BOOK I. OF THE CAUSES OF IMPROVEMENT."


def test_an_ordinary_book_makes_one_chapter_for_each_document(tmp_path: Path):
    """No title page anywhere, so nothing here may add a part."""
    meta, _book_dir = import_book(
        tmp_path,
        {
            "ch1.xhtml": ORDINARY_CHAPTER,
            "ch2.xhtml": f"<h2>CHAPTER II. OF THE PRINCIPLE WHICH GIVES OCCASION.</h2>{SECOND}",
        },
    )

    assert meta["total_chapters"] == 2


def test_a_page_of_a_picture_at_the_end_is_its_own_chapter_and_is_not_held_over(tmp_path: Path):
    """A page with anything to read is a chapter already, so it never waits for anyone."""
    meta, book_dir = import_book(
        tmp_path,
        {"ch1.xhtml": ORDINARY_CHAPTER, "plate.xhtml": f"<h2>PLATE I. THE HARBOUR AT LEITH.</h2>{SECOND}"},
    )

    assert meta["total_chapters"] == 2
    assert "THE HARBOUR AT LEITH" in everything_the_vault_holds(book_dir)


# --- the holder itself ---


def test_a_holder_that_was_drained_holds_nothing(tmp_path: Path):
    """`take_names` is the only thing that empties the holder, and it must empty all of it.

    The blocks and the names are two lists and are emptied together. A drain that took the names and left the
    blocks would put the same headings at the top of every chapter after it.
    """
    held = HeldOverBlocks()
    held.hold(["## BOOK I."], "book1.xhtml")

    assert held.has_any()
    assert held.take_names() == ["book1.xhtml"]
    assert not held.has_any()
    assert held.in_front_of(["a block"]) == ["a block"]
    assert held.shift() == 0
