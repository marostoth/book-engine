"""An import builds a book in `vault/.import/<book-id>/`, checks it there, and then puts it in the vault (IN-05)."""

import hashlib
import importlib.util
import os
import shutil
import stat
from pathlib import Path
from typing import Dict

import pytest

from ingest.book_build import BookBuild, BookLeftAsideError
from ingest.book_check import book_problems
from ingest.pipeline import ingest_book
from ingest.sample_generator import create_sample_epub

from conftest import SKILLS


def vault_files(vault: Path) -> Dict[str, str]:
    return {
        path.relative_to(vault).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(vault.rglob("*"))
        if path.is_file()
    }


def mark_read_only(folder: Path) -> None:
    """Marks `folder` and every folder in it read-only, as OneDrive marks the folders of the real vault."""
    for path in [folder, *(path for path in folder.rglob("*") if path.is_dir())]:
        os.chmod(path, stat.S_IREAD)


WINDOWS = pytest.mark.skipif(os.name != "nt", reason="Windows marks folders read-only")


@pytest.fixture
def sample(tmp_path: Path):
    """A vault with the sample book in it."""
    epub = tmp_path / "sample.epub"
    create_sample_epub(epub)
    vault = tmp_path / "vault"
    ingest_book(epub, vault, book_id="sample")
    return epub, vault


def test_what_an_import_that_was_killed_left_does_not_stop_the_next_import(sample):
    epub, vault = sample
    book_files = sorted(path.name for path in (vault / "books" / "sample").iterdir())
    (vault / ".import" / "sample").mkdir(parents=True)
    (vault / ".import" / "sample" / "ch-09.md").write_text("Half a chapter", encoding="utf-8")
    (vault / ".import" / "sample.replaced").mkdir()
    (vault / ".import" / "sample.replaced" / "_meta.json").write_text("{}", encoding="utf-8")

    ingest_book(epub, vault, book_id="sample", replace=True)

    assert sorted(path.name for path in (vault / "books" / "sample").iterdir()) == book_files
    assert not (vault / ".import").exists(), "the import removes the folders that a killed import left"


@WINDOWS
def test_a_book_folder_that_windows_marks_read_only_is_replaced_and_nothing_stays(sample):
    epub, vault = sample
    mark_read_only(vault / "books" / "sample")

    ingest_book(epub, vault, book_id="sample", replace=True)
    assert not (vault / ".import").exists(), "the old book folder is removed, also with the mark"
    ingest_book(epub, vault, book_id="sample", replace=True)

    assert not (vault / ".import").exists()


@WINDOWS
def test_read_only_folders_that_a_killed_import_left_do_not_stop_the_next_import(sample):
    _, vault = sample
    for name in ("sample", "sample.replaced"):
        (vault / ".import" / name / "assets").mkdir(parents=True)
        mark_read_only(vault / ".import" / name)
    mark_read_only(vault / "books" / "sample")

    # An import of some parts copies the book folder, and a copy of a read-only folder is read-only too
    build = BookBuild(vault, "sample", from_book=True)
    assert not (vault / ".import" / "sample.replaced").exists()
    build.remove()

    assert not (vault / ".import").exists()


def test_a_book_that_an_import_left_aside_stops_the_next_import(sample):
    epub, vault = sample
    # A power cut came after the import moved the old book folder aside, and before the new one took its place
    (vault / ".import").mkdir()
    shutil.move(vault / "books" / "sample", vault / ".import" / "sample.replaced")
    before = vault_files(vault)

    with pytest.raises(BookLeftAsideError) as stopped:
        ingest_book(epub, vault, book_id="sample", replace=True)

    assert "Move that folder back to" in str(stopped.value)
    assert vault_files(vault) == before, "the import changes nothing, and the old book stays where it is"


def test_the_check_names_each_paragraph_with_no_anchor_and_each_footnote_link_with_no_note(tmp_path: Path):
    book = tmp_path / "book"
    book.mkdir()
    (book / "ch-01.md").write_text(
        "# Tides\n\nA tide rises twice a day. ^p-001\n\nPilots read the tables.[^1] See also [^3].\n\n"
        "Slack water is short.\n\n[^2]: The port office prints them. ^p-004\n",
        encoding="utf-8",
    )
    (book / "ch-02.md").write_text(
        "# Moorings\n\nA mooring holds a ship.[^1] ^p-001\n\n[^1]: A chain. ^p-002\n", encoding="utf-8"
    )

    assert book_problems(book) == [
        "ch-01.md: 2 paragraphs have no anchor.",
        "ch-01.md: these footnote links have no note: 1, 3.",
    ]


def test_the_anchor_audit_uses_the_check_of_the_import(tmp_path: Path, capsys: pytest.CaptureFixture):
    spec = importlib.util.spec_from_file_location("audit_anchors", SKILLS / "audit-anchors.py")
    assert spec and spec.loader
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    book = tmp_path / "book"
    book.mkdir()
    (book / "ch-01.md").write_text("# Tides\n\nA tide rises twice a day.\n", encoding="utf-8")

    assert audit.audit_book(book) is False
    assert capsys.readouterr().out == "[-] ch-01.md: 1 paragraph has no anchor.\n"
