"""Unit tests for the links from the contents of an EPUB book to the chapter files and paragraphs of its import (CQ-01)."""

from bs4 import BeautifulSoup

from ingest.anchors import inject_paragraph_anchors
from ingest.epub_parser import html_to_markdown_blocks
from ingest.models import TOCItem
from ingest.toc_links import ImportedDocument, element_anchors, link_toc_to_chapters


def converted(html: str):
    element_blocks = {}
    blocks = html_to_markdown_blocks(BeautifulSoup(html, "html.parser"), element_blocks)
    return blocks, element_blocks


def entries(items, found=None):
    found = [] if found is None else found
    for item in items:
        found.append((item.title, item.href, item.anchor))
        entries(item.subitems, found)
    return found


def test_an_element_starts_at_the_block_that_holds_it_or_else_at_the_next_block():
    blocks, element_blocks = converted(
        '<body><section id="chapter"><h2 id="title">Title\nand subtitle</h2>'
        '<p id="first">One <span id="inside">two</span></p>'
        '<a name="old-style"></a><a id="empty"></a>'
        '<p>Three</p></section><a id="end"></a></body>'
    )

    assert blocks == ["## Title and subtitle", "One two", "Three"]
    assert element_blocks == {"chapter": 0, "title": 0, "first": 1, "inside": 1, "old-style": 2, "empty": 2, "end": 3}


def test_an_element_opens_the_first_paragraph_from_its_block_or_the_top_before_the_first_paragraph():
    blocks = ["## Book Two", "## Chapter One", "First.", "Second.\n\nThird.", "", "### Part Two", "Fourth."]
    anchored, _ = inject_paragraph_anchors("\n\n".join([*blocks, "[^1]: A note."]))
    element_blocks = {"book": 0, "chapter": 1, "second": 3, "dropped-picture": 4, "part-two": 5, "end": 7}

    assert element_anchors(blocks, element_blocks, anchored) == {
        "book": None,
        "chapter": None,
        # A block with a blank line makes two paragraphs, and an empty block makes none
        "second": "^p-002",
        "dropped-picture": "^p-004",
        "part-two": "^p-004",
        # After the last paragraph: the last paragraph, never a footnote
        "end": "^p-004",
    }


def test_each_entry_gets_the_chapter_file_and_the_paragraph_of_its_link():
    documents = {
        "Text/chapter 1.xhtml": ImportedDocument("ch-01.md", {"top": None, "part 2": "^p-007"}),
        "Text/chapter-2.xhtml": ImportedDocument("ch-02.md", {"top": None}),
    }
    contents = [
        TOCItem(id="1", title="Chapter 1", href="Text/chapter%201.xhtml#top", subitems=[
            TOCItem(id="1.2", title="Part 2", href="Text/chapter%201.xhtml#part%202", level=2),
            TOCItem(id="1.3", title="Part 3", href="Text/chapter%201.xhtml#no-such-element", level=2),
        ]),
        # An NCX file in another folder names the documents from its own folder
        TOCItem(id="2", title="Chapter 2", href="../Text/chapter-2.xhtml"),
        TOCItem(id="3", title="Notes", href="Text/notes.xhtml#note-1"),
        TOCItem(id="4", title="Part One", href=""),
    ]

    link_toc_to_chapters(contents, documents)

    assert entries(contents) == [
        ("Chapter 1", "ch-01.md", None),
        ("Part 2", "ch-01.md", "^p-007"),
        # The document has no such element: the top of the chapter
        ("Part 3", "ch-01.md", None),
        ("Chapter 2", "ch-02.md", None),
        # No chapter holds these entries
        ("Notes", "", None),
        ("Part One", "", None),
    ]


def test_a_file_name_that_two_documents_share_is_not_guessed():
    documents = {"part-1/intro.xhtml": ImportedDocument("ch-01.md"), "part-2/intro.xhtml": ImportedDocument("ch-05.md")}
    contents = [
        TOCItem(id="1", title="Introduction to Part 2", href="../part-2/intro.xhtml"),
        TOCItem(id="2", title="Some introduction", href="intro.xhtml"),
    ]

    link_toc_to_chapters(contents, documents)

    assert entries(contents) == [("Introduction to Part 2", "ch-05.md", None), ("Some introduction", "", None)]
