"""A book id names the folders of a book in the vault, so an import refuses an id that could lead out of it (SEC-03)."""

import subprocess
import sys
from pathlib import Path

import pymupdf
import pytest
from ingest.pipeline import ingest_book
from ingest.sample_generator import create_sample_epub

#: Ids that lead out of `vault/books/` and `vault/notes/`, or that hold a character the app does not take.
#: `<absolute>` stands for an absolute path next to the vault.
REFUSED_IDS = [
    "../../escaped",
    "..\\..\\escaped",
    "books/../../escaped",
    "<absolute>",
    "Escaped Book",
    "escaped.book",
    "-escaped",
]


def files_under(folder: Path) -> list[str]:
    """Every file and folder under `folder`, as paths from it."""
    return sorted(path.relative_to(folder).as_posix() for path in folder.rglob("*"))


def empty_vault(tmp_path: Path) -> tuple[Path, Path]:
    """A folder that holds an empty vault and nothing else, and the vault."""
    work = tmp_path / "work"
    vault = work / "vault"
    vault.mkdir(parents=True)
    return work, vault


@pytest.mark.parametrize("book_id", REFUSED_IDS)
def test_an_epub_import_with_a_book_id_that_could_lead_out_of_the_vault_writes_nothing(
    tmp_path: Path, book_id: str
) -> None:
    epub = tmp_path / "sample.epub"
    create_sample_epub(epub)
    work, vault = empty_vault(tmp_path)
    if book_id == "<absolute>":
        book_id = str(work / "escaped")

    with pytest.raises(ValueError, match="book id"):
        ingest_book(epub, vault, book_id=book_id)

    assert files_under(work) == ["vault"], "nothing may be written, in the vault or next to it"


def test_a_pdf_import_with_a_book_id_that_could_lead_out_of_the_vault_writes_nothing(tmp_path: Path) -> None:
    pdf = tmp_path / "test-book.pdf"
    doc = pymupdf.open()
    doc.new_page().insert_text((50, 50), "# Chapter 1: Introduction\n\nMarketing is engaging customers.")
    doc.set_toc([[1, "Chapter 1: Introduction", 1]])
    doc.save(str(pdf))
    doc.close()
    work, vault = empty_vault(tmp_path)

    with pytest.raises(ValueError, match="book id"):
        ingest_book(pdf, vault, book_id="../../escaped")

    assert files_under(work) == ["vault"], "nothing may be written, in the vault or next to it"
    pdf.unlink()  # Windows lets the file go only when the stopped import closed it


def test_the_command_line_refuses_a_book_id_that_could_lead_out_of_the_vault(tmp_path: Path) -> None:
    epub = tmp_path / "sample.epub"
    create_sample_epub(epub)
    work, vault = empty_vault(tmp_path)
    command = [sys.executable, "-m", "ingest.cli", str(epub), "--vault", str(vault), "--book-id", "../../cli-escaped"]

    stopped = subprocess.run(command, capture_output=True, text=True, check=False)

    assert stopped.returncode == 1, stopped.stdout + stopped.stderr
    assert "book id" in stopped.stderr, stopped.stderr
    assert "Traceback" not in stopped.stderr, "a refused book id is not a crash"
    assert files_under(work) == ["vault"], "nothing may be written, in the vault or next to it"
