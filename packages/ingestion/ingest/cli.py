"""Command-line interface for the ingestion pipeline."""

from __future__ import annotations
import argparse
import sys
from pathlib import Path

from ingest.pipeline import ingest_book


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest an EPUB or PDF document into the local vault.")
    parser.add_argument("file_path", type=Path, help="Path to source document (e.g. book.epub, book.pdf)")
    parser.add_argument("--vault", type=Path, default=Path("vault"), help="Path to local Markdown vault root")
    parser.add_argument("--book-id", type=str, default=None, help="Custom identifier for the book directory")

    args = parser.parse_args()

    try:
        print(f"[*] Ingesting {args.file_path} into {args.vault}...")
        meta = ingest_book(args.file_path, args.vault, args.book_id)
        print(f"[+] Successfully ingested '{meta.title}' (ID: {meta.book_id})")
        print(f"[+] Total chapters: {meta.total_chapters}, Total words: {meta.total_words}")
        print(f"[+] Output written to: {args.vault / 'books' / meta.book_id}")
        print(f"[+] Practice deck written to: {args.vault / 'notes' / meta.book_id / 'practice-deck.md'}")
    except Exception as e:
        print(f"[-] Ingestion failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
