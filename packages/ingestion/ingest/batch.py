"""Batch document ingestion utility supporting EPUB and PDF formats."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import List, Optional

from ingest.console import say_what_was_done
from ingest.models import BookMeta
from ingest.pipeline import ingest_book

SUPPORTED_EXTENSIONS = {".epub", ".pdf"}


def batch_ingest(
    source_dir: Path,
    vault_dir: Path,
    stop_on_error: bool = False,
) -> List[BookMeta]:
    """Scans source_dir for all supported .epub and .pdf files and ingests them into vault_dir.

    Returns:
        List of successfully ingested BookMeta objects.
    """
    source_path = Path(source_dir).resolve()
    vault_path = Path(vault_dir).resolve()

    if not source_path.exists():
        raise FileNotFoundError(f"Source directory does not exist: {source_path}")

    candidates = [
        f for f in source_path.iterdir()
        if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS and not f.name.startswith(".")
    ]
    candidates.sort(key=lambda p: p.name.lower())

    results: List[BookMeta] = []
    for file_path in candidates:
        try:
            print(f"[*] Batch processing: {file_path.name}...")
            meta = ingest_book(file_path, vault_path)
            results.append(meta)
            # The book is in the vault now, so saying so may not make this book count as failed (IN-09)
            say_what_was_done([f"[+] Successfully ingested '{meta.title}' ({meta.book_id})"])
        except Exception as e:
            print(f"[-] Failed to ingest {file_path.name}: {e}", file=sys.stderr)
            if stop_on_error:
                raise

    return results
