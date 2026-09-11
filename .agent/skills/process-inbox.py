#!/usr/bin/env python3
"""Automated fail-safe batch book intake pipeline, SHA-256 deduplication ledger, and quarantine manager."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Root-relative path resolution
SKILL_DIR = Path(__file__).resolve().parent
ROOT_DIR = SKILL_DIR.parent.parent
sys.path.insert(0, str(ROOT_DIR / "packages" / "ingestion"))

from ingest.pipeline import ingest_book

INBOX_DIR = ROOT_DIR / "inbox"
PROCESSED_DIR = INBOX_DIR / "processed"
VAULT_DIR = ROOT_DIR / "vault"
LEDGER_FILE = VAULT_DIR / "_ledger.json"
AUDIT_SCRIPT = SKILL_DIR / "audit-anchors.py"

SUPPORTED_EXTENSIONS = {".epub", ".pdf"}


def compute_sha256(file_path: Path) -> str:
    """Computes SHA-256 hash of a file."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def load_ledger(ledger_path: Path) -> List[Dict[str, Any]]:
    """Loads existing ledger entries from vault/_ledger.json."""
    if not ledger_path.exists():
        return []
    try:
        content = ledger_path.read_text(encoding="utf-8")
        data = json.loads(content)
        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            return list(data.values())
    except Exception as e:
        print(f"[WARN] Could not parse existing ledger: {e}", file=sys.stderr, flush=True)
    return []


def save_ledger(ledger_path: Path, entries: List[Dict[str, Any]]) -> None:
    """Atomically writes ledger entries to vault/_ledger.json."""
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    temp_file = ledger_path.with_suffix(".tmp")
    temp_file.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    temp_file.replace(ledger_path)


def print_status_table(rows: List[Dict[str, str]]) -> None:
    """Prints a clean ASCII status table summarizing processed books."""
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

    print("\n" + sep, flush=True)
    header_line = "|" + "|".join(f" {headers[i][0].ljust(col_widths[i])} " for i in range(len(headers))) + "|"
    print(header_line, flush=True)
    print(sep, flush=True)

    for row in rows:
        row_cells = []
        for i, (_, key, _) in enumerate(headers):
            val = str(row.get(key, "-"))
            if len(val) > col_widths[i]:
                val = val[: col_widths[i] - 3] + "..."
            row_cells.append(f" {val.ljust(col_widths[i])} ")
        print("|" + "|".join(row_cells) + "|", flush=True)

    print(sep + "\n", flush=True)


def run_anchor_audit(book_id: str) -> str:
    """Runs audit-anchors.py on the ingested book and returns PASS or FAIL."""
    book_path = VAULT_DIR / "books" / book_id
    if not book_path.exists():
        return "FAIL"

    try:
        res = subprocess.run(
            [sys.executable, str(AUDIT_SCRIPT), str(book_path)],
            capture_output=True,
            text=True,
            check=False,
        )
        return "PASS" if res.returncode == 0 else "FAIL"
    except Exception as e:
        print(f"[WARN] Failed to run anchor audit: {e}", file=sys.stderr, flush=True)
        return "FAIL"


def main() -> int:
    INBOX_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    VAULT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Inspection: scan inbox/ (excluding subdirectories) for .epub and .pdf files
    candidate_files = [
        f for f in INBOX_DIR.iterdir()
        if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS and not f.name.startswith(".")
    ]

    candidate_files.sort(key=lambda p: p.name.lower())

    # 2. Early Exit: If inbox has no new files, exit cleanly
    if not candidate_files:
        print("Inbox is clean. No new books to process.", flush=True)
        return 0

    ledger_entries = load_ledger(LEDGER_FILE)
    processed_hashes: Dict[str, Dict[str, Any]] = {
        entry["sha256"]: entry for entry in ledger_entries if isinstance(entry, dict) and "sha256" in entry
    }

    report_rows: List[Dict[str, str]] = []

    print(f"[*] Found {len(candidate_files)} file(s) in inbox. Inspecting against ledger...", flush=True)

    # 3. Isolated Batch Processing
    for file_path in candidate_files:
        filename = file_path.name
        try:
            file_hash = compute_sha256(file_path)

            # Check deduplication ledger
            if file_hash in processed_hashes:
                existing = processed_hashes[file_hash]
                print(f"[SKIP] '{filename}' is already recorded in ledger (Book ID: {existing.get('book_id', 'unknown')}).", flush=True)
                # Move to processed to keep inbox clean
                dest_path = PROCESSED_DIR / filename
                if dest_path.exists():
                    dest_path.unlink()
                shutil.move(str(file_path), str(dest_path))

                report_rows.append({
                    "book_id": existing.get("book_id", "-"),
                    "title": existing.get("title", file_path.stem),
                    "chapters": str(existing.get("total_chapters", "-")),
                    "anchors": existing.get("anchors_verified", "PASS"),
                    "status": "Skipped",
                })
                continue

            print(f"[*] Processing '{filename}' (SHA-256: {file_hash[:12]}...)...", flush=True)

            # Ingest book into vault
            meta = ingest_book(file_path, VAULT_DIR)

            # Run anchor integrity check
            anchors_verified = run_anchor_audit(meta.book_id)

            # Append record to ledger
            ledger_record: Dict[str, Any] = {
                "sha256": file_hash,
                "book_id": meta.book_id,
                "title": meta.title,
                "author": meta.author,
                "filename": filename,
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "total_chapters": meta.total_chapters,
                "total_words": meta.total_words,
                "anchors_verified": anchors_verified,
            }
            ledger_entries.append(ledger_record)
            processed_hashes[file_hash] = ledger_record
            save_ledger(LEDGER_FILE, ledger_entries)

            # Move binary to inbox/processed/
            dest_path = PROCESSED_DIR / filename
            if dest_path.exists():
                dest_path.unlink()
            shutil.move(str(file_path), str(dest_path))

            print(f"[+] Successfully ingested '{meta.title}' -> vault/books/{meta.book_id}", flush=True)

            report_rows.append({
                "book_id": meta.book_id,
                "title": meta.title,
                "chapters": str(meta.total_chapters),
                "anchors": anchors_verified,
                "status": "Success",
            })

        except Exception as e:
            sys.stdout.flush()
            print(f"[ERROR] Failed to process {filename}: {e}", file=sys.stderr, flush=True)
            report_rows.append({
                "book_id": "-",
                "title": file_path.stem,
                "chapters": "-",
                "anchors": "-",
                "status": "Failed",
            })
            # Per specification: leave failed file in inbox/ for user inspection

    # 4. Reporting: Print clean ASCII status table
    if report_rows:
        print_status_table(report_rows)

    return 0


if __name__ == "__main__":
    sys.exit(main())
