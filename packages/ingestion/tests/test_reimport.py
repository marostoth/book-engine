"""An import never replaces a book that is already in the vault, unless the caller asks for it (DS-09)."""

import hashlib
import importlib.util
import json
import subprocess
import sys
import zipfile
from pathlib import Path

import pymupdf
import pytest

from ingest.pipeline import ingest_book, ingest_epub
from ingest.reimport import BookAlreadyInVaultError
from ingest.sample_generator import create_sample_epub

from conftest import SKILLS

ASSESSMENT = {
    "classification": "Theoretical - Science",
    "unityStatement": "Computers agree on one order of events by voting in groups that overlap.",
    "partsStructure": ["Consistency models", "Consensus"],
    "completedAt": "2026-09-16T10:00:00.000Z",
}

READER_FILES = ["ch-01-highlights.json", "ch-01-notes.md", "inspectional.json"]


def vault_files(vault_dir: Path) -> dict:
    """Every file in the vault, with the sha256 of its bytes."""
    return {
        str(path.relative_to(vault_dir)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(vault_dir.rglob("*"))
        if path.is_file()
    }


def write_reader_files(vault_dir: Path) -> None:
    """The files a reader makes for the sample book: an exit assessment, notes, and highlights."""
    notes = vault_dir / "notes" / "sample"
    notes.mkdir(parents=True, exist_ok=True)
    (notes / "inspectional.json").write_text(json.dumps({"exitAssessment": ASSESSMENT}, indent=2), encoding="utf-8")
    (notes / "ch-01-notes.md").write_text("# Notes\n\n- One order of operations (^p-001)\n", encoding="utf-8")
    (notes / "ch-01-highlights.json").write_text('[{"id": "h1", "exact": "linearizability"}]', encoding="utf-8")


@pytest.fixture
def read_book(tmp_path: Path):
    """A vault with the sample book in it, and the reader's own files for that book."""
    epub = tmp_path / "sample.epub"
    create_sample_epub(epub)
    vault = tmp_path / "vault"
    ingest_epub(epub, vault, custom_book_id="sample")
    write_reader_files(vault)
    return epub, vault


def test_an_import_of_a_book_the_vault_has_stops_and_changes_nothing(read_book):
    epub, vault = read_book
    before = vault_files(vault)

    with pytest.raises(BookAlreadyInVaultError) as stopped:
        ingest_book(epub, vault, book_id="sample")

    assert vault_files(vault) == before, "no file may change when the import stops"
    assert stopped.value.reader_files == READER_FILES, "practice-deck.md is made by the import, not by the reader"
    assert "inspectional.json" in str(stopped.value), "the message names the reader's files"


def test_a_replacing_import_keeps_the_readers_own_files_and_names_them(read_book, capsys):
    epub, vault = read_book
    notes = vault / "notes" / "sample"
    own = {name: (notes / name).read_bytes() for name in READER_FILES}

    ingest_book(epub, vault, book_id="sample", replace=True)

    assert {name: (notes / name).read_bytes() for name in READER_FILES} == own
    assert "inspectional.json" in capsys.readouterr().err, "a replacing import names the files it keeps"


def test_the_book_file_an_import_makes_has_no_place_for_the_readers_answers(read_book):
    _, vault = read_book

    meta = json.loads((vault / "books" / "sample" / "_meta.json").read_text(encoding="utf-8"))

    assert meta["inspectional_blueprint"]["pivotal_chapters"], "the blueprint itself is still made"
    assert "exit_assessment" not in meta["inspectional_blueprint"]


def test_the_readers_own_files_alone_stop_an_import(tmp_path: Path):
    epub = tmp_path / "sample.epub"
    create_sample_epub(epub)
    vault = tmp_path / "vault"
    write_reader_files(vault)

    with pytest.raises(BookAlreadyInVaultError):
        ingest_epub(epub, vault, custom_book_id="sample")

    assert not (vault / "books").exists(), "nothing is written"


def test_a_book_folder_a_failed_first_import_left_does_not_stop_the_next_import(tmp_path: Path):
    epub = tmp_path / "sample.epub"
    create_sample_epub(epub)
    vault = tmp_path / "vault"
    (vault / "books" / "sample").mkdir(parents=True)
    (vault / "books" / "sample" / "ch-01.md").write_text("# Half a chapter\n", encoding="utf-8")
    (vault / "notes" / "sample").mkdir(parents=True)

    meta = ingest_epub(epub, vault, custom_book_id="sample")

    assert meta.total_chapters == 2


def test_a_pdf_import_of_a_book_the_vault_has_stops_too(tmp_path: Path):
    pdf = tmp_path / "test-book.pdf"
    doc = pymupdf.open()
    doc.new_page().insert_text((50, 50), "# Chapter 1: Introduction\n\nMarketing is engaging customers.")
    doc.new_page().insert_text((50, 50), "# Chapter 2: Strategy\n\nStrategic planning develops a strategic fit.")
    doc.set_toc([[1, "Chapter 1: Introduction", 1], [1, "Chapter 2: Strategy", 2]])
    doc.set_metadata({"title": "Minimal Test Book", "author": "Test Author"})
    doc.save(str(pdf))
    doc.close()
    vault = tmp_path / "vault"
    ingest_book(pdf, vault)
    before = vault_files(vault)

    with pytest.raises(BookAlreadyInVaultError):
        ingest_book(pdf, vault)

    assert vault_files(vault) == before
    pdf.unlink()  # Windows lets the file go only when the stopped import closed it


def test_the_command_line_stops_with_a_message_and_replaces_only_with_force(read_book):
    epub, vault = read_book

    def run(*extra: str) -> subprocess.CompletedProcess:
        command = [sys.executable, "-m", "ingest.cli", str(epub), "--vault", str(vault), "--book-id", "sample", *extra]
        return subprocess.run(command, capture_output=True, text=True)

    before = vault_files(vault)
    stopped = run()
    assert stopped.returncode == 1
    assert "--force" in stopped.stderr, stopped.stderr
    assert "Traceback" not in stopped.stderr, "a stopped import is not a crash"
    assert vault_files(vault) == before

    replaced = run("--force")
    assert replaced.returncode == 0, replaced.stderr
    assert json.loads((vault / "notes" / "sample" / "inspectional.json").read_text(encoding="utf-8")) == {
        "exitAssessment": ASSESSMENT
    }


def copy_with_other_bytes(source: Path, target: Path) -> None:
    """A copy of a book with the same content and other bytes, like a copy another program saved again."""
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(target, "w") as copy:
        for item in original.infolist():
            copy.writestr(item, original.read(item.filename))
        copy.comment = b"saved again"


def test_the_inbox_stops_a_new_copy_of_a_book_the_vault_has_and_keeps_it_in_the_inbox(
    tmp_path: Path, monkeypatch, capsys
):
    spec = importlib.util.spec_from_file_location("process_inbox", SKILLS / "process-inbox.py")
    assert spec and spec.loader
    inbox = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inbox)
    monkeypatch.setattr(inbox, "INBOX_DIR", tmp_path / "inbox")
    monkeypatch.setattr(inbox, "PROCESSED_DIR", tmp_path / "inbox" / "processed")
    monkeypatch.setattr(inbox, "VAULT_DIR", tmp_path / "vault")
    monkeypatch.setattr(sys, "argv", ["process-inbox.py"])
    (tmp_path / "inbox").mkdir()
    create_sample_epub(tmp_path / "inbox" / "sample.epub")
    assert inbox.main() == 0
    write_reader_files(tmp_path / "vault")
    before = vault_files(tmp_path / "vault")

    copy_with_other_bytes(tmp_path / "inbox" / "processed" / "sample.epub", tmp_path / "inbox" / "sample.epub")
    capsys.readouterr()
    assert inbox.main() == 0
    report = capsys.readouterr()

    assert vault_files(tmp_path / "vault") == before, "the book, the reader's files and the ledger stay as they were"
    assert (tmp_path / "inbox" / "sample.epub").exists(), "the new copy stays in the inbox"
    assert "Stopped" in report.out
    assert "--force" in report.err
