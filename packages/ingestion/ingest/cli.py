"""Command-line interface for the ingestion pipeline."""

from __future__ import annotations
import argparse
import sys
from pathlib import Path

from ingest.book_build import BookLeftAsideError
from ingest.book_check import BookCheckError
from ingest.book_id import InvalidBookIdError
from ingest.console import allow_any_letter, say_what_was_done
from ingest.models import BookMeta
from ingest.pipeline import ingest_book
from ingest.reimport import BookAlreadyInVaultError, BookIdTakenError


def main() -> None:
    # This command prints the title of the book, so it may print any letter of any book (IN-09)
    allow_any_letter()
    parser = argparse.ArgumentParser(description="Ingest an EPUB or PDF document into the local vault.")
    parser.add_argument("file_path", type=Path, help="Path to source document (e.g. book.epub, book.pdf)")
    parser.add_argument("--vault", type=Path, default=Path("vault"), help="Path to local Markdown vault root")
    parser.add_argument(
        "--book-id",
        type=str,
        default=None,
        help="Custom identifier for the book folders: 1 to 255 characters from a-z, 0-9, - and _, not starting with -",
    )
    parser.add_argument("--chapter", type=int, default=None, help="Process only a specific chapter index (e.g. 1)")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Replace a book that is already in the vault. Your own files for it in notes/<book-id>/ are kept. "
        "A book that came from another file is replaced only when --book-id names it.",
    )

    args = parser.parse_args()

    try:
        print(f"[*] Ingesting {args.file_path} into {args.vault}...")
        target_chapters = [args.chapter] if args.chapter is not None else None
        meta = ingest_book(args.file_path, args.vault, args.book_id, target_chapters=target_chapters, replace=args.force)
    except BookIdTakenError as e:
        # Not a crash: the import stopped before it wrote anything (IN-03)
        print(f"[-] {e}", file=sys.stderr)
        print(f"[-] If this file is a different book, run the same import again with --book-id {e.own_book_id}", file=sys.stderr)
        print(
            f"[-] If this file is a new copy of that book, run the same import again with --book-id {e.book_id} --force",
            file=sys.stderr,
        )
        sys.exit(1)
    except BookAlreadyInVaultError as e:
        # Not a crash: the import stopped before it wrote anything (DS-09)
        print(f"[-] {e}", file=sys.stderr)
        print("[-] To replace the book, run the same import again with --force.", file=sys.stderr)
        sys.exit(1)
    except InvalidBookIdError as e:
        # Not a crash: the import stopped before it wrote anything (SEC-03)
        print(f"[-] {e}", file=sys.stderr)
        sys.exit(1)
    except (BookCheckError, BookLeftAsideError) as e:
        # Not a crash: the import stopped before it changed the vault (IN-05)
        print(f"[-] {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"[-] Ingestion failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

    # The whole book is in the vault now, so saying so may not make this command fail (IN-09)
    say_what_was_done(_what_was_written(meta, args.vault))


def _what_was_written(meta: BookMeta, vault: Path) -> list[str]:
    """What the import wrote, one line each."""
    return [
        f"[+] Successfully ingested '{meta.title}' (ID: {meta.book_id})",
        f"[+] Total chapters: {meta.total_chapters}, Total words: {meta.total_words}",
        f"[+] Output written to: {vault / 'books' / meta.book_id}",
        f"[+] Practice deck written to: {vault / 'notes' / meta.book_id / 'practice-deck.md'}",
    ]


if __name__ == "__main__":
    main()
