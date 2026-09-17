#!/usr/bin/env python3
"""Audits ingested Markdown files for missing paragraph anchors and broken footnote links.

It uses the check that an import runs on a book before the book goes into the vault (`ingest/book_check.py`, IN-05).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "packages" / "ingestion"))

from ingest.book_check import book_problems  # noqa: E402


def audit_book(book_dir: Path) -> bool:
    problems = book_problems(book_dir)
    for problem in problems:
        print(f"[-] {problem}")

    if not problems:
        print("[+] All chapters passed paragraph anchor and footnote integrity audits.")
    return not problems

if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("vault/books")
    sys.exit(0 if audit_book(target) else 1)
