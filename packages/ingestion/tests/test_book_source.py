"""A book from another file with the same book id is never replaced, and a file finds the book it made (IN-03).

A book id comes from the name of the file, so two files can give the same id: "Principles of Marketing 2020.pdf" and
"Principles of Marketing 2023.pdf" both give "principles-of-marketing". The import of the second file stopped with
"The vault already has the book", and --force then replaced the 2020 edition with the 2023 edition.
"""

import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pymupdf
import pytest

from ingest.pipeline import ingest_book
from ingest.reimport import BookAlreadyInVaultError, BookIdTakenError
from ingest.sample_generator import create_sample_epub

BOOK_ID = "principles-of-marketing"
OLD = "Principles of Marketing 2020.pdf"
NEW = "Principles of Marketing 2023.pdf"
READER_FILES = {"ch-01-notes.md": "# My notes on the 2020 edition\n", "inspectional.json": '{"exitAssessment": null}'}


def make_pdf(path: Path, words: str) -> Path:
    """A PDF with one chapter and no title of its own, so the import takes the file name as its title."""
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open()
    doc.new_page().insert_text((50, 50), f"# Chapter 1: Customers\n\n{words}")
    doc.set_toc([[1, "Chapter 1: Customers", 1]])
    doc.save(str(path))
    doc.close()
    return path


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def files_under(folder: Path) -> dict:
    """Every file under `folder`, with the sha256 of its bytes."""
    return {str(path.relative_to(folder)): sha256(path) for path in sorted(folder.rglob("*")) if path.is_file()}


def title_of(vault: Path, book_id: str) -> str:
    return json.loads((vault / "books" / book_id / "_meta.json").read_text(encoding="utf-8"))["title"]


@pytest.fixture
def files(tmp_path: Path) -> Path:
    """The files of two editions of a book, whose names differ only by the year."""
    folder = tmp_path / "files"
    make_pdf(folder / OLD, "The 2020 edition says that marketing engages customers.")
    make_pdf(folder / NEW, "The 2023 edition says that marketing builds relationships.")
    return folder


@pytest.fixture
def vault(tmp_path: Path, files: Path) -> Path:
    """A vault with the 2020 edition in it, and the reader's own files for it."""
    vault = tmp_path / "vault"
    ingest_book(files / OLD, vault)
    for name, text in READER_FILES.items():
        (vault / "notes" / BOOK_ID / name).write_text(text, encoding="utf-8")
    return vault


def test_an_import_records_the_file_that_the_book_came_from(vault: Path, files: Path, tmp_path: Path) -> None:
    epub = create_sample_epub(tmp_path / "sample.epub")
    ingest_book(epub, vault)

    pdf_meta = json.loads((vault / "books" / BOOK_ID / "_meta.json").read_text(encoding="utf-8"))
    epub_meta = json.loads((vault / "books" / "sample" / "_meta.json").read_text(encoding="utf-8"))
    assert pdf_meta.get("source") == {"file_name": OLD, "sha256": sha256(files / OLD)}
    assert epub_meta.get("source") == {"file_name": "sample.epub", "sha256": sha256(epub)}


@pytest.mark.parametrize("force", [False, True])
def test_a_book_from_another_file_with_the_same_id_is_never_replaced(vault: Path, files: Path, force: bool) -> None:
    before = files_under(vault)

    with pytest.raises(BookIdTakenError, match=OLD):
        ingest_book(files / NEW, vault, replace=force)

    assert files_under(vault) == before, "the other book and the reader's files for it stay as they were"


def test_the_command_line_names_the_other_file_and_imports_the_book_with_its_own_id(vault: Path, files: Path) -> None:
    own_id = f"{BOOK_ID}-{sha256(files / NEW)[:8]}"

    def run(*extra: str) -> subprocess.CompletedProcess:
        command = [sys.executable, "-m", "ingest.cli", str(files / NEW), "--vault", str(vault), *extra]
        return subprocess.run(command, capture_output=True, text=True, encoding="utf-8")

    before = files_under(vault)
    stopped = run("--force")
    assert stopped.returncode == 1, stopped.stdout + stopped.stderr
    assert "Traceback" not in stopped.stderr, "a stopped import is not a crash"
    assert OLD in stopped.stderr, stopped.stderr
    assert f"--book-id {own_id}" in stopped.stderr, "how to import the file as a different book"
    assert f"--book-id {BOOK_ID} --force" in stopped.stderr, "how to replace the other book with the file"
    assert files_under(vault) == before

    imported = run("--book-id", own_id)
    assert imported.returncode == 0, imported.stderr
    assert title_of(vault, BOOK_ID) == "Principles of Marketing 2020"
    assert title_of(vault, own_id) == "Principles of Marketing 2023"


def test_only_a_book_id_given_with_force_replaces_the_book_from_the_other_file(vault: Path, files: Path, capsys) -> None:
    with pytest.raises(BookIdTakenError, match=OLD):
        ingest_book(files / NEW, vault, book_id=BOOK_ID)

    ingest_book(files / NEW, vault, book_id=BOOK_ID, replace=True)

    assert title_of(vault, BOOK_ID) == "Principles of Marketing 2023"
    for name, text in READER_FILES.items():
        assert (vault / "notes" / BOOK_ID / name).read_text(encoding="utf-8") == text, "the reader's files are kept"
    assert OLD in capsys.readouterr().err, "the import names the file of the book that it replaces"


def test_a_file_finds_the_book_it_made_under_another_id(vault: Path, files: Path, tmp_path: Path) -> None:
    own_id = f"{BOOK_ID}-{sha256(files / NEW)[:8]}"
    ingest_book(files / NEW, vault, book_id=own_id)
    first_edition = files_under(vault / "books" / BOOK_ID)

    ingest_book(files / NEW, vault, replace=True)
    assert files_under(vault / "books" / BOOK_ID) == first_edition, "the same file replaces its own book"

    renamed = tmp_path / "copies" / "PoM (my copy).pdf"
    renamed.parent.mkdir()
    shutil.copyfile(files / NEW, renamed)
    with pytest.raises(BookAlreadyInVaultError, match=own_id):
        ingest_book(renamed, vault)

    annotated = make_pdf(tmp_path / "annotated" / NEW, "The 2023 edition, with the notes of the reader in it.")
    with pytest.raises(BookAlreadyInVaultError, match=own_id):
        ingest_book(annotated, vault)


def test_a_book_whose_file_the_vault_does_not_record_stops_as_before_and_says_so(vault: Path, files: Path) -> None:
    meta_path = vault / "books" / BOOK_ID / "_meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta.pop("source", None)  # like a book that an import before IN-03 made
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    before = files_under(vault)

    with pytest.raises(BookAlreadyInVaultError, match="does not record the file"):
        ingest_book(files / NEW, vault)

    assert files_under(vault) == before


def test_the_inbox_stops_a_book_whose_id_another_file_has_and_imports_it_with_its_own_id(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    spec = importlib.util.spec_from_file_location("process_inbox", Path(".agent/skills/process-inbox.py"))
    assert spec and spec.loader
    inbox = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inbox)
    monkeypatch.setattr(inbox, "INBOX_DIR", tmp_path / "inbox")
    monkeypatch.setattr(inbox, "PROCESSED_DIR", tmp_path / "inbox" / "processed")
    monkeypatch.setattr(inbox, "VAULT_DIR", tmp_path / "vault")
    monkeypatch.setattr(inbox, "LEDGER_FILE", tmp_path / "vault" / "_ledger.json")
    monkeypatch.setattr(sys, "argv", ["process-inbox.py"])
    make_pdf(tmp_path / "inbox" / OLD, "The 2020 edition says that marketing engages customers.")
    assert inbox.main() == 0
    new_file = make_pdf(tmp_path / "inbox" / NEW, "The 2023 edition says that marketing builds relationships.")
    own_id = f"{BOOK_ID}-{sha256(new_file)[:8]}"
    before = files_under(tmp_path / "vault")
    capsys.readouterr()

    assert inbox.main() == 0
    report = capsys.readouterr()
    assert "Stopped" in report.out
    assert new_file.exists(), "the file stays in the inbox"
    assert files_under(tmp_path / "vault") == before
    assert f'--book "{NEW}" --book-id {own_id}' in report.err, report.err
    assert f'--force --book "{NEW}" --book-id {BOOK_ID}' in report.err, report.err

    monkeypatch.setattr(sys, "argv", ["process-inbox.py", "--book", NEW, "--book-id", own_id])
    assert inbox.main() == 0
    assert sorted(path.name for path in (tmp_path / "vault" / "books").iterdir()) == [BOOK_ID, own_id]
    assert (tmp_path / "inbox" / "processed" / NEW).exists(), "the imported file moves to inbox/processed"
