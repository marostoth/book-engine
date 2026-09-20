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

A ledger that is there and cannot be read is never read as no lines (DS-18). It used to be, and the
inbox then added its one new record to that emptiness and wrote it back, so the record of every book
ever taken in became a single line. The Rust side of this project states the rule in as many words and
has obeyed it since DS-04: a damaged file gives an error, and its bytes are kept in a dated copy. This
module does the same, and a write that would leave fewer lines than the file already holds is refused,
because the ledger is a record and a record only grows.
"""

from __future__ import annotations

import contextlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ingest.line_endings import write_text_file

LEDGER_NAME = "_ledger.json"


class LedgerDamaged(Exception):
    """The ledger is there and could not be read. It is never read as no lines (DS-18)."""


class LedgerWouldShrink(Exception):
    """A write would leave fewer lines in the ledger than the file already holds (DS-18)."""


def ledger_path(vault_dir: Path) -> Path:
    return Path(vault_dir) / LEDGER_NAME


def read_ledger(vault_dir: Path) -> list[dict[str, Any]]:
    """The lines of the ledger, or an empty list when there is no ledger.

    A vault with no ledger has no lines, which is what a first run meets. A ledger that **is** there and
    cannot be read raises `LedgerDamaged` instead, and its bytes are first kept in a copy named
    `_ledger.json.corrupt-<time>` beside it. The two answers were the same answer until DS-18, and the
    caller could only read them the second way: it added its one new record to nothing and wrote that
    back over the record of every book ever taken in.

    A file that parses is not damaged. A line that is not an object is still left out of the answer, as
    before, because the file itself is whole and only that one line says nothing.
    """
    path = ledger_path(vault_dir)
    if not path.is_file():
        return []

    try:
        raw = path.read_bytes()
    except OSError as err:
        raise LedgerDamaged(f"{path} is there and could not be read: {err}") from err

    try:
        # `utf-8-sig` drops the byte order mark that some editors write at the start of a UTF-8 file. It
        # carries no data, and the vault's Rust reader has always dropped it (DS-04).
        data = json.loads(raw.decode("utf-8-sig"))
    except ValueError as err:
        raise LedgerDamaged(damage_of(path, raw, err)) from err

    if isinstance(data, list):
        return [line for line in data if isinstance(line, dict)]
    if isinstance(data, dict):
        return [line for line in data.values() if isinstance(line, dict)]
    raise LedgerDamaged(damage_of(path, raw, f"a ledger is a list of lines, and this file holds {type(data).__name__}"))


def kept_copy_of(path: Path, raw: bytes, when: datetime | None = None) -> Path:
    """Copies damaged bytes to `<file name>.corrupt-<time>` beside the file, and gives that path.

    The same damaged bytes give one copy only, however many times the ledger is read, so a run that reads
    it twice does not fill the vault with copies of one file. `when` is the moment the name carries, and
    it is an argument because the rule only shows itself across two of them: two reads inside one second
    write the same name anyway, and a test that cannot part the two moments proves nothing.
    """
    prefix = f"{path.name}.corrupt-"
    for kept in sorted(path.parent.glob(f"{prefix}*")):
        with contextlib.suppress(OSError):
            if kept.read_bytes() == raw:
                return kept
    copy = path.parent / f"{prefix}{(when or datetime.now(UTC)).strftime('%Y%m%dT%H%M%SZ')}"
    copy.write_bytes(raw)
    return copy


def damage_of(path: Path, raw: bytes, why: object) -> str:
    """What `LedgerDamaged` says: what is wrong, and where the bytes were kept."""
    try:
        copy = kept_copy_of(path, raw)
    except OSError as err:
        return f"{path} is damaged and was left as it is: {why}. The copy failed as well: {err}."
    return f"{path} is damaged and was left as it is: {why}. A copy is at {copy}."


def write_ledger(vault_dir: Path, lines: list[dict[str, Any]], may_be_shorter: bool = False) -> None:
    """Writes the ledger, in one step, so a stopped run never leaves half a file.

    A write holding fewer lines than the file already holds is refused with `LedgerWouldShrink`, because
    the ledger is the record of every book ever taken in and a record only grows. A caller that means it
    says `may_be_shorter=True`, so taking a line out is a thing somebody wrote down (DS-18).

    The count comes from reading the file, so a ledger that cannot be read is not written over at all.
    """
    path = ledger_path(vault_dir)
    if not may_be_shorter:
        already = len(read_ledger(vault_dir))
        if len(lines) < already:
            raise LedgerWouldShrink(
                f"{path} holds {already} lines and this write holds {len(lines)}. The ledger is the record of "
                f"every book ever taken in, so it only grows. A caller that means to take a line out says "
                f"may_be_shorter=True."
            )
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

    A ledger that cannot be read is left exactly as it is, and this says so on the error stream. The book
    is in the vault by the time the numbers are kept true, so a ledger nobody can read may not turn
    finished work into a failed import (IN-09); writing a ledger that was never read is the very loss the
    reading guard exists to stop (DS-18). The bytes are kept in a copy, and the audit says so next run.
    """
    try:
        lines = read_ledger(vault_dir)
    except LedgerDamaged as damage:
        print(f"[!] The ledger was left exactly as it is: {damage}", file=sys.stderr)
        return False
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
