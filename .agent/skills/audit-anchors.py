#!/usr/bin/env python3
"""Audits ingested Markdown files for missing paragraph anchors and broken footnote links.

It uses the check that an import runs on a book before the book goes into the vault (`ingest/book_check.py`, IN-05).

A check that reads nothing says so and fails (TL-04). This script used to print "All chapters passed" and stop with 0
for a folder that does not exist, and for `vault/books`, which holds book folders and no chapter file of its own.
`vault/books` is what it reads when nobody names a folder, so the shortest way to run it checked nothing at all.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "packages" / "ingestion"))

from ingest.book_check import book_problems
from ingest.console import allow_any_letter

#: Where the books are, when nobody names a folder
BOOKS = Path("vault/books")


def books_in(target: Path) -> list:
    """Which book folders `target` names: itself when it holds chapter files, else every folder inside it."""
    if sorted(target.glob("*.md")):
        return [target]
    return [folder for folder in sorted(target.iterdir()) if folder.is_dir() and not folder.name.startswith(".")]


def audit_book(book_dir: Path) -> bool:
    """True when every chapter of every book in `book_dir` passes. A folder that holds no book fails."""
    target = Path(book_dir)
    if not target.is_dir():
        print(f"[-] {target} is not a folder. Nothing was checked.")
        return False

    books = books_in(target)
    if not books:
        print(f"[-] {target} holds no book. Nothing was checked.")
        return False

    problems = []
    chapters = 0
    for book in books:
        chapters += len(sorted(book.glob("*.md")))
        problems.extend(f"{book.name}/{problem}" if len(books) > 1 else problem for problem in book_problems(book))

    for problem in problems:
        print(f"[-] {problem}")

    if not problems:
        print(f"[+] {chapters} chapters of {len(books)} book(s) passed paragraph anchor and footnote integrity audits.")
    return not problems


if __name__ == "__main__":
    # A command of this repository may print any letter of any book (IN-09)
    allow_any_letter()
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else BOOKS
    sys.exit(0 if audit_book(target) else 1)
