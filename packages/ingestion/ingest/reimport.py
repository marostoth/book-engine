"""An import never replaces a book that is already in the vault, unless the caller asks for it (DS-09).

The vault keeps the reader's own files for a book in `vault/notes/<book-id>/`: notes, highlights, the study log,
the bookmark and the exit assessment. An import makes the chapters, `_meta.json` and `practice-deck.md` again, and
the reader's files point to paragraphs of the old text. Before this check, a changed copy of a book in the inbox,
such as an annotated PDF, replaced the book with no warning, and `--force` did nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import List, Optional, Tuple

from ingest.book_id import check_book_id
from ingest.book_source import books_of_file, recorded_source, same_file, source_of_file
from ingest.models import BookSource

#: The files in `vault/notes/<book-id>/` that an import makes. Every other file there is the reader's own.
IMPORTED_NOTES_FILES = frozenset({"practice-deck.md"})


class BookAlreadyInVaultError(Exception):
    """An import stopped before it changed anything, because the vault already has the book."""

    def __init__(self, book_id: str, reader_files: List[str], file_unknown: bool = False) -> None:
        self.book_id = book_id
        self.reader_files = reader_files
        message = f'The vault already has the book "{book_id}". Nothing was changed.'
        if file_unknown:
            message += " The vault does not record the file of that book, so make sure that this file is the same book."
        if reader_files:
            message += f" {kept_files_note(book_id, reader_files)}"
        super().__init__(message)


class BookIdTakenError(Exception):
    """An import stopped before it changed anything, because a book from another file has its book id (IN-03)."""

    def __init__(self, book_id: str, other_file: str, source: BookSource) -> None:
        self.book_id = book_id
        self.other_file = other_file
        #: A book id that no book has, for when the file is a different book.
        self.own_book_id = f"{book_id[:246].rstrip('-')}-{source.sha256[:8]}"
        super().__init__(
            f'Another book in the vault has the book id "{book_id}". It came from the file "{other_file}". '
            "Nothing was changed."
        )


def kept_files_note(book_id: str, reader_files: List[str]) -> str:
    """Tells the reader which of their files a new import keeps, and what can change for them."""
    return (
        f"Your own files for it are in notes/{book_id}: {', '.join(reader_files)}. "
        "An import keeps them, and they follow their text when a chapter or a paragraph gets another number."
    )


def reader_files(vault_dir: Path, book_id: str) -> List[str]:
    """The names of the reader's own files for a book: everything in `notes/<book-id>/` that an import does not make."""
    notes_dir = Path(vault_dir) / "notes" / book_id
    if not notes_dir.is_dir():
        return []
    return sorted(entry.name for entry in notes_dir.iterdir() if entry.name not in IMPORTED_NOTES_FILES)


def book_to_import(
    vault_dir: Path, file_path: Path, name_id: str, given_id: Optional[str], replace: bool
) -> Tuple[str, BookSource]:
    """The book id that an import of `file_path` writes, and the file to record in its `_meta.json`.

    Call it before the import writes anything. A given id (`--book-id`) is used as it is. Otherwise a book that the
    same file made keeps its id, also when the file has another name now, and a new file gets `name_id`, the id of its
    name. Then `check_book_can_be_imported` stops the import when it must.
    """
    source = source_of_file(file_path)
    book_id = given_id
    if book_id is None:
        books = books_of_file(vault_dir, source)
        book_id = books[0] if books else name_id
    check_book_can_be_imported(vault_dir, book_id, replace, source, id_given=given_id is not None)
    return book_id, source


def check_book_can_be_imported(
    vault_dir: Path, book_id: str, replace: bool, source: BookSource, id_given: bool
) -> None:
    """Stops the import of a book that the vault already has, unless `replace` is true.

    Call it before the import writes anything. A book id that does not follow the rule of `ingest.book_id` stops the
    import first, because the id names the folders of the book (SEC-03). The vault has the book when
    `books/<book-id>/_meta.json` exists, or when `notes/<book-id>/` holds files of the reader. A book folder that a
    failed first import left with no `_meta.json`, and no files of the reader, does not stop the import. A replacing
    import names the files it keeps.

    A book that came from another file is another book, so `replace` alone never replaces it: only an id given with
    `--book-id` does (IN-03). A book whose file the vault does not record stops and is replaced as before.
    """
    check_book_id(book_id)
    files = reader_files(vault_dir, book_id)
    has_meta = (Path(vault_dir) / "books" / book_id / "_meta.json").exists()
    if not has_meta and not files:
        return
    recorded = recorded_source(vault_dir, book_id) if has_meta else None
    other_file = recorded.file_name if recorded and not same_file(recorded, source) else None
    if other_file and not (replace and id_given):
        raise BookIdTakenError(book_id, other_file, source)
    if not replace:
        raise BookAlreadyInVaultError(book_id, files, file_unknown=has_meta and recorded is None)
    came_from = f', which came from the file "{other_file}"' if other_file else ", which the vault already has"
    note = f" {kept_files_note(book_id, files)}" if files else ""
    print(f'[!] Replacing the book "{book_id}"{came_from}.{note}', file=sys.stderr, flush=True)
