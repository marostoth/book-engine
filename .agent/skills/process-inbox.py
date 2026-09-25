#!/usr/bin/env python3
"""Automated fail-safe batch book intake pipeline, SHA-256 deduplication ledger, and quarantine manager."""

from __future__ import annotations

import hashlib
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

# Root-relative path resolution
SKILL_DIR = Path(__file__).resolve().parent
ROOT_DIR = SKILL_DIR.parent.parent
sys.path.insert(0, str(ROOT_DIR / "packages" / "ingestion"))

from ingest.book_build import BookLeftAsideError  # noqa: E402
from ingest.book_check import BookCheckError  # noqa: E402
from ingest.console import allow_any_letter, say_what_was_done  # noqa: E402
from ingest.ledger import SET_ASIDE, LedgerDamaged, read_ledger, write_ledger  # noqa: E402
from ingest.pipeline import ingest_book  # noqa: E402
from ingest.reimport import BookAlreadyInVaultError, BookIdTakenError  # noqa: E402
from ingest.vault_changes import again_when_held  # noqa: E402

INBOX_DIR = ROOT_DIR / "inbox"
PROCESSED_DIR = INBOX_DIR / "processed"
VAULT_DIR = ROOT_DIR / "vault"

SUPPORTED_EXTENSIONS = {".epub", ".pdf"}


def compute_sha256(file_path: Path) -> str:
    """Computes SHA-256 hash of a file."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def leave_the_inbox(file_path: Path) -> None:
    """Moves the file of a book that is in the vault and in the ledger to inbox/processed/ (TL-21).

    Windows can hold the file for a moment, for example while OneDrive or a virus scanner reads it, so the move tries
    again for a few seconds, as every other move of an import does. A file that Windows still holds stays in inbox/,
    and the next run finds its book in the ledger and moves it. The book is in the vault either way, so this never
    changes the row of the book.
    """
    dest_path = PROCESSED_DIR / file_path.name
    try:
        again_when_held(lambda: dest_path.unlink(missing_ok=True))
        again_when_held(lambda: shutil.move(str(file_path), str(dest_path)))
    except OSError as e:
        say_what_was_done(
            [
                f"[!] '{file_path.name}' is in the vault, but it stays in inbox/: {e}",
                "[!] The next run finds it in the ledger and moves it to inbox/processed/.",
            ],
            to_errors=True,
        )


def status_table(rows: list[dict[str, str]]) -> list[str]:
    """A clean ASCII status table summarizing processed books, one line each.

    The lines are made here and printed by `say_what_was_done`, because every book of the table is already in the
    vault: a title the console cannot take may not turn that into a run that failed (IN-09).
    """
    headers = [
        ("Book ID", "book_id", 18),
        ("Title", "title", 36),
        ("Chapters", "chapters", 10),
        ("Anchors Verified", "anchors", 18),
        ("Status", "status", 10),
    ]

    # Calculate column widths based on content
    col_widths = []
    for title, key, min_w in headers:
        max_len = max([len(str(r.get(key, ""))) for r in rows] + [len(title), min_w])
        col_widths.append(min(max_len, 45))

    sep = "+" + "+".join("-" * (w + 2) for w in col_widths) + "+"

    header_line = "|" + "|".join(f" {headers[i][0].ljust(col_widths[i])} " for i in range(len(headers))) + "|"
    lines = ["\n" + sep, header_line, sep]

    for row in rows:
        row_cells = []
        for i, (_, key, _) in enumerate(headers):
            val = str(row.get(key, "-"))
            if len(val) > col_widths[i]:
                val = val[: col_widths[i] - 3] + "..."
            row_cells.append(f" {val.ljust(col_widths[i])} ")
        lines.append("|" + "|".join(row_cells) + "|")

    lines.append(sep + "\n")
    return lines


def main() -> int:
    import argparse

    # This command prints the title of every book it reads, so it may print any letter of any book (IN-09)
    allow_any_letter()

    parser = argparse.ArgumentParser(description="Automated book intake and ledger manager.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Process a book again even if it is in the ledger, and replace a book that is already in the vault. "
        "Your own files for it in vault/notes/<book-id>/ are kept.",
    )
    parser.add_argument(
        "--book", type=str, default=None, help="Process or re-process a specific file from inbox/ or inbox/processed/."
    )
    parser.add_argument(
        "--book-id",
        type=str,
        default=None,
        help="The book id for the file of --book, such as the id that a stopped import names. With --force, it also "
        "replaces a book that came from another file.",
    )
    args = parser.parse_args()
    if args.book_id is not None and not args.book:
        parser.error("--book-id needs --book, because a book id names one book")

    INBOX_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    VAULT_DIR.mkdir(parents=True, exist_ok=True)

    candidate_files: list[Path] = []

    if args.book:
        target = Path(args.book)
        if target.exists() and target.is_file():
            candidate_files.append(target.resolve())
        elif (INBOX_DIR / args.book).exists():
            candidate_files.append((INBOX_DIR / args.book).resolve())
        elif (PROCESSED_DIR / args.book).exists():
            candidate_files.append((PROCESSED_DIR / args.book).resolve())
        else:
            print(f"[-] Target book not found: {args.book}", file=sys.stderr)
            return 1
    else:
        # 1. Inspection: scan inbox/ (excluding subdirectories) for .epub and .pdf files
        candidate_files = [
            f
            for f in INBOX_DIR.iterdir()
            if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS and not f.name.startswith(".")
        ]
        candidate_files.sort(key=lambda p: p.name.lower())

    # 2. Early Exit: If inbox has no new files, exit cleanly
    if not candidate_files:
        print("Inbox is clean. No new books to process.", flush=True)
        return 0

    # One ledger module reads and writes `vault/_ledger.json`, and an import keeps its numbers
    # true for a book it already knows (`ingest/ledger.py`, CQ-05)
    #
    # A ledger this run could not read is not a ledger with nothing in it. Reading it that way is what
    # made this very loop add its one new record to nothing and write a one-line ledger over the record
    # of every book ever taken in (DS-18). Nothing is taken in until a person has put the ledger right.
    try:
        ledger_entries = read_ledger(VAULT_DIR)
    except LedgerDamaged as damage:
        print(f"[-] {damage}", file=sys.stderr)
        print(
            "[-] No book was taken in. Put the ledger right, or bring back the last committed one with "
            "`git restore vault/_ledger.json`, and run this again.",
            file=sys.stderr,
        )
        return 1
    processed_hashes: dict[str, dict[str, Any]] = {
        entry["sha256"]: entry for entry in ledger_entries if isinstance(entry, dict) and "sha256" in entry
    }

    report_rows: list[dict[str, str]] = []
    # The files whose book is in the vault and in the ledger. They leave the inbox after the loop, outside the `try`
    # that decides the row of a book, so a file that Windows holds cannot turn a finished book into `Failed` (TL-21).
    finished: list[Path] = []

    print(f"[*] Processing {len(candidate_files)} candidate book(s) (Force mode: {args.force})...", flush=True)

    # 3. Isolated Batch Processing
    for file_path in candidate_files:
        filename = file_path.name
        try:
            file_hash = compute_sha256(file_path)

            # Check deduplication ledger
            if file_hash in processed_hashes and not args.force:
                existing = processed_hashes[file_hash]
                if existing.get(SET_ASIDE):
                    # The book of this file left the vault by the owner's choice, so "already recorded" would read as
                    # "already in the vault", which it is not (TL-15)
                    print(
                        f"[SKIP] '{filename}' made the book '{existing.get('book_id', 'unknown')}', which was set "
                        f"aside on {existing[SET_ASIDE]}. Run again with --force to bring it back.",
                        flush=True,
                    )
                else:
                    print(
                        f"[SKIP] '{filename}' is already recorded in ledger (Book ID: {existing.get('book_id', 'unknown')}).",
                        flush=True,
                    )
                finished.append(file_path)
                report_rows.append(
                    {
                        "book_id": existing.get("book_id", "-"),
                        "title": existing.get("title", file_path.stem),
                        "chapters": str(existing.get("total_chapters", "-")),
                        "anchors": existing.get("anchors_verified", "PASS"),
                        "status": "Skipped",
                    }
                )
                continue

            print(f"[*] Processing '{filename}' (SHA-256: {file_hash[:12]}...)...", flush=True)

            # Ingest book into vault. A book that the vault already has is replaced only with --force (DS-09). The import
            # checks the anchors and the footnotes of the book before it puts the book in the vault (IN-05).
            meta = ingest_book(file_path, VAULT_DIR, book_id=args.book_id, replace=args.force)
            anchors_verified = "PASS"

            # Update or append record to ledger
            ledger_record: dict[str, Any] = {
                "sha256": file_hash,
                "book_id": meta.book_id,
                "title": meta.title,
                "author": meta.author,
                "filename": filename,
                "processed_at": datetime.now(UTC).isoformat(),
                "total_chapters": meta.total_chapters,
                "total_words": meta.total_words,
                "anchors_verified": anchors_verified,
            }
            ledger_entries = [e for e in ledger_entries if e.get("sha256") != file_hash]
            ledger_entries.append(ledger_record)
            processed_hashes[file_hash] = ledger_record
            write_ledger(VAULT_DIR, ledger_entries)
            finished.append(file_path)

            # The book is in the vault and in the ledger now, so saying so may not make this book fail (IN-09)
            say_what_was_done([f"[+] Successfully ingested '{meta.title}' -> vault/books/{meta.book_id}"])

            report_rows.append(
                {
                    "book_id": meta.book_id,
                    "title": meta.title,
                    "chapters": str(meta.total_chapters),
                    "anchors": anchors_verified,
                    "status": "Success",
                }
            )

        except (BookAlreadyInVaultError, BookIdTakenError) as e:
            # A new copy of a book the vault has, such as an annotated PDF (DS-09), or a file whose book id a book from
            # another file has, such as another edition (IN-03). Nothing was written.
            sys.stdout.flush()
            script = "python .agent/skills/process-inbox.py"
            print(f"[STOP] '{filename}': {e}", file=sys.stderr, flush=True)
            if isinstance(e, BookIdTakenError):
                ways = (
                    f'If it is a different book, import it with its own book id: {script} --book "{filename}" '
                    f"--book-id {e.own_book_id}\n[STOP] If it is a new copy of that book, replace that book: "
                    f'{script} --force --book "{filename}" --book-id {e.book_id}'
                )
            else:
                ways = f'To replace the book, run: {script} --force --book "{filename}"'
            print(f"[STOP] The file stays in inbox/. {ways}", file=sys.stderr, flush=True)
            report_rows.append(
                {
                    "book_id": e.book_id,
                    "title": file_path.stem,
                    "chapters": "-",
                    "anchors": "-",
                    "status": "Stopped",
                }
            )
        except (BookCheckError, BookLeftAsideError) as e:
            # The book that the import made fails its check, or an import that did not end left the book aside. The
            # vault did not change (IN-05).
            sys.stdout.flush()
            print(f"[FAIL] '{filename}': {e}", file=sys.stderr, flush=True)
            print("[FAIL] The file stays where it is.", file=sys.stderr, flush=True)
            report_rows.append(
                {
                    "book_id": e.book_id,
                    "title": file_path.stem,
                    "chapters": "-",
                    "anchors": "FAIL" if isinstance(e, BookCheckError) else "-",
                    "status": "Failed",
                }
            )
        except Exception as e:
            sys.stdout.flush()
            print(f"[ERROR] Failed to process {filename}: {e}", file=sys.stderr, flush=True)
            report_rows.append(
                {
                    "book_id": "-",
                    "title": file_path.stem,
                    "chapters": "-",
                    "anchors": "-",
                    "status": "Failed",
                }
            )
            # Per specification: leave failed file in inbox/ for user inspection

    # 4. Quarantine: the file of each book that is in the vault leaves the inbox, and keeps the inbox clean
    for file_path in finished:
        if file_path.parent == INBOX_DIR:
            leave_the_inbox(file_path)

    # 5. Reporting: Print clean ASCII status table. Every book of it is in the vault already (IN-09).
    if report_rows:
        say_what_was_done(status_table(report_rows))

    # The table is not the only signal: a run with a book that failed gives back 1, so a script that runs this can tell
    return 1 if any(row["status"] == "Failed" for row in report_rows) else 0


if __name__ == "__main__":
    sys.exit(main())
