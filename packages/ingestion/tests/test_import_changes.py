"""A failed import changes nothing in the vault, and a new import leaves no file of the old book (IN-05).

An import wrote each file of a book into the vault as soon as it had made it. So an import that failed in chapter 2 left
a new `ch-01.md` next to the old `_meta.json` and practice deck, and a new import with fewer chapters left the old
`ch-03.md` and its pictures. The inbox script reported "Success" for a book that failed the anchor check, and moved its
file to `inbox/processed/`. Two imports of the same file also wrote other bytes, because `_meta.json` held the time of
the import.
"""

import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Dict, List

import pymupdf
import pytest

import ingest
import ingest.cli
import ingest.pdf_parser
import ingest.pipeline
from ingest.pipeline import ingest_book

from conftest import SKILLS

BOOK = "harbour-notes"
CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""
PACKAGE = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">harbour-notes</dc:identifier>
    <dc:title>Harbour Notes</dc:title>
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
<body><nav epub:type="toc"><ol><li><a href="d0.xhtml">Tides</a></li></ol></nav></body>
</html>
"""
DOCUMENT = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Harbour Notes</title></head>
<body>{body}</body>
</html>
"""

TIDES = ["A tide rises twice a day on the north coast.", "Pilots read the tide tables before dawn."]
MOORINGS = ["A mooring holds a ship at one place in the harbour.", "Heavy chains run from the buoy to the sea bed."]
STORMS = ["Storms close the harbour mouth a few days each winter.", "Ships double their lines before a gale."]
THREE_CHAPTERS = {"Tides": TIDES, "Moorings": MOORINGS, "Storms": STORMS}


def picture() -> bytes:
    pixmap = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 80, 80), False)
    pixmap.clear_with(180)
    return pixmap.tobytes("png")


def make_epub(path: Path, chapters: Dict[str, List[str]], picture_in: str = "") -> Path:
    """An EPUB book with one document for each chapter. The chapter `picture_in` ends with a picture."""
    bodies = []
    for title, paragraphs in chapters.items():
        body = f"<h1>{title}</h1>" + "".join(f"<p>{text}</p>" for text in paragraphs)
        if title == picture_in:
            body += '<p><img src="chart.png" alt="A chart of the harbour"/></p>'
        bodies.append(body)
    manifest = "".join(
        f'<item id="d{n}" href="d{n}.xhtml" media-type="application/xhtml+xml"/>' for n in range(len(bodies))
    )
    if picture_in:
        manifest += '<item id="chart" href="chart.png" media-type="image/png"/>'
    spine = "".join(f'<itemref idref="d{n}"/>' for n in range(len(bodies)))
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as book:
        book.writestr("mimetype", "application/epub+zip")
        book.writestr("META-INF/container.xml", CONTAINER)
        book.writestr("OEBPS/content.opf", PACKAGE.format(manifest=manifest, spine=spine))
        book.writestr("OEBPS/nav.xhtml", NAV)
        for n, body in enumerate(bodies):
            book.writestr(f"OEBPS/d{n}.xhtml", DOCUMENT.format(body=body))
        if picture_in:
            book.writestr("OEBPS/chart.png", picture())
    return path


def make_pdf(path: Path, chapters: Dict[str, str]) -> Path:
    """A PDF book with one page for each chapter, and an outline entry for each page."""
    doc = pymupdf.open()
    for title, text in chapters.items():
        doc.new_page().insert_text((50, 72), f"{title}\n\n{text}", fontsize=11)
    doc.set_toc([[1, title, n] for n, title in enumerate(chapters, start=1)])
    doc.set_metadata({"title": "Harbour Charts", "author": "Test Author"})
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(path))
    doc.close()
    return path


PDF_CHAPTERS = {
    "Chapter 1: Tides": "A tide rises twice a day on the north coast.",
    "Chapter 2: Moorings": "A mooring holds a ship at one place in the harbour.",
    "Chapter 3: Storms": "Storms close the harbour mouth a few days each winter.",
}


def vault_files(vault: Path) -> Dict[str, str]:
    """The SHA-256 of every file in the vault, by its path in the vault."""
    return {
        path.relative_to(vault).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(vault.rglob("*"))
        if path.is_file()
    }


def write_reader_files(vault: Path) -> None:
    """A bookmark, notes and a reading log that a new edition of the book moves."""
    notes = vault / "notes" / BOOK
    notes.mkdir(parents=True, exist_ok=True)
    (notes / "bookmark.json").write_text('{"chapterFile": "ch-02.md", "anchor": "^p-002"}', encoding="utf-8")
    (notes / "ch-02-notes.md").write_text('# Moorings\n\n> "Heavy chains" (#^p-002)\n', encoding="utf-8")
    line = {"bookId": BOOK, "chapterFile": "ch-02.md", "secondsSpent": 60, "completed": False, "readAt": "2026-09-17"}
    (notes / "reading.jsonl").write_text(json.dumps(line) + "\n", encoding="utf-8")


def fail_in_chapter(module, monkeypatch: pytest.MonkeyPatch, number: int) -> None:
    """The import fails when it gives anchors to the paragraphs of chapter `number`."""
    real = module.inject_paragraph_anchors
    calls = []

    def inject_paragraph_anchors(text: str, start_index: int = 1):
        calls.append(text)
        if len(calls) == number:
            raise RuntimeError(f"a failure in chapter {number}")
        return real(text, start_index=start_index)

    monkeypatch.setattr(module, "inject_paragraph_anchors", inject_paragraph_anchors)


def drop_an_anchor(monkeypatch: pytest.MonkeyPatch) -> None:
    """The EPUB import leaves the second paragraph of each chapter with no anchor."""
    real = ingest.pipeline.inject_paragraph_anchors

    def inject_paragraph_anchors(text: str, start_index: int = 1):
        anchored, count = real(text, start_index=start_index)
        return anchored.replace(" ^p-002", "", 1), count

    monkeypatch.setattr(ingest.pipeline, "inject_paragraph_anchors", inject_paragraph_anchors)


def test_an_epub_import_that_fails_changes_nothing_in_the_vault(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    vault = tmp_path / "vault"
    ingest_book(make_epub(tmp_path / "first" / f"{BOOK}.epub", THREE_CHAPTERS), vault, book_id=BOOK)
    write_reader_files(vault)
    before = vault_files(vault)
    # A new edition with a dedication first, so every chapter and the reader's files would move
    new_edition = make_epub(tmp_path / "new" / f"{BOOK}.epub", {"Dedication": ["For the pilots."], **THREE_CHAPTERS})
    fail_in_chapter(ingest.pipeline, monkeypatch, 3)

    with pytest.raises(RuntimeError, match="a failure in chapter 3"):
        ingest_book(new_edition, vault, book_id=BOOK, replace=True)

    assert vault_files(vault) == before, "the chapters, _meta.json, the deck and the reader's files stay as they were"
    assert not (vault / ".import").exists(), "no build folder stays"


def test_a_pdf_import_that_fails_changes_nothing_in_the_vault(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    vault = tmp_path / "vault"
    ingest_book(make_pdf(tmp_path / "first" / "harbour-charts.pdf", PDF_CHAPTERS), vault)
    before = vault_files(vault)
    changed = {**PDF_CHAPTERS, "Chapter 1: Tides": "Tides shaped every harbour town on this coast."}
    new_pdf = make_pdf(tmp_path / "new" / "harbour-charts.pdf", changed)
    fail_in_chapter(ingest.pdf_parser, monkeypatch, 2)

    with pytest.raises(RuntimeError, match="a failure in chapter 2"):
        ingest_book(new_pdf, vault, replace=True)

    assert vault_files(vault) == before
    assert not (vault / ".import").exists()
    new_pdf.unlink()  # Windows lets the file go only when the failed import closed it


def test_a_new_import_with_fewer_chapters_leaves_no_old_chapter_or_picture(tmp_path: Path):
    vault = tmp_path / "vault"
    three = make_epub(tmp_path / "three" / f"{BOOK}.epub", THREE_CHAPTERS, picture_in="Storms")
    ingest_book(three, vault, book_id=BOOK)
    assert (vault / "books" / BOOK / "assets" / "chart.png").exists()
    two = make_epub(tmp_path / "two" / f"{BOOK}.epub", {"Tides": TIDES, "Moorings": MOORINGS})

    ingest_book(two, vault, book_id=BOOK, replace=True)
    new_vault = tmp_path / "new-vault"
    ingest_book(two, new_vault, book_id=BOOK)

    book_files = {path: sha for path, sha in vault_files(vault).items() if path.startswith("books/")}
    assert book_files == {path: sha for path, sha in vault_files(new_vault).items() if path.startswith("books/")}, (
        "the book folder is the same as the one that an import into an empty vault writes"
    )
    assert sorted(book_files) == [f"books/{BOOK}/_meta.json", f"books/{BOOK}/ch-01.md", f"books/{BOOK}/ch-02.md"]


def test_a_new_pdf_import_with_fewer_parts_leaves_no_old_part(tmp_path: Path):
    vault = tmp_path / "vault"
    meta = ingest_book(make_pdf(tmp_path / "three" / "harbour-charts.pdf", PDF_CHAPTERS), vault)
    two_parts = dict(list(PDF_CHAPTERS.items())[:2])

    ingest_book(make_pdf(tmp_path / "two" / "harbour-charts.pdf", two_parts), vault, replace=True)

    assert sorted(path.name for path in (vault / "books" / meta.book_id).glob("ch-*.md")) == ["ch-01.md", "ch-02.md"]


def test_an_import_of_one_part_leaves_no_part_that_the_book_does_not_have(tmp_path: Path):
    vault = tmp_path / "vault"
    meta = ingest_book(make_pdf(tmp_path / "three" / "harbour-charts.pdf", PDF_CHAPTERS), vault)
    book_dir = vault / "books" / meta.book_id
    part_2 = (book_dir / "ch-02.md").read_bytes()
    two_parts = {**dict(list(PDF_CHAPTERS.items())[:2]), "Chapter 2: Moorings": "Heavy chains run to the sea bed."}

    ingest_book(make_pdf(tmp_path / "two" / "harbour-charts.pdf", two_parts), vault, target_chapters=[1], replace=True)

    assert (book_dir / "ch-02.md").read_bytes() == part_2, "a part that the import does not read again stays as it was"
    assert sorted(path.name for path in book_dir.glob("ch-*.md")) == ["ch-01.md", "ch-02.md"]
    assert [chapter["file_path"] for chapter in json.loads((book_dir / "_meta.json").read_bytes())["spine"]] == [
        "ch-01.md",
        "ch-02.md",
    ]


def test_a_book_that_fails_the_check_does_not_replace_the_book(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    vault = tmp_path / "vault"
    epub = make_epub(tmp_path / f"{BOOK}.epub", THREE_CHAPTERS)
    ingest_book(epub, vault, book_id=BOOK)
    write_reader_files(vault)
    before = vault_files(vault)
    drop_an_anchor(monkeypatch)

    with pytest.raises(Exception) as stopped:
        ingest_book(epub, vault, book_id=BOOK, replace=True)

    assert "ch-01.md: 1 paragraph has no anchor." in str(stopped.value), "the stop names each problem"
    assert vault_files(vault) == before, "the vault keeps the book that it had"
    assert not (vault / ".import").exists()


def test_the_command_line_stops_a_book_that_fails_the_check_without_a_crash(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
):
    epub = make_epub(tmp_path / f"{BOOK}.epub", THREE_CHAPTERS)
    drop_an_anchor(monkeypatch)
    monkeypatch.setattr(sys, "argv", ["book-ingest", str(epub), "--vault", str(tmp_path / "vault")])

    with pytest.raises(SystemExit) as stopped:
        ingest.cli.main()

    printed = capsys.readouterr().err
    assert stopped.value.code == 1
    assert "1 paragraph has no anchor" in printed and "Traceback" not in printed, printed
    assert vault_files(tmp_path / "vault") == {}


def test_the_inbox_keeps_a_book_that_fails_the_check_out_of_the_vault(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
):
    spec = importlib.util.spec_from_file_location("process_inbox", SKILLS / "process-inbox.py")
    assert spec and spec.loader
    inbox = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inbox)
    monkeypatch.setattr(inbox, "INBOX_DIR", tmp_path / "inbox")
    monkeypatch.setattr(inbox, "PROCESSED_DIR", tmp_path / "inbox" / "processed")
    monkeypatch.setattr(inbox, "VAULT_DIR", tmp_path / "vault")
    monkeypatch.setattr(sys, "argv", ["process-inbox.py"])
    make_epub(tmp_path / "inbox" / f"{BOOK}.epub", THREE_CHAPTERS)
    drop_an_anchor(monkeypatch)

    assert inbox.main() == 0
    report = capsys.readouterr()

    assert vault_files(tmp_path / "vault") == {}, "no book, no notes and no ledger line"
    assert (tmp_path / "inbox" / f"{BOOK}.epub").exists(), "the file stays in the inbox"
    assert re.search(r"\|\s*harbour-notes\s*\|[^\n]*\|\s*FAIL\s*\|\s*Failed\s*\|", report.out), report.out
    assert "Success" not in report.out, report.out
    assert "1 paragraph has no anchor" in report.err, report.err


def test_two_imports_of_the_same_file_write_the_same_bytes(tmp_path: Path):
    epub = make_epub(tmp_path / f"{BOOK}.epub", THREE_CHAPTERS, picture_in="Storms")
    ingest_book(epub, tmp_path / "epub-1")
    # The second import runs in a process of its own, with another hash seed
    seed = "2" if os.environ.get("PYTHONHASHSEED") == "1" else "1"
    code = (
        "import sys; from pathlib import Path; from ingest.pipeline import ingest_book; "
        "ingest_book(Path(sys.argv[1]), Path(sys.argv[2]))"
    )
    subprocess.run(
        [sys.executable, "-c", code, str(epub), str(tmp_path / "epub-2")],
        cwd=Path(ingest.__file__).resolve().parents[1],
        env={**os.environ, "PYTHONHASHSEED": seed},
        check=True,
        capture_output=True,
    )
    pdf = make_pdf(tmp_path / "harbour-charts.pdf", PDF_CHAPTERS)
    ingest_book(pdf, tmp_path / "pdf-1")
    ingest_book(pdf, tmp_path / "pdf-2")

    assert vault_files(tmp_path / "epub-1") == vault_files(tmp_path / "epub-2")
    assert vault_files(tmp_path / "pdf-1") == vault_files(tmp_path / "pdf-2")
