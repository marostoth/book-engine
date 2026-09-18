"""The rule for a book id: every id the importer makes follows it, and an id that could lead out of the vault breaks it.

The desktop app has the same rule (`apps/desktop/src-tauri/src/vault/paths.rs`), so a book that an import writes is a
book that the app can open (SEC-03).
"""

import pytest
from ebooklib import epub
from ingest.book_id import InvalidBookIdError, check_book_id
from ingest.epub_parser import extract_metadata
from ingest.pdf_sanitizer import generate_pdf_slug


def test_every_book_id_the_importer_makes_follows_the_rule() -> None:
    epub_names = ["sample", "My Book (2nd ed.)", "_private_notes", "\u00c9conomie \u2013 2024", "---", "a" * 255]
    pdf_names = ["[MKTG] Principles of Marketing 19ed 2023.pdf", "Dalton J. Mind Over Markets.pdf", "....pdf"]
    ids = [extract_metadata(epub.EpubBook(), name)[0] for name in epub_names]
    ids += [generate_pdf_slug(name) for name in pdf_names]
    ids += [
        "wealth-of-nations",
        "principles-of-marketing-19ed",
        "dalton-j-mind-over-markets-power-trading-with-market-generated-information-updated-edition",
    ]

    for book_id in ids:
        check_book_id(book_id)


@pytest.mark.parametrize(
    "book_id",
    [
        "",
        ".",
        "..",
        "../x",
        "..\\x",
        "a/b",
        "a\\b",
        "/x",
        "C:\\Windows",
        "C:",
        "Sample",
        "a b",
        "a.b",
        "-x",
        "x\n",
        "caf\u00e9",
        "a" * 256,
    ],
)
def test_an_id_that_could_lead_out_of_the_vault_breaks_the_rule(book_id: str) -> None:
    with pytest.raises(InvalidBookIdError, match="book id"):
        check_book_id(book_id)
