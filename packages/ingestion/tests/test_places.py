"""How a new import finds the old chapters and paragraphs in the new text, and moves the reader's files (IN-04).

`test_import_moves.py` imports whole books. These tests write the chapter files of a book as the import does, so each
one shows one kind of change: a joined paragraph, a paragraph cut in two, a chapter in another place, a chapter that is
gone, and the files of the reader that cannot be read.
"""

import json
from pathlib import Path
from typing import Dict, List

from ingest.places import NewPlaces, Place, move_reader_files, read_book_text

BOOK = "harbour-notes"

A = [
    "A tide rises twice a day on the north coast.",
    "Pilots read the tide tables before dawn.",
    "Spring tides come with the new moon and the full moon.",
]
B = [
    "A mooring holds a ship at one place in the harbour.",
    "Heavy chains run from the buoy to a block on the sea bed.",
    "Crews check every shackle of the chain in spring.",
]
C = [
    "Storms close the harbour mouth a few days each winter.",
    "The harbour master raises a black cone before a gale.",
]


def write_book(vault: Path, chapters: Dict[str, List[str]]) -> None:
    """Writes the chapters of a book as the import does: `_meta.json`, and chapter files whose paragraphs end with an
    anchor. The chapter files of an earlier text go first."""
    book = vault / "books" / BOOK
    book.mkdir(parents=True, exist_ok=True)
    for old in book.glob("ch-*.md"):
        old.unlink()
    spine = []
    for n, (title, paragraphs) in enumerate(chapters.items(), start=1):
        name = f"ch-{n:02d}.md"
        blocks = [f"# {title}", *(f"{text} ^p-{i:03d}" for i, text in enumerate(paragraphs, start=1))]
        (book / name).write_text("\n\n".join(blocks), encoding="utf-8", newline="\n")
        spine.append({"id": name[:-3], "title": title, "file_path": name})
    (book / "_meta.json").write_text(json.dumps({"book_id": BOOK, "spine": spine}), encoding="utf-8")


def places(tmp_path: Path, old: Dict[str, List[str]], new: Dict[str, List[str]]) -> NewPlaces:
    vault = tmp_path / "vault"
    write_book(vault, old)
    old_text = read_book_text(vault / "books" / BOOK)
    write_book(vault, new)
    return NewPlaces(old_text, read_book_text(vault / "books" / BOOK))


def new_import(tmp_path: Path, old: Dict[str, List[str]], new: Dict[str, List[str]], reader_files: Dict[str, str]):
    """A vault with the old text and the reader's files, after a new import of the new text. Gives the notes folder."""
    vault = tmp_path / "vault"
    write_book(vault, old)
    notes = vault / "notes" / BOOK
    notes.mkdir(parents=True)
    for name, text in reader_files.items():
        (notes / name).write_bytes(text.encode("utf-8"))
    old_text = read_book_text(vault / "books" / BOOK)
    write_book(vault, new)
    move_reader_files(vault, BOOK, old_text)
    return notes


def test_paragraphs_that_the_new_import_joins_go_to_the_joined_paragraph(tmp_path: Path) -> None:
    moved = places(tmp_path, {"Tides": A}, {"Tides": [A[0], f"{A[1]} {A[2]}"]})

    assert moved.of("ch-01.md", "^p-002") == Place("ch-01.md", "^p-002")
    assert moved.of("ch-01.md", "^p-003") == Place("ch-01.md", "^p-002")


def test_a_paragraph_that_the_new_import_cuts_in_two_goes_to_its_first_part(tmp_path: Path) -> None:
    moved = places(tmp_path, {"Tides": [A[0], f"{A[1]} {A[2]}"], "Moorings": B}, {"Tides": A, "Moorings": B})

    assert moved.of("ch-01.md", "^p-002") == Place("ch-01.md", "^p-002")
    assert moved.of("ch-02.md", "^p-003") == Place("ch-02.md", "^p-003")


def test_a_chapter_in_another_place_keeps_its_paragraphs(tmp_path: Path) -> None:
    moved = places(tmp_path, {"Tides": A, "Moorings": B}, {"Moorings": B, "Tides": A})

    assert moved.of_chapter("ch-01.md") == Place("ch-02.md")
    assert moved.of_chapter("ch-02.md") == Place("ch-01.md")
    assert moved.of("ch-01.md", "^p-003") == Place("ch-02.md", "^p-003")
    assert moved.of("ch-02.md", "^p-001") == Place("ch-01.md", "^p-001")


def test_a_chapter_whose_text_is_gone_goes_with_the_chapter_before_it(tmp_path: Path) -> None:
    licence = ["This licence text came from the website of the publisher.", "Copies of it may be shared freely."]
    moved = places(tmp_path, {"Tides": A, "Licence": licence, "Storms": C}, {"Tides": A, "Storms": C})

    assert moved.of_chapter("ch-02.md") == Place("ch-01.md", near=True)
    assert moved.of("ch-02.md", "^p-002") == Place("ch-01.md", "^p-003", near=True), "the last paragraph before it"
    assert moved.of_chapter("ch-03.md") == Place("ch-02.md")


def test_a_paragraph_whose_text_is_gone_goes_to_the_paragraph_before_it(tmp_path: Path) -> None:
    moved = places(tmp_path, {"Tides": A}, {"Tides": [A[0], A[2]]})

    assert moved.of("ch-01.md", "^p-002") == Place("ch-01.md", "^p-001", near=True)
    assert moved.of("ch-01.md", "^p-003") == Place("ch-01.md", "^p-002")


def test_the_same_text_again_moves_nothing(tmp_path: Path) -> None:
    assert places(tmp_path, {"Tides": A, "Moorings": B}, {"Tides": A, "Moorings": B}).moves_nothing()
    assert not places(tmp_path, {"Tides": A, "Moorings": B}, {"Tides": A, "Moorings": B[:2]}).moves_nothing()


def test_a_new_text_with_none_of_the_old_text_moves_no_file_and_says_so(tmp_path: Path, capsys) -> None:
    bookmark = '{\n  "chapterFile": "ch-02.md",\n  "anchor": "^p-001",\n  "savedAt": "2026-09-17T10:05:00.000Z"\n}'

    notes = new_import(tmp_path, {"Tides": A, "Moorings": B}, {"Storms": C}, {"bookmark.json": bookmark})

    assert (notes / "bookmark.json").read_text(encoding="utf-8") == bookmark
    assert "has none of the text of the book before it" in capsys.readouterr().err


def test_an_anchor_in_notes_that_is_in_another_chapter_now_stays_and_the_import_says_so(tmp_path: Path, capsys) -> None:
    highlights = json.dumps([{"id": "hl-1", "exact": "buoy", "anchor": "^p-005"}, {"id": "hl-2", "exact": "tide"}])

    notes = new_import(
        tmp_path,
        {"Tides and moorings": [*A, *B]},
        {"Tides and moorings": A, "Moorings": B},
        {"ch-01-notes.md": "- Tides (^p-001)\n- Chains (^p-005)\n", "ch-01-highlights.json": highlights},
    )

    assert (notes / "ch-01-notes.md").read_text(encoding="utf-8") == "- Tides (^p-001)\n- Chains (^p-005)\n"
    stayed = json.loads((notes / "ch-01-highlights.json").read_text(encoding="utf-8"))
    moved = json.loads((notes / "ch-02-highlights.json").read_text(encoding="utf-8"))
    assert stayed == [{"id": "hl-2", "exact": "tide"}], "a highlight with no anchor stays with the chapter of its file"
    assert moved == [{"id": "hl-1", "exact": "buoy", "anchor": "^p-002"}], "a highlight goes to its paragraph's chapter"
    assert "ch-01-notes.md ^p-005 (now ch-02.md ^p-002)" in capsys.readouterr().err


def test_a_readable_file_at_the_new_name_keeps_its_own_text_first(tmp_path: Path) -> None:
    notes = new_import(
        tmp_path,
        {"Tides": A},
        {"Dedication": ["For the harbour pilots of the north coast."], "Tides": A},
        {"ch-01-notes.md": "- Tables (^p-002)\n", "ch-02-notes.md": "Notes of a chapter that an older import had.\n"},
    )

    assert (notes / "ch-02-notes.md").read_text(encoding="utf-8") == (
        "Notes of a chapter that an older import had.\n\n- Tables (^p-002)\n"
    )
    assert not (notes / "ch-01-notes.md").exists()


def test_when_a_file_at_a_new_name_cannot_be_read_no_notes_or_highlights_move(tmp_path: Path, capsys) -> None:
    bookmark = json.dumps({"chapterFile": "ch-01.md", "anchor": "^p-002", "savedAt": ""}, indent=2)
    highlights = json.dumps([{"id": "hl-1", "exact": "tide tables", "anchor": "^p-002"}])
    # A damaged highlights file of a chapter that an older import had is in the way of the highlights of chapter 1
    damaged = "[{not json"

    notes = new_import(
        tmp_path,
        {"Tides": A},
        {"Dedication": ["For the harbour pilots of the north coast."], "Tides": A},
        {
            "ch-01-notes.md": "- Tables (^p-002)\n",
            "ch-01-highlights.json": highlights,
            "ch-02-highlights.json": damaged,
            "bookmark.json": bookmark,
        },
    )

    assert (notes / "ch-01-notes.md").read_text(encoding="utf-8") == "- Tables (^p-002)\n"
    assert (notes / "ch-01-highlights.json").read_text(encoding="utf-8") == highlights
    assert (notes / "ch-02-highlights.json").read_text(encoding="utf-8") == damaged
    assert not (notes / "ch-02-notes.md").exists()
    assert json.loads((notes / "bookmark.json").read_text(encoding="utf-8"))["chapterFile"] == "ch-02.md"
    printed = capsys.readouterr().err
    assert "ch-02-highlights.json" in printed and "keep their chapter files" in printed, printed


def test_a_moved_file_keeps_its_line_endings_and_a_damaged_log_line_stays(tmp_path: Path) -> None:
    reading = (
        '{"bookId":"harbour-notes","chapterFile":"ch-01.md","secondsSpent":60,"completed":false,"readAt":1}\r\n'
        '{"bookId":"harbour-notes","chapterFile":"ch-01.md","secondsSp\n'
    )

    notes = new_import(
        tmp_path,
        {"Tides": A},
        {"Dedication": ["For the harbour pilots of the north coast."], "Tides": A},
        {"ch-01-notes.md": "# Reflections\r\n\r\n- Tables (^p-002)\r\n", "reading.jsonl": reading},
    )

    assert (notes / "ch-02-notes.md").read_bytes() == b"# Reflections\r\n\r\n- Tables (^p-002)\r\n"
    moved_line = reading.replace('"ch-01.md","secondsSpent"', '"ch-02.md","secondsSpent"')
    assert (notes / "reading.jsonl").read_bytes().decode("utf-8") == moved_line
