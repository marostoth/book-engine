"""The intake ledger, `vault/_ledger.json`: which file made which book, and how big that book is.

The inbox writes a line for each file it takes in, and reads the lines to know a file it has already
taken in, by the SHA-256 of its bytes. The line also carries the number of chapters and words of the
book it made.

Those two numbers used to go stale (CQ-04 is a fix, CQ-05 is this one). The inbox was the only thing
that wrote them, so a book imported again from the command line changed its `_meta.json` and left the
ledger saying the old numbers. Both PDF books of the owner's vault drifted that way.

So an import now keeps the numbers of a book the ledger already knows. It never adds a line: only the
inbox takes a file in, because only the inbox knows the file it moved into `inbox/processed/`. A book
imported from the command line that the ledger does not know stays unknown to it, as before.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ingest.line_endings import write_text_file

LEDGER_NAME = "_ledger.json"


def ledger_path(vault_dir: Path) -> Path:
    return Path(vault_dir) / LEDGER_NAME


def read_ledger(vault_dir: Path) -> list[dict[str, Any]]:
    """The lines of the ledger, or an empty list when it is missing or unreadable."""
    path = ledger_path(vault_dir)
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    if isinstance(data, list):
        return [line for line in data if isinstance(line, dict)]
    if isinstance(data, dict):
        return [line for line in data.values() if isinstance(line, dict)]
    return []


def write_ledger(vault_dir: Path, lines: list[dict[str, Any]]) -> None:
    """Writes the ledger, in one step, so a stopped run never leaves half a file."""
    path = ledger_path(vault_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    nearly = path.with_suffix(".tmp")
    write_text_file(nearly, json.dumps(lines, indent=2))
    nearly.replace(path)


def book_numbers(vault_dir: Path, book_id: str) -> dict[str, int] | None:
    """The number of chapters and words that a book of the vault says it has, or None when it has none.

    A book that is not there, and one whose `_meta.json` cannot be read or does not hold the two
    numbers, both give None: there is then nothing to check a line of the ledger against.
    """
    meta_path = Path(vault_dir) / "books" / book_id / "_meta.json"
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(meta, dict):
        return None
    chapters, words = meta.get("total_chapters"), meta.get("total_words")
    if not isinstance(chapters, int) or not isinstance(words, int):
        return None
    return {"total_chapters": chapters, "total_words": words}


def keep_numbers_true(vault_dir: Path, book_id: str, chapters: int, words: int) -> bool:
    """Writes `chapters` and `words` into every line of the ledger for `book_id`. True when a line changed.

    Nothing happens when the ledger has no line for that book: only the inbox takes a file in.
    """
    lines = read_ledger(vault_dir)
    changed = False
    for line in lines:
        if line.get("book_id") != book_id:
            continue
        if line.get("total_chapters") != chapters or line.get("total_words") != words:
            line["total_chapters"] = chapters
            line["total_words"] = words
            changed = True
    if changed:
        write_ledger(vault_dir, lines)
    return changed


def lines_that_disagree(vault_dir: Path) -> list[dict[str, Any]]:
    """Every line of the ledger whose numbers differ from the book's own `_meta.json`.

    A line whose book is not in the vault is left out: its numbers are the record of an import that
    happened, and no book is there to check them against.
    """
    out: list[dict[str, Any]] = []
    for line in read_ledger(vault_dir):
        book_id = line.get("book_id")
        if not isinstance(book_id, str):
            continue
        numbers = book_numbers(vault_dir, book_id)
        if numbers is None:
            continue
        if (line.get("total_chapters"), line.get("total_words")) != (
            numbers["total_chapters"],
            numbers["total_words"],
        ):
            out.append(
                {
                    "book_id": book_id,
                    "ledger_chapters": line.get("total_chapters"),
                    "ledger_words": line.get("total_words"),
                    "book_chapters": numbers["total_chapters"],
                    "book_words": numbers["total_words"],
                }
            )
    return out
