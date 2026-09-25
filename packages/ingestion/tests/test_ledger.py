"""The ledger's chapter and word counts stay true to the books (CQ-05).

`vault/_ledger.json` records which file made which book, and how many chapters and words that book
has. Only the inbox wrote those two numbers, so a book imported again from the command line changed
its `_meta.json` and left the ledger saying the numbers of the older import. Both PDF books of the
owner's vault drifted that way: the Dalton book said 78,445 words in the ledger against 78,374 in the
book, and the Kotler book 455,709 against 456,426. Nothing checked the two, so they stayed apart.

Every test here makes its own little vault, so none of them needs a book of yours.
"""

import importlib.util
import json
import shutil
import sys
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pymupdf
import pytest
from ingest.ledger import (
    LedgerDamaged,
    LedgerWouldShrink,
    book_numbers,
    keep_numbers_true,
    kept_copy_of,
    lines_that_disagree,
    read_ledger,
    write_ledger,
)
from ingest.pipeline import ingest_epub, ingest_pdf

BOOK_ID = "harbour-ledger"

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""
PACKAGE = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">harbour-ledger</dc:identifier>
    <dc:title>Harbour Ledger</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="d0" href="ch01.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="d0"/></spine>
</package>
"""
NAV = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol><li><a href="ch01.xhtml">Chapter 1</a></li></ol></nav></body>
</html>
"""
DOCUMENT = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Harbour Ledger</title></head>
<body><h1>Chapter 1</h1>{body}</body>
</html>
"""
PARAGRAPH = "<p>The harbour at Leith took in eleven ships of the Baltic trade that season.</p>"


def make_epub(path: Path, body: str) -> Path:
    with zipfile.ZipFile(path, "w") as book:
        book.writestr("mimetype", "application/epub+zip")
        book.writestr("META-INF/container.xml", CONTAINER)
        book.writestr("OEBPS/content.opf", PACKAGE)
        book.writestr("OEBPS/nav.xhtml", NAV)
        book.writestr("OEBPS/ch01.xhtml", DOCUMENT.format(body=body))
    return path


def line(book_id: str = BOOK_ID, chapters: int = 1, words: int = 1, sha: str = "a" * 64) -> dict[str, Any]:
    return {
        "sha256": sha,
        "book_id": book_id,
        "title": "Harbour Ledger",
        "author": "Test Author",
        "filename": f"{book_id}.epub",
        "processed_at": "2026-09-18T00:00:00+00:00",
        "total_chapters": chapters,
        "total_words": words,
        "anchors_verified": "PASS",
    }


def a_book_in(folder: Path, book_id: str = BOOK_ID, chapters: int = 1, words: int = 1) -> Path:
    """A vault holding one book whose `_meta.json` says `chapters` and `words`."""
    meta = folder / "books" / book_id
    meta.mkdir(parents=True, exist_ok=True)
    (meta / "_meta.json").write_text(
        json.dumps({"book_id": book_id, "total_chapters": chapters, "total_words": words}), encoding="utf-8"
    )
    return folder


# --- reading and writing the ledger ---


def test_a_vault_with_no_ledger_reads_as_no_lines(tmp_path: Path):
    assert read_ledger(tmp_path) == []


def test_a_ledger_that_is_not_readable_is_not_read_as_no_lines(tmp_path: Path):
    # This test asserted the opposite until DS-18. Reading a damaged ledger as no lines is what let the
    # next import write its one record back over the record of every book ever taken in.
    (tmp_path / "_ledger.json").write_text("{not json at all", encoding="utf-8")

    with pytest.raises(LedgerDamaged) as damage:
        read_ledger(tmp_path)

    assert "_ledger.json" in str(damage.value)


def test_a_ledger_written_as_one_object_per_key_still_reads(tmp_path: Path):
    (tmp_path / "_ledger.json").write_text(json.dumps({"one": line(words=5)}), encoding="utf-8")

    assert [it["total_words"] for it in read_ledger(tmp_path)] == [5]


def test_a_line_that_is_not_an_object_is_left_out(tmp_path: Path):
    (tmp_path / "_ledger.json").write_text(json.dumps([line(), "a stray string", 7]), encoding="utf-8")

    assert len(read_ledger(tmp_path)) == 1


def test_what_is_written_comes_back(tmp_path: Path):
    lines: list[dict[str, Any]] = [line(words=11), line(book_id="other", words=22, sha="b" * 64)]

    write_ledger(tmp_path, lines)

    assert read_ledger(tmp_path) == lines


def test_the_ledger_is_written_with_unix_line_endings(tmp_path: Path):
    write_ledger(tmp_path, [line()])

    assert b"\r\n" not in (tmp_path / "_ledger.json").read_bytes()


def test_a_stopped_write_leaves_no_half_file(tmp_path: Path):
    write_ledger(tmp_path, [line()])

    assert not (tmp_path / "_ledger.tmp").exists()


# --- the numbers a book says it has ---


def test_the_numbers_of_a_book_come_from_its_own_meta(tmp_path: Path):
    a_book_in(tmp_path, chapters=7, words=78374)

    assert book_numbers(tmp_path, BOOK_ID) == {"total_chapters": 7, "total_words": 78374}


def test_a_book_the_vault_does_not_hold_has_no_numbers(tmp_path: Path):
    assert book_numbers(tmp_path, BOOK_ID) is None


def test_a_meta_that_is_not_readable_has_no_numbers(tmp_path: Path):
    folder = tmp_path / "books" / BOOK_ID
    folder.mkdir(parents=True)
    (folder / "_meta.json").write_text("{broken", encoding="utf-8")

    assert book_numbers(tmp_path, BOOK_ID) is None


def test_a_meta_whose_numbers_are_not_numbers_has_no_numbers(tmp_path: Path):
    folder = tmp_path / "books" / BOOK_ID
    folder.mkdir(parents=True)
    (folder / "_meta.json").write_text(json.dumps({"total_chapters": "seven", "total_words": None}), encoding="utf-8")

    assert book_numbers(tmp_path, BOOK_ID) is None


# --- keeping the numbers true ---


def test_the_numbers_of_a_known_book_are_put_right(tmp_path: Path):
    write_ledger(tmp_path, [line(chapters=7, words=78445)])

    assert keep_numbers_true(tmp_path, BOOK_ID, 7, 78374)

    assert [(it["total_chapters"], it["total_words"]) for it in read_ledger(tmp_path)] == [(7, 78374)]


def test_the_other_lines_are_left_alone(tmp_path: Path):
    write_ledger(tmp_path, [line(book_id="other", words=458, sha="b" * 64), line(words=78445)])

    keep_numbers_true(tmp_path, BOOK_ID, 7, 78374)

    lines = read_ledger(tmp_path)
    assert lines[0]["book_id"] == "other" and lines[0]["total_words"] == 458
    assert lines[1]["total_words"] == 78374


def test_the_rest_of_a_line_is_left_alone(tmp_path: Path):
    write_ledger(tmp_path, [line(words=78445)])

    keep_numbers_true(tmp_path, BOOK_ID, 7, 78374)

    kept = read_ledger(tmp_path)[0]
    assert kept["sha256"] == "a" * 64
    assert kept["filename"] == f"{BOOK_ID}.epub"
    assert kept["processed_at"] == "2026-09-18T00:00:00+00:00"
    assert kept["anchors_verified"] == "PASS"


def test_a_wrong_number_of_chapters_alone_is_put_right(tmp_path: Path):
    # A PDF import keeps the front and the back matter as parts of their own now (IN-01), so the
    # number of chapters can change while the number of words does not
    write_ledger(tmp_path, [line(chapters=7, words=78374)])

    assert keep_numbers_true(tmp_path, BOOK_ID, 16, 78374)

    assert [(it["total_chapters"], it["total_words"]) for it in read_ledger(tmp_path)] == [(16, 78374)]


def test_a_book_the_ledger_does_not_know_is_never_added(tmp_path: Path):
    # Only the inbox takes a file in, because only the inbox knows the file it moved into processed/
    write_ledger(tmp_path, [line(book_id="other", sha="b" * 64)])

    assert not keep_numbers_true(tmp_path, BOOK_ID, 7, 78374)

    assert [it["book_id"] for it in read_ledger(tmp_path)] == ["other"]


def test_a_vault_with_no_ledger_gets_none(tmp_path: Path):
    assert not keep_numbers_true(tmp_path, BOOK_ID, 7, 78374)

    assert not (tmp_path / "_ledger.json").exists()


def test_nothing_is_written_when_the_numbers_already_agree(tmp_path: Path):
    write_ledger(tmp_path, [line(chapters=7, words=78374)])
    before = (tmp_path / "_ledger.json").read_bytes()

    assert not keep_numbers_true(tmp_path, BOOK_ID, 7, 78374)

    assert (tmp_path / "_ledger.json").read_bytes() == before


def test_two_lines_for_one_book_are_both_put_right(tmp_path: Path):
    # Two files can make the same book, such as a second copy of the same PDF
    write_ledger(tmp_path, [line(words=1, sha="a" * 64), line(words=2, sha="b" * 64)])

    keep_numbers_true(tmp_path, BOOK_ID, 7, 78374)

    assert [it["total_words"] for it in read_ledger(tmp_path)] == [78374, 78374]


# --- which lines disagree with their book ---


def test_a_line_that_disagrees_with_its_book_is_found(tmp_path: Path):
    a_book_in(tmp_path, chapters=7, words=78374)
    write_ledger(tmp_path, [line(chapters=7, words=78445)])

    assert lines_that_disagree(tmp_path) == [
        {
            "book_id": BOOK_ID,
            "ledger_chapters": 7,
            "ledger_words": 78445,
            "book_chapters": 7,
            "book_words": 78374,
        }
    ]


def test_a_line_that_agrees_is_not_found(tmp_path: Path):
    a_book_in(tmp_path, chapters=7, words=78374)
    write_ledger(tmp_path, [line(chapters=7, words=78374)])

    assert lines_that_disagree(tmp_path) == []


def test_a_wrong_number_of_chapters_is_found_too(tmp_path: Path):
    a_book_in(tmp_path, chapters=16, words=78374)
    write_ledger(tmp_path, [line(chapters=7, words=78374)])

    assert [it["book_id"] for it in lines_that_disagree(tmp_path)] == [BOOK_ID]


def test_a_line_whose_book_left_the_vault_is_left_out(tmp_path: Path):
    # Its numbers are the record of an import that happened, and no book is there to check them
    write_ledger(tmp_path, [line(chapters=20, words=455709)])

    assert lines_that_disagree(tmp_path) == []


def test_a_line_with_no_book_id_is_left_out(tmp_path: Path):
    write_ledger(tmp_path, [{"total_chapters": 1, "total_words": 2}])

    assert lines_that_disagree(tmp_path) == []


# --- an import keeps the ledger true ---


def test_an_import_puts_the_numbers_of_a_known_book_right(tmp_path: Path):
    vault = tmp_path / "vault"
    epub = make_epub(tmp_path / f"{BOOK_ID}.epub", PARAGRAPH)
    first = ingest_epub(epub, vault, custom_book_id=BOOK_ID)
    # The inbox took this file in once, and its line holds what that import gave
    write_ledger(vault, [line(chapters=first.total_chapters, words=first.total_words)])

    # The book is imported again with more text, as a re-import from the command line would
    again = ingest_epub(
        make_epub(tmp_path / f"{BOOK_ID}.epub", PARAGRAPH * 3), vault, custom_book_id=BOOK_ID, replace=True
    )

    assert again.total_words != first.total_words
    assert [(it["total_chapters"], it["total_words"]) for it in read_ledger(vault)] == [
        (again.total_chapters, again.total_words)
    ]
    assert lines_that_disagree(vault) == []


def test_an_import_of_a_pdf_puts_the_numbers_right_too(tmp_path: Path):
    vault = tmp_path / "vault"
    pdf = tmp_path / "harbour.pdf"
    doc = pymupdf.open()
    page = doc.new_page(width=600, height=800)
    page.insert_text((50, 60), "Chapter 1: The Harbour")
    page.insert_text((50, 100), "The harbour at Leith took in eleven ships of the Baltic trade that season.")
    doc.save(str(pdf))
    doc.close()
    first = ingest_pdf(pdf, vault, custom_book_id=BOOK_ID)
    write_ledger(vault, [line(chapters=first.total_chapters, words=first.total_words + 100)])

    ingest_pdf(pdf, vault, custom_book_id=BOOK_ID, replace=True)

    assert [it["total_words"] for it in read_ledger(vault)] == [first.total_words]
    assert lines_that_disagree(vault) == []


def test_an_import_into_a_vault_with_no_ledger_writes_none(tmp_path: Path):
    vault = tmp_path / "vault"

    ingest_epub(make_epub(tmp_path / f"{BOOK_ID}.epub", PARAGRAPH), vault, custom_book_id=BOOK_ID)

    assert not (vault / "_ledger.json").exists()


def test_an_import_leaves_the_line_of_another_book_alone(tmp_path: Path):
    vault = tmp_path / "vault"
    epub = make_epub(tmp_path / f"{BOOK_ID}.epub", PARAGRAPH)
    ingest_epub(epub, vault, custom_book_id=BOOK_ID)
    write_ledger(vault, [line(book_id="wealth-of-nations", chapters=37, words=387438, sha="b" * 64)])

    ingest_epub(epub, vault, custom_book_id=BOOK_ID, replace=True)

    assert [(it["book_id"], it["total_words"]) for it in read_ledger(vault)] == [("wealth-of-nations", 387438)]


# --- the inbox reads the ledger to know a file it took in before ---


def an_inbox_on(folder: Path, monkeypatch):
    """The inbox skill, pointed at `folder` instead of the real inbox and vault."""
    spec = importlib.util.spec_from_file_location(
        "process_inbox", Path(__file__).resolve().parents[3] / ".agent" / "skills" / "process-inbox.py"
    )
    assert spec and spec.loader
    inbox = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inbox)
    monkeypatch.setattr(inbox, "INBOX_DIR", folder / "inbox")
    monkeypatch.setattr(inbox, "PROCESSED_DIR", folder / "inbox" / "processed")
    monkeypatch.setattr(inbox, "VAULT_DIR", folder / "vault")
    monkeypatch.setattr(sys, "argv", ["process-inbox.py"])
    return inbox


def test_the_inbox_takes_a_file_in_and_writes_what_it_made(tmp_path: Path, monkeypatch):
    inbox = an_inbox_on(tmp_path, monkeypatch)
    (tmp_path / "inbox").mkdir()
    make_epub(tmp_path / "inbox" / f"{BOOK_ID}.epub", PARAGRAPH)

    assert inbox.main() == 0

    written = read_ledger(tmp_path / "vault")
    assert len(written) == 1
    assert written[0]["total_words"] > 0
    assert lines_that_disagree(tmp_path / "vault") == []


def test_the_inbox_knows_a_file_it_took_in_before(tmp_path: Path, monkeypatch, capsys):
    inbox = an_inbox_on(tmp_path, monkeypatch)
    (tmp_path / "inbox").mkdir()
    make_epub(tmp_path / "inbox" / f"{BOOK_ID}.epub", PARAGRAPH)
    assert inbox.main() == 0
    # The same file comes back to the inbox
    shutil.copy2(tmp_path / "inbox" / "processed" / f"{BOOK_ID}.epub", tmp_path / "inbox" / f"{BOOK_ID}.epub")
    capsys.readouterr()

    assert inbox.main() == 0

    assert "already recorded in ledger" in capsys.readouterr().out
    assert len(read_ledger(tmp_path / "vault")) == 1, "the file made no second line"


# --- the audit says so ---


def audit_module():
    spec = importlib.util.spec_from_file_location(
        "audit_system", Path(__file__).resolve().parents[3] / ".agent" / "skills" / "audit-system.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def an_audit_on(vault: Path, monkeypatch, chapters: int, words: int):
    """The audit's first check, on a whole little vault whose only fault is the one a test makes."""
    audit = audit_module()
    processed = vault.parent / "inbox" / "processed"
    processed.mkdir(parents=True, exist_ok=True)
    binary = processed / f"{BOOK_ID}.epub"
    binary.write_bytes(b"a file that stands for the book")
    write_ledger(vault, [line(chapters=chapters, words=words, sha=audit.compute_sha256(binary))])
    monkeypatch.setattr(audit, "VAULT_DIR", vault)
    monkeypatch.setattr(audit, "BOOKS_DIR", vault / "books")
    monkeypatch.setattr(audit, "INBOX_PROCESSED_DIR", processed)
    monkeypatch.setattr(audit, "LEDGER_PATH", vault / "_ledger.json")
    return audit


def test_the_audit_says_when_the_ledger_and_the_book_disagree(tmp_path: Path, monkeypatch):
    vault = tmp_path / "vault"
    a_book_in(vault, chapters=7, words=78374)
    audit = an_audit_on(vault, monkeypatch, chapters=7, words=78445)

    result = audit.check_ledger_and_vault_parity()

    assert not result.passed
    drift = [e for e in result.errors if "78445" in e and "78374" in e]
    assert len(drift) == 1, result.errors
    assert "Import the book again" in drift[0]


def test_the_audit_is_happy_when_they_agree(tmp_path: Path, monkeypatch):
    vault = tmp_path / "vault"
    a_book_in(vault, chapters=7, words=78374)
    audit = an_audit_on(vault, monkeypatch, chapters=7, words=78374)

    result = audit.check_ledger_and_vault_parity()

    assert result.passed, result.errors


# --- one ledger module for the inbox and the audit ---


def test_the_inbox_and_the_audit_use_this_module():
    skills = Path(__file__).resolve().parents[3] / ".agent" / "skills"
    inbox = (skills / "process-inbox.py").read_text(encoding="utf-8")
    audit = (skills / "audit-system.py").read_text(encoding="utf-8")

    # The names, not the order they are written in: the inbox also imports `LedgerDamaged` now (DS-18)
    assert "from ingest.ledger import" in inbox
    for name in ("read_ledger", "write_ledger", "LedgerDamaged"):
        assert name in inbox, f"the inbox must ask this module for {name}"
    # It keeps no second copy of the reading and writing
    assert "def load_ledger" not in inbox
    assert "def save_ledger" not in inbox
    # The audit also imports `SET_ASIDE` now (TL-15), so again the name and not the order
    (imported,) = [line for line in audit.splitlines() if line.startswith("from ingest.ledger import ")]
    assert "lines_that_disagree" in imported and "SET_ASIDE" in imported, imported
    assert "lines_that_disagree(VAULT_DIR)" in audit


# --- a damaged ledger is never an empty ledger (DS-18) ---

DAMAGED = b'[{"sha256": "aaaa", "book_id": "harbour-l'


def a_damaged_ledger_in(vault: Path) -> Path:
    """A vault whose ledger is there and cannot be read."""
    vault.mkdir(parents=True, exist_ok=True)
    path = vault / "_ledger.json"
    path.write_bytes(DAMAGED)
    return path


def copies_beside(path: Path) -> list[Path]:
    """Every kept copy of the damaged bytes, as `<file name>.corrupt-<time>`."""
    return sorted(path.parent.glob(f"{path.name}.corrupt-*"))


def test_a_damaged_ledger_keeps_a_copy_of_its_bytes(tmp_path: Path):
    path = a_damaged_ledger_in(tmp_path)

    with pytest.raises(LedgerDamaged) as damage:
        read_ledger(tmp_path)

    kept = copies_beside(path)
    assert len(kept) == 1, kept
    assert kept[0].read_bytes() == DAMAGED, "the copy must hold the bytes that were there"
    assert str(kept[0]) in str(damage.value), "the error must say where the copy is"


def test_the_same_damaged_bytes_keep_one_copy_only(tmp_path: Path):
    # A run that reads the ledger twice must not fill the vault with copies of one damaged file
    path = a_damaged_ledger_in(tmp_path)

    for _ in range(3):
        with pytest.raises(LedgerDamaged):
            read_ledger(tmp_path)

    assert len(copies_beside(path)) == 1, copies_beside(path)


def test_the_same_damaged_bytes_keep_one_copy_across_two_moments(tmp_path: Path):
    # The test above passes even with no rule at all, because three reads inside one second write one
    # name. Only two moments show the rule, so the moment is an argument.
    path = a_damaged_ledger_in(tmp_path)

    first = kept_copy_of(path, DAMAGED, when=datetime(2026, 9, 20, 12, 0, 0, tzinfo=UTC))
    second = kept_copy_of(path, DAMAGED, when=datetime(2026, 9, 20, 12, 0, 1, tzinfo=UTC))

    assert second == first, "the same bytes must give back the copy that is already there"
    assert len(copies_beside(path)) == 1, copies_beside(path)


def test_damaged_bytes_that_differ_keep_a_second_copy(tmp_path: Path):
    # The control for the test above: the rule must not swallow a second, different damage
    path = a_damaged_ledger_in(tmp_path)

    kept_copy_of(path, DAMAGED, when=datetime(2026, 9, 20, 12, 0, 0, tzinfo=UTC))
    kept_copy_of(path, b"[{a second damage, of other bytes", when=datetime(2026, 9, 20, 12, 0, 1, tzinfo=UTC))

    assert len(copies_beside(path)) == 2, copies_beside(path)


def test_a_ledger_that_is_not_a_list_of_lines_is_damaged_too(tmp_path: Path):
    (tmp_path / "_ledger.json").write_text("7", encoding="utf-8")

    with pytest.raises(LedgerDamaged):
        read_ledger(tmp_path)


def test_a_shorter_ledger_is_not_written_over_a_longer_one(tmp_path: Path):
    write_ledger(tmp_path, [line(sha="a" * 64), line(book_id="other", sha="b" * 64)])
    before = (tmp_path / "_ledger.json").read_bytes()

    with pytest.raises(LedgerWouldShrink) as refused:
        write_ledger(tmp_path, [line(sha="a" * 64)])

    assert (tmp_path / "_ledger.json").read_bytes() == before, "the longer ledger must still be there"
    assert "2" in str(refused.value) and "1" in str(refused.value), str(refused.value)


def test_an_import_leaves_a_damaged_ledger_as_it_is(tmp_path: Path):
    # The book is in the vault by the time the numbers are kept true, so a ledger nobody can read may not
    # turn finished work into a failed import (IN-09). It may not be written over either (DS-18).
    vault = tmp_path / "vault"
    path = a_damaged_ledger_in(vault)

    meta = ingest_epub(make_epub(tmp_path / f"{BOOK_ID}.epub", PARAGRAPH), vault, custom_book_id=BOOK_ID)

    assert meta.total_words > 0, "the book itself must still be imported"
    assert path.read_bytes() == DAMAGED, "the ledger must be exactly as it was"
    assert len(copies_beside(path)) == 1, "and its bytes must be kept in a copy"


def test_the_inbox_leaves_a_damaged_ledger_as_it_is(tmp_path: Path, monkeypatch, capsys):
    # This is the loss itself: the inbox read the ledger as no lines, added its one new record, and wrote
    # a one-line ledger over the record of every book ever taken in.
    inbox = an_inbox_on(tmp_path, monkeypatch)
    path = a_damaged_ledger_in(tmp_path / "vault")
    (tmp_path / "inbox").mkdir()
    make_epub(tmp_path / "inbox" / f"{BOOK_ID}.epub", PARAGRAPH)

    assert inbox.main() == 1, "a ledger it could not read must stop the run"

    assert path.read_bytes() == DAMAGED, "the ledger must be exactly as it was"
    assert not (tmp_path / "vault" / "books" / BOOK_ID).exists(), "and no book may be taken in"
    said = capsys.readouterr()
    assert str(copies_beside(path)[0]) in said.out + said.err, "the run must say where the copy is"


# --- and the controls, which must stay green ---


def test_a_good_ledger_still_reads(tmp_path: Path):
    write_ledger(tmp_path, [line(words=5)])

    assert [it["total_words"] for it in read_ledger(tmp_path)] == [5]
    assert copies_beside(tmp_path / "_ledger.json") == [], "a good ledger keeps no copy"


def test_a_ledger_with_a_byte_order_mark_is_not_damaged(tmp_path: Path):
    # Some editors write one at the start of a UTF-8 file. It carries no data, as the Rust reader says.
    (tmp_path / "_ledger.json").write_bytes(b"\xef\xbb\xbf" + json.dumps([line(words=5)]).encode("utf-8"))

    assert [it["total_words"] for it in read_ledger(tmp_path)] == [5]


def test_a_ledger_holding_a_stray_line_is_not_damaged(tmp_path: Path):
    # A file that parses is not damaged. Only the lines that are not lines are left out.
    (tmp_path / "_ledger.json").write_text(json.dumps([line(), "a stray string", 7]), encoding="utf-8")

    assert len(read_ledger(tmp_path)) == 1
    assert copies_beside(tmp_path / "_ledger.json") == []


def test_a_ledger_of_the_same_length_is_written(tmp_path: Path):
    write_ledger(tmp_path, [line(words=1)])

    write_ledger(tmp_path, [line(words=2)])

    assert [it["total_words"] for it in read_ledger(tmp_path)] == [2]


def test_a_longer_ledger_is_written(tmp_path: Path):
    write_ledger(tmp_path, [line(sha="a" * 64)])

    write_ledger(tmp_path, [line(sha="a" * 64), line(book_id="other", sha="b" * 64)])

    assert len(read_ledger(tmp_path)) == 2


def test_a_shorter_ledger_is_written_when_the_caller_says_so(tmp_path: Path):
    write_ledger(tmp_path, [line(sha="a" * 64), line(book_id="other", sha="b" * 64)])

    write_ledger(tmp_path, [line(sha="a" * 64)], may_be_shorter=True)

    assert len(read_ledger(tmp_path)) == 1
