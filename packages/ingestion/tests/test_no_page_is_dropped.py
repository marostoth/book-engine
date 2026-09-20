"""No page of a book leaves the import without a word said about it (CQ-09).

The import threw away any document of under twenty letters, and said nothing. A dedication, an epigraph, a
frontispiece with a short caption and a one-line closing page are all under twenty letters, and all of them are
pages of the book. They were not in the book the reader got, they were in no message, and nothing counted them,
so nothing could tell you they had gone.

Two things are wrong there and both are fixed here. A page that holds anything to read is kept, whatever its
length. A page that holds nothing at all is named on the way past, in the same shape the notes branch has used
since IN-07. And the import now counts every document of the spine against what became of it, so a document
that leaves no trace stops the import instead of shortening the book.

`test_a_page_of_a_picture_stays_a_chapter_of_its_own` in `test_chapter_shape.py` sounds like the guard that was
missing and is not one: its plate page carries a heading of 52 letters and a sentence under it, far over the
gate, so it passed while the gate stood. A test has to be built at the size of the thing it is about.

Every test here makes its own little book, so none of them needs a book of yours.
"""

import base64
import json
import zipfile
from pathlib import Path

import pytest
from ingest.pipeline import documents_that_said_nothing, ingest_epub

BOOK_ID = "a-short-page"

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""
PACKAGE = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">a-short-page</dc:identifier>
    <dc:title>A Short Page</dc:title>
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
<body><nav epub:type="toc"><ol></ol></nav></body>
</html>
"""
DOCUMENT = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>A Short Page</title></head>
<body>{body}</body>
</html>
"""

#: A chapter of ordinary length, so every book here has one page that was never in any doubt.
CHAPTER = (
    "<h2>CHAPTER I. OF THE DIVISION OF LABOUR.</h2>"
    "<p>The greatest improvement in the productive powers of labour seems to have been the effects of the "
    "division of labour.</p>"
)

#: Eleven letters. The gate wanted twenty.
DEDICATION = "<p>To my wife.</p>"

#: One picture, 64 by 64, written as text so no editor can turn an escape into a byte of its own.
#:
#: The size is the point. The asset reader leaves out anything under 60 by 60, because that is a spacer or a
#: tracking pixel and not a picture of the book, so a one-pixel fixture would have made this test pass on an
#: import that never wrote a picture at all. That is what the sight check below is for.
PLATE_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACPAi4CAAAAcklEQVR4nGNgYOHgERCRkFFQ0dAxMLGwcXDx8AkIiYhJ"
    "SMnIKSipqGlo6eiZMGXGnAVLVqzZsGXHngNHTpy5cOXGnQdPXrz58OXHH4ZRA0YNGDVg1IBRA0YNGDVg1IBRA0YNGDVg"
    "1IBRA0YNGDVguBsAAHs24GoF0r8MAAAAAElFTkSuQmCC"
)


def make_epub(path: Path, documents: dict[str, str], pictures: dict[str, bytes] | None = None) -> Path:
    pictures = pictures or {}
    manifest = "".join(
        f'<item id="d{n}" href="{name}" media-type="application/xhtml+xml"/>' for n, name in enumerate(documents)
    ) + "".join(f'<item id="i{n}" href="{name}" media-type="image/png"/>' for n, name in enumerate(pictures))
    spine = "".join(f'<itemref idref="d{n}"/>' for n in range(len(documents)))
    with zipfile.ZipFile(path, "w") as book:
        book.writestr("mimetype", "application/epub+zip")
        book.writestr("META-INF/container.xml", CONTAINER)
        book.writestr("OEBPS/content.opf", PACKAGE.format(manifest=manifest, spine=spine))
        book.writestr("OEBPS/nav.xhtml", NAV)
        for name, body in documents.items():
            book.writestr(f"OEBPS/{name}", DOCUMENT.format(body=body))
        for name, bytes_of_it in pictures.items():
            book.writestr(f"OEBPS/{name}", bytes_of_it)
    return path


def import_book(folder: Path, documents: dict[str, str], pictures: dict[str, bytes] | None = None):
    """Imports a book into a new vault in `folder`, and gives its `_meta.json` as a dict and its folder."""
    ingest_epub(make_epub(folder / f"{BOOK_ID}.epub", documents, pictures), folder / "vault")
    book_dir = folder / "vault" / "books" / BOOK_ID
    return json.loads((book_dir / "_meta.json").read_text(encoding="utf-8")), book_dir


def whole_book(book_dir: Path) -> str:
    return "\n\n".join(chapter.read_text(encoding="utf-8") for chapter in sorted(book_dir.glob("ch-*.md")))


# --- a short page is a page ---


def test_a_dedication_of_eleven_letters_is_still_in_the_book(tmp_path: Path):
    _meta, book_dir = import_book(tmp_path, {"dedication.xhtml": DEDICATION, "ch01.xhtml": CHAPTER})

    assert "To my wife." in whole_book(book_dir)


def test_a_dedication_of_eleven_letters_is_a_chapter_of_its_own(tmp_path: Path):
    meta, _ = import_book(tmp_path, {"dedication.xhtml": DEDICATION, "ch01.xhtml": CHAPTER})

    assert meta["total_chapters"] == 2
    assert [chapter["file_path"] for chapter in meta["spine"]] == ["ch-01.md", "ch-02.md"]


def test_a_page_of_one_picture_and_a_short_caption_is_still_in_the_book(tmp_path: Path):
    # Six letters of text. A frontispiece is exactly this shape, and the gate ate the picture with the page.
    plate = '<p><img src="plate.png" alt="A port"/></p><p>Leith.</p>'

    _meta, book_dir = import_book(tmp_path, {"plate.xhtml": plate, "ch01.xhtml": CHAPTER}, {"plate.png": PLATE_PNG})

    assert "Leith." in whole_book(book_dir)
    assert "![" in whole_book(book_dir), "the page is in the book and its picture is not"


def test_no_picture_of_the_book_is_left_in_assets_with_nothing_pointing_at_it(tmp_path: Path):
    """A picture was pulled out of the archive before its page was dropped, and then nothing named it.

    The EPUB path has no cleanup for such a file, so it sat in `assets/` for the life of the book.
    """
    plate = '<p><img src="plate.png" alt="A port"/></p><p>Leith.</p>'

    _meta, book_dir = import_book(tmp_path, {"plate.xhtml": plate, "ch01.xhtml": CHAPTER}, {"plate.png": PLATE_PNG})

    text = whole_book(book_dir)
    on_disk = [picture.name for picture in (book_dir / "assets").iterdir() if picture.is_file()]
    assert on_disk, "the import wrote no picture at all, so this test is asking the wrong question"
    assert [name for name in on_disk if name not in text] == []


# --- a page that holds nothing says so ---


def test_the_import_says_which_document_held_nothing_to_read(tmp_path: Path, capsys: pytest.CaptureFixture):
    import_book(tmp_path, {"blank.xhtml": "<p> </p>", "ch01.xhtml": CHAPTER})

    said = capsys.readouterr().out
    assert "blank.xhtml" in said, f"the import passed a document by without naming it: {said!r}"
    assert "nothing" in said


def test_a_document_that_holds_nothing_makes_no_chapter(tmp_path: Path):
    meta, _ = import_book(tmp_path, {"blank.xhtml": "<p> </p>", "ch01.xhtml": CHAPTER})

    assert meta["total_chapters"] == 1


# --- nothing leaves the spine unaccounted for ---


def test_every_document_of_the_spine_is_accounted_for(tmp_path: Path, capsys: pytest.CaptureFixture):
    """The import counts the documents it read against what became of each one, and says the sum out loud.

    This is the number that was missing. Nothing compared the spine of the source against the chapters written,
    so a page could go and leave no hole that anything measured.
    """
    import_book(
        tmp_path,
        {
            "blank.xhtml": "<p> </p>",
            "title.xhtml": "<h2>BOOK I. OF THE CAUSES OF IMPROVEMENT</h2>",
            "dedication.xhtml": DEDICATION,
            "ch01.xhtml": CHAPTER,
        },
    )

    said = capsys.readouterr().out
    assert "4 documents" in said, f"the import did not count the documents it read: {said!r}"


def test_a_document_with_no_reason_is_named():
    """The guard on its own, because no book can make the case it is here for.

    It fires on a `continue` that nobody has written yet. A test that waits for such a line to be added is a
    test that never runs, so the rule is asked the question straight.
    """
    became = {
        "ch01.xhtml": "makes ch-01.md",
        "title.xhtml": "holds a title, which waits for the chapter it introduces",
        "somebody-adds-this-later.xhtml": "",
    }

    assert documents_that_said_nothing(became) == ["somebody-adds-this-later.xhtml"]


def test_a_document_with_every_reason_given_names_nobody():
    assert documents_that_said_nothing({"ch01.xhtml": "makes ch-01.md"}) == []
    assert documents_that_said_nothing({}) == []


# --- the controls: what must not change ---


def test_a_page_of_nothing_but_a_title_still_waits_for_the_chapter_it_introduces(tmp_path: Path):
    """CQ-04's behaviour, which this fix must leave alone: a title page is no chapter and loses no word."""
    meta, book_dir = import_book(
        tmp_path,
        {"title.xhtml": "<h2>BOOK I. OF THE CAUSES OF IMPROVEMENT</h2>", "ch01.xhtml": CHAPTER},
    )

    assert meta["total_chapters"] == 1
    assert "BOOK I. OF THE CAUSES OF IMPROVEMENT" in whole_book(book_dir)


def test_an_ordinary_book_still_makes_one_chapter_for_each_document(tmp_path: Path):
    meta, _ = import_book(tmp_path, {"ch01.xhtml": CHAPTER, "ch02.xhtml": CHAPTER, "ch03.xhtml": CHAPTER})

    assert meta["total_chapters"] == 3
