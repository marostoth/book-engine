r"""Book text and vault files with one line ending, `\n` (IN-06).

An EPUB book made on Windows holds its text with Windows line endings, `\r\n`, and Python on Windows wrote each `\n` of
a vault file as `\r\n`. So a line break inside a paragraph was written as `\r\r\n`, and the chapter read back with
pieces of paragraphs that had no anchor. Every other vault file got `\r\n` line endings too, and the app found paragraphs
and footnotes only at `\n`.
"""

import importlib.util
import json
import re
import sys
import zipfile
from pathlib import Path

import pymupdf
from bs4 import Comment
from conftest import SKILLS
from ingest.line_endings import normalize_line_endings, read_html
from ingest.pipeline import ingest_book

BOOK_ID = "harbour-tides"
LINE_ENDINGS = {"unix": "\n", "windows": "\r\n", "old mac": "\r"}

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""
PACKAGE = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">harbour-tides</dc:identifier>
    <dc:title>Harbour Tides</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch01" href="ch01.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch01"/></spine>
</package>
"""
NAV = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol><li><a href="ch01.xhtml">Chapter 1: The Tides</a></li></ol></nav></body>
</html>
"""
# Paragraphs and a note with line breaks inside them, as the text of many books has them
CHAPTER = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body>
<h1>Chapter 1: The Tides</h1>
<p>The harbour master reads the tide tables every morning
before the first boat leaves the quay.<sup><a href="#n1">1</a></sup></p>
<p>Spring tides come twice a month, when the sun and the moon
pull in a line, and neap tides come between them.</p>
<p id="n1">1. The tables come from the port office,
   and they are printed each year.</p>
</body>
</html>
"""


def make_epub(path: Path, line_ending: str) -> Path:
    """An EPUB book whose files have the line ending `line_ending`."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as book:
        book.writestr("mimetype", "application/epub+zip")
        for name, text in [
            ("META-INF/container.xml", CONTAINER),
            ("OEBPS/content.opf", PACKAGE),
            ("OEBPS/nav.xhtml", NAV),
            ("OEBPS/ch01.xhtml", CHAPTER),
        ]:
            book.writestr(name, text.replace("\n", line_ending).encode("utf-8"))
    return path


def make_pdf(path: Path) -> Path:
    """A PDF book with one chapter."""
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open()
    doc.new_page().insert_text((50, 50), "# Chapter 1: Charts\n\nThe river charts show every sandbank.")
    doc.set_toc([[1, "Chapter 1: Charts", 1]])
    doc.save(str(path))
    doc.close()
    return path


def import_book(folder: Path, line_ending: str) -> Path:
    """Imports the book with the line ending `line_ending` into a new vault in `folder`, and gives that vault."""
    vault = folder / "vault"
    ingest_book(make_epub(folder / f"{BOOK_ID}.epub", line_ending), vault)
    return vault


def vault_files(vault: Path) -> dict:
    """The bytes of every file in `vault`, and `_meta.json` without the file of the import."""
    files: dict = {}
    for path in sorted(vault.rglob("*")):
        if path.is_file():
            files[path.relative_to(vault).as_posix()] = path.read_bytes()
            if path.name == "_meta.json":
                meta = json.loads(path.read_bytes())
                del meta["source"]
                files[path.relative_to(vault).as_posix()] = meta
    return files


def load_script(name: str, file_name: str):
    spec = importlib.util.spec_from_file_location(name, SKILLS / file_name)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_a_book_with_any_line_ending_imports_as_the_same_book(tmp_path: Path) -> None:
    vaults = {name: import_book(tmp_path / name, line_ending) for name, line_ending in LINE_ENDINGS.items()}
    audit = load_script("audit_anchors", "audit-anchors.py")

    for name, vault in vaults.items():
        assert audit.audit_book(vault / "books" / BOOK_ID), f"{name} line endings: every paragraph has its anchor"
        assert vault_files(vault) == vault_files(vaults["unix"]), (
            f"{name} line endings: the same book as with unix ones"
        )


def test_a_note_with_line_breaks_is_one_footnote_line(tmp_path: Path) -> None:
    # The reader reads a footnote as one line, so the rest of a note with a line break showed as a paragraph
    for name, line_ending in LINE_ENDINGS.items():
        chapter = (import_book(tmp_path / name, line_ending) / "books" / BOOK_ID / "ch-01.md").read_text(
            encoding="utf-8"
        )
        notes = [line for line in chapter.split("\n") if line.startswith("[^1]:")]
        assert len(notes) == 1 and re.fullmatch(
            r"\[\^1\]: The tables come from the port office, and they are printed each year\. \^p-\d{3}", notes[0]
        ), f"{name} line endings: {notes}"


def test_every_file_that_an_import_writes_has_unix_line_endings(tmp_path: Path, monkeypatch) -> None:
    inbox = load_script("process_inbox", "process-inbox.py")
    monkeypatch.setattr(inbox, "INBOX_DIR", tmp_path / "inbox")
    monkeypatch.setattr(inbox, "PROCESSED_DIR", tmp_path / "inbox" / "processed")
    monkeypatch.setattr(inbox, "VAULT_DIR", tmp_path / "vault")
    monkeypatch.setattr(sys, "argv", ["process-inbox.py"])
    make_epub(tmp_path / "inbox" / f"{BOOK_ID}.epub", "\r\n")
    make_pdf(tmp_path / "inbox" / "river-charts.pdf")
    assert inbox.main() == 0

    vault = tmp_path / "vault"
    text_files = sorted(path for path in vault.rglob("*") if path.suffix in (".md", ".json"))
    assert len([path for path in text_files if path.name == "_meta.json"]) == 2, "an EPUB book and a PDF book"
    kinds = {re.sub(r"\d+", "NN", path.name) for path in text_files}
    assert kinds >= {"_ledger.json", "_meta.json", "ch-NN.md", "ch-NN-notes.md", "practice-deck.md"}, kinds
    assert [path.relative_to(vault).as_posix() for path in text_files if b"\r" in path.read_bytes()] == []


def test_the_text_of_a_document_is_read_with_unix_line_endings() -> None:
    assert normalize_line_endings("one\r\ntwo\rthree\r\r\nfour\n") == "one\ntwo\nthree\n\nfour\n"

    soup = read_html(b"<p>one\r\ntwo\rthree</p><!-- a note for the printer\r\n-->")
    assert soup.p is not None and soup.p.get_text() == "one\ntwo\nthree"
    comments = soup.find_all(string=lambda text: isinstance(text, Comment))
    assert comments == [" a note for the printer\n"], "a comment stays a comment"
