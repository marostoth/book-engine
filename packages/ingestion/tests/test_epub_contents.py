"""The contents of an EPUB book open the chapter and the paragraph of each entry (CQ-01).

Every book of The Wealth of Nations starts again at "CHAPTER I.", and each chapter heading has a line break before its
subtitle. The import cut each chapter title at that break, and kept the links of the EPUB contents, which name source
documents that the vault does not have. So the sidebar matched entries by title: "CHAPTER I." of Books II to V opened
Book I, and an entry with no matching title opened nothing. The book in these tests has the same shape.
"""

import json
from pathlib import Path

import pytest
from ebooklib import epub

from ingest.pipeline import ingest_epub


def paragraph(topic: str) -> str:
    return f"<p>This paragraph is about {topic}, and it has enough words to be a real paragraph of the chapter.</p>"


DOCUMENTS = {
    "cover.xhtml": "<div> </div>",
    # A page of nothing but a division title. It is no chapter, so it joins the chapter after it (CQ-04).
    "book-1.xhtml": '<div class="chapter" id="book-1"><h2>BOOK I.\nOF THE CAUSES OF WEALTH.</h2></div>',
    "book-1-chapter-1.xhtml": (
        '<div class="chapter" id="b1-c1"><h2>CHAPTER I.\nOF THE DIVISION OF LABOUR.</h2>'
        + paragraph("pins")
        + paragraph("workmen")
        + "</div>"
    ),
    "book-1-chapter-2.xhtml": (
        '<div class="chapter" id="b1-c2"><h2>CHAPTER II.\nOF THE RENT OF LAND.</h2>'
        + paragraph("rent")
        + '<h3 id="b1-c2-part-1">PART I. Of the Produce of Land.</h3>'
        + paragraph("corn")
        + paragraph("cattle")
        # The target of a link can be an empty element before the heading, as in older books
        + '<a id="b1-c2-part-2"></a><h3>PART II. Of the Price of Silver.</h3>'
        + paragraph("silver")
        + "</div>"
    ),
    # Two chapters in one document, as with Book III of The Wealth of Nations and its first chapter
    "book-2.xhtml": (
        '<div class="chapter" id="book-2"><h2>BOOK II.\nOF STOCK.</h2>'
        + paragraph("stock")
        + '</div><div class="chapter" id="b2-c1"><h2>CHAPTER I.\nOF THE DIVISION OF STOCK.</h2>'
        + paragraph("capital")
        + paragraph("revenue")
        + "</div>"
    ),
    "book-2-chapter-2.xhtml": (
        '<div class="chapter" id="b2-c2"><h2>CHAPTER II.\nOF MONEY.</h2>' + paragraph("money") + "</div>"
    ),
    # A document of notes that nothing in this book cites. Its notes move nowhere, so it is a chapter of its
    # own and its words stay (IN-07). `test_note_documents.py` has the book where the chapters do cite them.
    "notes.xhtml": '<div id="notes"><p id="n1">1. A note about pins and about the price of silver.</p></div>',
}

CONTENTS = [
    epub.Link("book-1.xhtml#book-1", "BOOK I. OF THE CAUSES OF WEALTH.", "toc-1"),
    epub.Link("book-1-chapter-1.xhtml#b1-c1", "CHAPTER I. OF THE DIVISION OF LABOUR.", "toc-2"),
    (
        epub.Section("CHAPTER II. OF THE RENT OF LAND.", href="book-1-chapter-2.xhtml#b1-c2"),
        [
            epub.Link("book-1-chapter-2.xhtml#b1-c2-part-1", "PART I. Of the Produce of Land.", "toc-4"),
            epub.Link("book-1-chapter-2.xhtml#b1-c2-part-2", "PART II. Of the Price of Silver.", "toc-5"),
        ],
    ),
    epub.Link("book-2.xhtml#book-2", "BOOK II. OF STOCK.", "toc-6"),
    epub.Link("book-2.xhtml#b2-c1", "CHAPTER I. OF THE DIVISION OF STOCK.", "toc-7"),
    epub.Link("book-2-chapter-2.xhtml#b2-c2", "CHAPTER II. OF MONEY.", "toc-8"),
    epub.Link("notes.xhtml#notes", "NOTES.", "toc-9"),
]


@pytest.fixture(scope="module")
def imported(tmp_path_factory):
    folder = tmp_path_factory.mktemp("contents")
    book = epub.EpubBook()
    book.set_identifier("contents-test")
    book.set_title("Contents Test Book")
    book.set_language("en")
    book.add_author("Test Author")
    documents = []
    for name, body in DOCUMENTS.items():
        document = epub.EpubHtml(title=name, file_name=name, lang="en")
        document.content = f"<html><head><title>{name}</title></head><body>{body}</body></html>"
        book.add_item(document)
        documents.append(document)
    book.toc = CONTENTS
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav", *documents]
    epub_path = folder / "contents-test.epub"
    epub.write_epub(str(epub_path), book)

    vault = folder / "vault"
    ingest_epub(epub_path, vault, custom_book_id="contents-test")
    book_dir = vault / "books" / "contents-test"
    return book_dir, json.loads((book_dir / "_meta.json").read_text(encoding="utf-8"))


def entries(items, found=None):
    """Every entry of the contents in reading order, sub-entries after their entry: (title, href, anchor)."""
    found = [] if found is None else found
    for item in items:
        found.append((item["title"], item["href"], item.get("anchor")))
        entries(item.get("subitems", []), found)
    return found


def test_chapter_titles_keep_the_words_after_a_line_break(imported):
    book_dir, meta = imported

    # "BOOK I." held no text, so it is no chapter of its own, and the chapter it introduces carries its own
    # name. "BOOK II." has a paragraph of its own and keeps its name (CQ-04). `notes.xhtml` is the last chapter:
    # nothing in this book cites its note, so the note is text of the book and is kept (IN-07). It has no heading
    # of its own, so it gets the plain name that any chapter with no heading gets.
    assert [chapter["title"] for chapter in meta["spine"]] == [
        "CHAPTER I. OF THE DIVISION OF LABOUR.",
        "CHAPTER II. OF THE RENT OF LAND.",
        "BOOK II. OF STOCK.",
        "CHAPTER II. OF MONEY.",
        "Chapter 5",
    ]
    # One heading line: the reader showed the second line as a paragraph, and the heading marks as text
    assert (book_dir / "ch-01.md").read_text(encoding="utf-8").startswith(
        "## BOOK I. OF THE CAUSES OF WEALTH.\n\n## CHAPTER I. OF THE DIVISION OF LABOUR.\n\n"
    )


def test_every_entry_names_the_chapter_file_and_the_paragraph_where_it_starts(imported):
    _, meta = imported

    assert entries(meta["toc"]) == [
        # The title page of BOOK I joined the chapter after it, so both entries open that chapter at the top
        ("BOOK I. OF THE CAUSES OF WEALTH.", "ch-01.md", None),
        ("CHAPTER I. OF THE DIVISION OF LABOUR.", "ch-01.md", None),
        ("CHAPTER II. OF THE RENT OF LAND.", "ch-02.md", None),
        ("PART I. Of the Produce of Land.", "ch-02.md", "^p-002"),
        ("PART II. Of the Price of Silver.", "ch-02.md", "^p-004"),
        ("BOOK II. OF STOCK.", "ch-03.md", None),
        ("CHAPTER I. OF THE DIVISION OF STOCK.", "ch-03.md", "^p-002"),
        ("CHAPTER II. OF MONEY.", "ch-04.md", None),
        # Nothing in this book cites the note of `notes.xhtml`, so that note is text of the book. The import used
        # to drop the document because its name ends in "notes", and the text went with it. It is a chapter now,
        # and its contents entry opens it (IN-07).
        ("NOTES.", "ch-05.md", None),
    ]
    chapter_files = {chapter["file_path"] for chapter in meta["spine"]}
    assert {href for _, href, _ in entries(meta["toc"]) if href} <= chapter_files
    assert all(href for _, href, _ in entries(meta["toc"]))


def test_each_anchor_of_an_entry_is_the_first_paragraph_after_its_heading(imported):
    book_dir, meta = imported

    checked = []
    for title, href, anchor in entries(meta["toc"]):
        if not anchor:
            continue
        blocks = (book_dir / href).read_text(encoding="utf-8").split("\n\n")
        at = next(n for n, block in enumerate(blocks) if block.endswith(" " + anchor))
        assert blocks[at - 1].lstrip("#").strip() == title, (title, blocks[at - 1])
        checked.append(title)
    assert checked == ["PART I. Of the Produce of Land.", "PART II. Of the Price of Silver.", "CHAPTER I. OF THE DIVISION OF STOCK."]


def test_paragraphs_and_their_anchors_stay_the_same(imported):
    # Guard: a title page joins the chapter after it with its heading only, so no paragraph anchor moves
    book_dir, _ = imported

    def paragraphs(name):
        return [block for block in (book_dir / name).read_text(encoding="utf-8").split("\n\n") if not block.startswith("#")]

    assert paragraphs("ch-01.md") == [
        "This paragraph is about pins, and it has enough words to be a real paragraph of the chapter. ^p-001",
        "This paragraph is about workmen, and it has enough words to be a real paragraph of the chapter. ^p-002",
    ]
    assert paragraphs("ch-02.md") == [
        "This paragraph is about rent, and it has enough words to be a real paragraph of the chapter. ^p-001",
        "This paragraph is about corn, and it has enough words to be a real paragraph of the chapter. ^p-002",
        "This paragraph is about cattle, and it has enough words to be a real paragraph of the chapter. ^p-003",
        "This paragraph is about silver, and it has enough words to be a real paragraph of the chapter. ^p-004",
    ]
    assert paragraphs("ch-03.md") == [
        "This paragraph is about stock, and it has enough words to be a real paragraph of the chapter. ^p-001",
        "This paragraph is about capital, and it has enough words to be a real paragraph of the chapter. ^p-002",
        "This paragraph is about revenue, and it has enough words to be a real paragraph of the chapter. ^p-003",
    ]
