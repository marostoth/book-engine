"""Which documents of an EPUB hold nothing but notes, and so make no chapter (IN-07).

A book often keeps its notes in a document of their own at the back. The import puts each of those notes at the foot
of the chapter that cites it, so importing that document as well would write the same words twice. It used to be
found by the end of its file name: `notes`, `endnotes`, `footnotes` or `backmatter`. That is wrong in both
directions, and both ways were reproduced:

- A real chapter named `ch03-fieldnotes.xhtml` or `backmatter.xhtml` was dropped, with no word said.
- A document that says `epub:type="endnotes"` but is named `rear.xhtml` became a chapter of notes read twice.

A document is known here by what it holds, not by its name. It holds only notes when the book itself says so
(`epub:type` or `role`, EPUB 3 and DPUB-ARIA), or when taking out every note that another document already shows as
a footnote leaves nothing but headings.

The answer is worked out before the first chapter is built, from every document of the book, so it never depends on
the order of the spine: a document of notes may sit anywhere.

Where the rule cannot be sure, it keeps the document. Losing a chapter is the fault this module exists to stop, and
a note read twice is the smaller harm.
"""

from __future__ import annotations

import ebooklib
from bs4 import BeautifulSoup, Tag
from ebooklib import epub

from ingest.chapter_shape import is_heading
from ingest.endnotes import NOTE_LIST_KINDS, EndnoteRegistry, attribute, is_note_reference, kinds, named_element
from ingest.epub_parser import html_to_markdown_blocks
from ingest.line_endings import read_html

#: A link that goes outside the book names no note of it.
LEAVES_THE_BOOK = ("http://", "https://", "mailto:")


def element_named(soup: BeautifulSoup, name: str) -> Tag | None:
    """The element of a document that a link fragment names: by `id`, or the block an `<a name>` sits in."""
    found = soup.find(None, {"id": name})
    if found is not None:
        return found
    anchor = soup.find("a", attrs={"name": name})
    return named_element(anchor) if anchor is not None else None


def notes_another_document_shows(book: epub.EpubBook, registry: EndnoteRegistry) -> set[tuple[str, str]]:
    """Every (document, element name) that a link in some other document of the book names as a note.

    A note that only its own document cites is left out: that note already goes to the foot of its own chapter.
    """
    shown: set[tuple[str, str]] = set()
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        source = item.get_name()
        soup = read_html(item.get_content())
        for link in soup.find_all("a", href=True):
            href = attribute(link, "href")
            if href.startswith(LEAVES_THE_BOOK):
                continue
            key = registry.resolve_key(source, href)
            if key is None or key[0] == source:
                continue
            if is_note_reference(link, registry.exact_notes[key]):
                shown.add(key)
    return shown


def says_it_is_all_notes(soup: BeautifulSoup) -> bool:
    """True when the document itself says it is a list of notes, in `epub:type` or `role`.

    Either the body says it, or the one and only block inside the body says it. A list of notes that stands beside
    other blocks is the notes of that one chapter, and those go to the foot of it: a chapter can hold its own
    `<ol epub:type="endnotes">` and is still a chapter.
    """
    body = soup.body
    if body is None:
        return False
    if kinds(body) & NOTE_LIST_KINDS:
        return True
    inside = body.find_all(recursive=False)
    return len(inside) == 1 and bool(kinds(inside[0]) & NOTE_LIST_KINDS)


def documents_of_only_notes(book: epub.EpubBook, registry: EndnoteRegistry) -> set[str]:
    """The names of the documents of the book that hold nothing but notes, so they make no chapter."""
    shown = notes_another_document_shows(book, registry)
    only_notes: set[str] = set()
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        name = item.get_name()
        soup = read_html(item.get_content())
        if says_it_is_all_notes(soup):
            only_notes.add(name)
            continue

        found = [element_named(soup, note) for document, note in shown if document == name]
        taken = [element for element in found if element is not None]
        if not taken:
            continue
        for element in taken:
            element.decompose()
        # Nothing but headings is left, and a document with nothing at all is counted here too.
        if all(is_heading(block) for block in html_to_markdown_blocks(soup)):
            only_notes.add(name)
    return only_notes
