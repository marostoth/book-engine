"""A document makes no chapter only when it holds nothing but notes, never because of its file name (IN-07).

The import used to drop any document whose name ended in `notes`, `endnotes`, `footnotes` or `backmatter`. That was
wrong both ways, and both ways were seen on made-up books here:

- a real chapter named `ch03-fieldnotes.xhtml`, and an afterword named `backmatter.xhtml`, were dropped without a
  word said;
- a document that says `epub:type="endnotes"` but is named `rear.xhtml` became a chapter of notes read twice.

Every test here makes its own little book, so none of them needs a book of yours.
"""

import json
import re
import zipfile
from pathlib import Path

import ebooklib
import pytest
from ebooklib import epub
from ingest.endnotes import EndnoteRegistry
from ingest.line_endings import read_html
from ingest.note_documents import (
    documents_of_only_notes,
    element_named,
    notes_another_document_shows,
    says_it_is_all_notes,
)
from ingest.pipeline import ingest_epub

BOOK_ID = "notes-and-chapters"

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""
PACKAGE = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">notes-and-chapters</dc:identifier>
    <dc:title>Notes And Chapters</dc:title>
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
<head><title>Notes And Chapters</title></head>
<body>{body}</body>
</html>
"""

# A paragraph long enough that the import keeps its page: a page of under 20 letters is dropped as blank
PARAGRAPH = (
    "<p>The great commerce of every civilized society is that carried on between the inhabitants of the town "
    "and those of the country.</p>"
)
SECOND = "<p>The country supplies the town with the means of subsistence and the materials of manufacture.</p>"

CHAPTER = f"<h2>CHAPTER I. OF THE DIVISION OF LABOUR</h2>{PARAGRAPH}"
# A chapter that cites a note kept in another document, the way a book with endnotes at the back does
CHAPTER_CITING = (
    "<h2>CHAPTER I. OF THE DIVISION OF LABOUR</h2>"
    "<p>The great commerce of every civilized society is carried on between the town and the country."
    '<a href="notes.xhtml#n1"><sup>1</sup></a></p>'
)
NOTE = '<div id="n1"><p>Smith writes of the pin maker in the first chapter of the first book of his work.</p></div>'


def make_epub(path: Path, documents: dict[str, str], entries: list[tuple[str, str]], inside: str = "") -> Path:
    """An EPUB with a document for each body of `documents`, and a contents of `(href, title)` entries.

    `inside` puts the documents in a folder of their own, as a book made by a converter does (`Text/ch01.xhtml`).
    """
    where = f"{inside}/" if inside else ""
    manifest = "".join(
        f'<item id="d{n}" href="{where}{name}" media-type="application/xhtml+xml"/>' for n, name in enumerate(documents)
    )
    spine = "".join(f'<itemref idref="d{n}"/>' for n in range(len(documents)))
    links = "".join(f'<li><a href="{where}{href}">{title}</a></li>' for href, title in entries)
    with zipfile.ZipFile(path, "w") as book:
        book.writestr("mimetype", "application/epub+zip")
        book.writestr("META-INF/container.xml", CONTAINER)
        book.writestr("OEBPS/content.opf", PACKAGE.format(manifest=manifest, spine=spine))
        book.writestr("OEBPS/nav.xhtml", NAV.format(entries=links))
        for name, body in documents.items():
            book.writestr(f"OEBPS/{where}{name}", DOCUMENT.format(body=body))
    return path


def import_book(folder: Path, documents: dict[str, str], entries: list[tuple[str, str]] = (), inside: str = ""):
    """Imports a book into a new vault in `folder`, and gives its `_meta.json` as a dict and its folder."""
    ingest_epub(make_epub(folder / f"{BOOK_ID}.epub", documents, list(entries), inside), folder / "vault")
    book_dir = folder / "vault" / "books" / BOOK_ID
    return json.loads((book_dir / "_meta.json").read_text(encoding="utf-8")), book_dir


def chapters_of(meta) -> list[tuple[str, str]]:
    return [(chapter["file_path"], chapter["title"]) for chapter in meta["spine"]]


def read_the_book(folder: Path, documents: dict[str, str], inside: str = ""):
    """The book and a registry over all its documents, as the import builds them, with nothing written."""
    book = epub.read_epub(str(make_epub(folder / f"{BOOK_ID}.epub", documents, [], inside)))
    registry = EndnoteRegistry()
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        registry.register_document(item.get_name(), item.get_content())
    return book, registry


def text_of(book_dir: Path, name: str) -> str:
    return re.sub(r" \^p-\d{3}", "", (book_dir / name).read_text(encoding="utf-8"))


# ------------------------------------------------------------------ a chapter is never lost to its file name


def test_a_chapter_whose_name_ends_in_notes_is_kept(tmp_path: Path):
    field = f"<h2>CHAPTER III. NOTES FROM THE FIELD</h2>{PARAGRAPH}{SECOND}"

    meta, book_dir = import_book(tmp_path, {"ch01.xhtml": CHAPTER, "ch03-fieldnotes.xhtml": field})

    assert chapters_of(meta) == [
        ("ch-01.md", "CHAPTER I. OF THE DIVISION OF LABOUR"),
        ("ch-02.md", "CHAPTER III. NOTES FROM THE FIELD"),
    ]
    assert "means of subsistence" in text_of(book_dir, "ch-02.md")


@pytest.mark.parametrize("name", ["backmatter.xhtml", "endnotes.xhtml", "footnotes.xhtml", "part-3-notes.xhtml"])
def test_a_chapter_is_kept_whatever_its_file_name_ends_in(tmp_path: Path, name: str):
    afterword = f"<h2>AFTERWORD</h2>{PARAGRAPH}"

    meta, _ = import_book(tmp_path, {"ch01.xhtml": CHAPTER, name: afterword})

    assert chapters_of(meta) == [
        ("ch-01.md", "CHAPTER I. OF THE DIVISION OF LABOUR"),
        ("ch-02.md", "AFTERWORD"),
    ]


def test_a_document_of_notes_that_nothing_cites_keeps_its_words(tmp_path: Path):
    meta, book_dir = import_book(tmp_path, {"ch01.xhtml": CHAPTER, "notes.xhtml": f"<h2>NOTES</h2>{NOTE}"})

    assert chapters_of(meta) == [
        ("ch-01.md", "CHAPTER I. OF THE DIVISION OF LABOUR"),
        ("ch-02.md", "NOTES"),
    ]
    assert "pin maker" in text_of(book_dir, "ch-02.md")


# ------------------------------------------------------------------ a document of nothing but notes


def test_a_document_whose_notes_the_chapters_cite_makes_no_chapter(tmp_path: Path):
    meta, book_dir = import_book(tmp_path, {"ch01.xhtml": CHAPTER_CITING, "notes.xhtml": f"<h2>NOTES</h2>{NOTE}"})

    assert chapters_of(meta) == [("ch-01.md", "CHAPTER I. OF THE DIVISION OF LABOUR")]
    # The note is not lost: it sits at the foot of the chapter that cites it, once
    chapter = text_of(book_dir, "ch-01.md")
    assert "[^1]: Smith writes of the pin maker" in chapter
    assert chapter.count("pin maker") == 1


def test_the_name_of_such_a_document_does_not_matter(tmp_path: Path):
    citing = CHAPTER_CITING.replace("notes.xhtml#n1", "at-the-back.xhtml#n1")

    meta, _ = import_book(tmp_path, {"ch01.xhtml": citing, "at-the-back.xhtml": f"<h2>NOTES</h2>{NOTE}"})

    assert chapters_of(meta) == [("ch-01.md", "CHAPTER I. OF THE DIVISION OF LABOUR")]


def test_a_document_that_says_it_is_a_list_of_notes_makes_no_chapter(tmp_path: Path):
    declared = f'<section epub:type="endnotes"><h2>NOTES</h2>{NOTE}</section>'

    meta, _ = import_book(tmp_path, {"ch01.xhtml": CHAPTER, "rear.xhtml": declared})

    assert chapters_of(meta) == [("ch-01.md", "CHAPTER I. OF THE DIVISION OF LABOUR")]


def test_a_chapter_that_holds_its_own_list_of_notes_is_still_a_chapter(tmp_path: Path):
    with_own_notes = (
        "<h2>CHAPTER II. OF THE RENT OF LAND</h2>"
        f"{PARAGRAPH}"
        '<ol epub:type="endnotes"><li id="e1">A note of this chapter.</li></ol>'
    )

    meta, _ = import_book(tmp_path, {"ch01.xhtml": CHAPTER, "ch02.xhtml": with_own_notes})

    assert chapters_of(meta) == [
        ("ch-01.md", "CHAPTER I. OF THE DIVISION OF LABOUR"),
        ("ch-02.md", "CHAPTER II. OF THE RENT OF LAND"),
    ]


def test_a_document_of_notes_before_the_chapters_that_cite_them_makes_no_chapter(tmp_path: Path):
    # The answer must not depend on the order of the spine, so the notes come first here
    meta, _ = import_book(tmp_path, {"notes.xhtml": f"<h2>NOTES</h2>{NOTE}", "ch01.xhtml": CHAPTER_CITING})

    assert chapters_of(meta) == [("ch-01.md", "CHAPTER I. OF THE DIVISION OF LABOUR")]


def test_a_document_of_notes_with_no_heading_makes_no_chapter(tmp_path: Path):
    meta, _ = import_book(tmp_path, {"ch01.xhtml": CHAPTER_CITING, "notes.xhtml": NOTE})

    assert chapters_of(meta) == [("ch-01.md", "CHAPTER I. OF THE DIVISION OF LABOUR")]


def test_a_document_of_notes_and_prose_keeps_its_prose(tmp_path: Path):
    half = f"<h2>NOTES AND AN AFTERWORD</h2>{NOTE}{SECOND}"

    meta, book_dir = import_book(tmp_path, {"ch01.xhtml": CHAPTER_CITING, "notes.xhtml": half})

    assert chapters_of(meta) == [
        ("ch-01.md", "CHAPTER I. OF THE DIVISION OF LABOUR"),
        ("ch-02.md", "NOTES AND AN AFTERWORD"),
    ]
    assert "means of subsistence" in text_of(book_dir, "ch-02.md")


def test_the_import_says_which_document_made_no_chapter(tmp_path: Path, capsys: pytest.CaptureFixture):
    import_book(tmp_path, {"ch01.xhtml": CHAPTER_CITING, "notes.xhtml": f"<h2>NOTES</h2>{NOTE}"})

    said = capsys.readouterr().out
    assert "notes.xhtml" in said
    assert "holds only notes" in said


# ------------------------------------------------------------------ the rules on their own


def test_only_a_note_that_another_document_cites_counts(tmp_path: Path):
    own = (
        '<h2>CHAPTER I</h2><p>A page with a note of its own.<a href="#m1"><sup>1</sup></a></p><p id="m1">Its note.</p>'
    )
    book, registry = read_the_book(
        tmp_path, {"ch01.xhtml": CHAPTER_CITING, "ch02.xhtml": own, "notes.xhtml": f"<h2>NOTES</h2>{NOTE}"}
    )

    shown = notes_another_document_shows(book, registry)

    assert shown == {("notes.xhtml", "n1")}, "a note that only its own document cites goes to the foot of it"


def test_a_link_out_of_the_book_names_no_note(tmp_path: Path):
    # The last part of this web address is the name of a document of the book, so only refusing the address
    # itself keeps it from naming that document's note
    outward = '<h2>CHAPTER I</h2><p>A page.<a href="https://example.invalid/notes.xhtml#n1"><sup>1</sup></a></p>'
    book, registry = read_the_book(tmp_path, {"ch01.xhtml": outward, "notes.xhtml": f"<h2>NOTES</h2>{NOTE}"})

    assert notes_another_document_shows(book, registry) == set()


def test_a_book_whose_documents_sit_in_a_folder_is_read_the_same(tmp_path: Path):
    # A book made by a converter keeps its documents in a folder such as `Text/`, and a link inside it names
    # only the file: `notes.xhtml#n1` from `Text/ch01.xhtml` means `Text/notes.xhtml`
    meta, book_dir = import_book(
        tmp_path,
        {"ch01.xhtml": CHAPTER_CITING, "notes.xhtml": f"<h2>NOTES</h2>{NOTE}"},
        inside="Text",
    )

    assert chapters_of(meta) == [("ch-01.md", "CHAPTER I. OF THE DIVISION OF LABOUR")]
    assert "[^1]: Smith writes of the pin maker" in text_of(book_dir, "ch-01.md")


def test_a_note_whose_document_cannot_be_told_still_becomes_a_footnote(tmp_path: Path):
    """A link that names no document the registry holds still finds the note by its name alone.

    The chapter shows the note, because a reader needs it. The document that holds it is not counted as a
    document of only notes, because nothing here is sure it is the one the link meant, and a document kept by
    mistake costs a note read twice while a document dropped by mistake costs a chapter.
    """
    # The chapter is at the top and the notes are in `Text/`, so `notes.xhtml#n1` names no document of the book
    path = tmp_path / f"{BOOK_ID}.epub"
    with zipfile.ZipFile(path, "w") as writing:
        writing.writestr("mimetype", "application/epub+zip")
        writing.writestr("META-INF/container.xml", CONTAINER)
        writing.writestr(
            "OEBPS/content.opf",
            PACKAGE.format(
                manifest='<item id="d0" href="ch01.xhtml" media-type="application/xhtml+xml"/>'
                '<item id="d1" href="Text/notes.xhtml" media-type="application/xhtml+xml"/>',
                spine='<itemref idref="d0"/><itemref idref="d1"/>',
            ),
        )
        writing.writestr("OEBPS/nav.xhtml", NAV.format(entries=""))
        writing.writestr("OEBPS/ch01.xhtml", DOCUMENT.format(body=CHAPTER_CITING))
        writing.writestr("OEBPS/Text/notes.xhtml", DOCUMENT.format(body=f"<h2>NOTES</h2>{NOTE}"))
    book = epub.read_epub(str(path))
    registry = EndnoteRegistry()
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        registry.register_document(item.get_name(), item.get_content())

    assert registry.resolve_key("ch01.xhtml", "notes.xhtml#n1") is None, "no document of the book is named"
    assert registry.resolve_target("ch01.xhtml", "notes.xhtml#n1") is not None, "the note is found by its name"
    assert notes_another_document_shows(book, registry) == set()
    assert documents_of_only_notes(book, registry) == set()


def test_a_document_says_it_is_all_notes_only_when_it_is_the_whole_document(tmp_path: Path):
    assert says_it_is_all_notes(read_html('<html><body epub:type="endnotes"><p>A note.</p></body></html>'))
    assert says_it_is_all_notes(
        read_html('<html><body><section role="doc-endnotes"><p>A note.</p></section></body></html>')
    )
    assert not says_it_is_all_notes(
        read_html('<html><body><p>Prose.</p><ol epub:type="endnotes"><li>A note.</li></ol></body></html>')
    )
    assert not says_it_is_all_notes(read_html("<html><body><p>Prose.</p></body></html>"))
    assert not says_it_is_all_notes(read_html('<html><body><nav epub:type="toc"><ol></ol></nav></body></html>'))


def test_an_element_is_found_by_its_id_or_by_the_anchor_that_names_it():
    soup = read_html('<html><body><p id="n1">By id.</p><p><a name="n2"></a>By name.</p></body></html>')

    assert element_named(soup, "n1").get_text() == "By id."
    assert element_named(soup, "n2").name == "p", "the block that holds the anchor is the note"
    assert element_named(soup, "n3") is None


def test_the_documents_of_only_notes_are_named(tmp_path: Path):
    book, registry = read_the_book(
        tmp_path,
        {
            "ch01.xhtml": CHAPTER_CITING,
            "notes.xhtml": f"<h2>NOTES</h2>{NOTE}",
            "afterword.xhtml": f"<h2>AFTERWORD</h2>{PARAGRAPH}",
        },
    )

    assert documents_of_only_notes(book, registry) == {"notes.xhtml"}
