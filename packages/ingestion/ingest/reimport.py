"""An import never replaces a book that is already in the vault, unless the caller asks for it (DS-09).

The vault keeps the reader's own files for a book in `vault/notes/<book-id>/`: notes, highlights, the study log,
the bookmark and the exit assessment. An import makes the chapters, `_meta.json` and `practice-deck.md` again, and
the reader's files point to paragraphs of the old text. Before this check, a changed copy of a book in the inbox,
such as an annotated PDF, replaced the book with no warning, and `--force` did nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import List

#: The files in `vault/notes/<book-id>/` that an import makes. Every other file there is the reader's own.
IMPORTED_NOTES_FILES = frozenset({"practice-deck.md"})


class BookAlreadyInVaultError(Exception):
    """An import stopped before it changed anything, because the vault already has the book."""

    def __init__(self, book_id: str, reader_files: List[str]) -> None:
        self.book_id = book_id
        self.reader_files = reader_files
        message = f'The vault already has the book "{book_id}". Nothing was changed.'
        if reader_files:
            message += f" {kept_files_note(book_id, reader_files)}"
        super().__init__(message)


def kept_files_note(book_id: str, reader_files: List[str]) -> str:
    """Tells the reader which of their files a new import keeps, and what can change for them."""
    return (
        f"Your own files for it are in notes/{book_id}: {', '.join(reader_files)}. "
        "An import keeps them, but a paragraph they point to can be a different paragraph after it."
    )


def reader_files(vault_dir: Path, book_id: str) -> List[str]:
    """The names of the reader's own files for a book: everything in `notes/<book-id>/` that an import does not make."""
    notes_dir = Path(vault_dir) / "notes" / book_id
    if not notes_dir.is_dir():
        return []
    return sorted(entry.name for entry in notes_dir.iterdir() if entry.name not in IMPORTED_NOTES_FILES)


def check_book_can_be_imported(vault_dir: Path, book_id: str, replace: bool) -> None:
    """Stops the import of a book that the vault already has, unless `replace` is true.

    Call it before the import writes anything. The vault has the book when `books/<book-id>/_meta.json` exists, or
    when `notes/<book-id>/` holds files of the reader. A book folder that a failed first import left with no
    `_meta.json`, and no files of the reader, does not stop the import. A replacing import names the files it keeps.
    """
    files = reader_files(vault_dir, book_id)
    in_vault = (Path(vault_dir) / "books" / book_id / "_meta.json").exists() or bool(files)
    if not in_vault:
        return
    if not replace:
        raise BookAlreadyInVaultError(book_id, files)
    note = f" {kept_files_note(book_id, files)}" if files else ""
    print(f'[!] Replacing the book "{book_id}", which the vault already has.{note}', file=sys.stderr, flush=True)
