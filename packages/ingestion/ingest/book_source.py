"""The file that each book in the vault came from, so an import can tell a new copy of a book from another book.

A book id comes from the name of a file, and two files can give the same id: names that differ only by a year or a
tag, such as "Principles of Marketing 2020.pdf" and "Principles of Marketing 2023.pdf". The import of the second file
stopped with "The vault already has the book", and `--force` then replaced the other book: its chapters, its title and
its practice deck. The reader's notes for that book stayed, and pointed at the new text (IN-03).

Every import now records its file in `_meta.json` (`source`), and `ingest.reimport` compares it with the file of the
book that the vault has.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import List, Optional

from ingest.book_id import BOOK_ID_RULE
from ingest.models import BookSource


def source_of_file(path: Path) -> BookSource:
    """The name of the file at `path`, and the SHA-256 of its bytes."""
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        while chunk := file.read(1 << 20):
            digest.update(chunk)
    return BookSource(file_name=Path(path).name, sha256=digest.hexdigest())


def same_file(recorded: BookSource, source: BookSource) -> bool:
    """Whether two files are one book: the same bytes, or the same name, such as a copy of a PDF with notes in it."""
    return recorded.sha256 == source.sha256 or recorded.file_name.casefold() == source.file_name.casefold()


def recorded_source(vault_dir: Path, book_id: str) -> Optional[BookSource]:
    """The file that the book `book_id` came from.

    None when the vault does not know it: the book has no `_meta.json`, an import before IN-03 made it, or `_meta.json`
    cannot be read.
    """
    meta = Path(vault_dir) / "books" / book_id / "_meta.json"
    try:
        source = json.loads(meta.read_text(encoding="utf-8-sig")).get("source")
        return BookSource.model_validate(source) if source else None
    except (OSError, ValueError, AttributeError):  # a JSON or schema error is a ValueError
        return None


def books_of_file(vault_dir: Path, source: BookSource) -> List[str]:
    """The ids of the books in the vault that came from the file `source`, in the order of their names.

    These are the books with the same bytes, or else the books whose file had the same name.
    """
    books_dir = Path(vault_dir) / "books"
    if not books_dir.is_dir():
        return []
    recorded = [
        (entry.name, recorded_source(vault_dir, entry.name))
        for entry in sorted(books_dir.iterdir())
        if BOOK_ID_RULE.fullmatch(entry.name) and entry.is_dir()
    ]
    same_bytes = [book_id for book_id, other in recorded if other and other.sha256 == source.sha256]
    return same_bytes or [
        book_id for book_id, other in recorded if other and other.file_name.casefold() == source.file_name.casefold()
    ]
