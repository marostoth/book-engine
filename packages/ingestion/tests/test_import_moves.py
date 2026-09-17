"""A new import of a book keeps the reader's files on their own chapters and paragraphs (IN-04).

A chapter file is numbered by its place in the book (`ch-01.md`), and a paragraph by its place in its chapter
(`^p-001`). A new import of a changed book, or of the same book after a fix of the import, can give a chapter or a
paragraph another number: a new import of the real Dalton PDF moves every chapter up by 4. The bookmark, the notes, the
highlights, the citations and the reading time of the reader kept the old numbers, so they pointed at other text.
"""

import json
import re
import zipfile
from pathlib import Path
from typing import Dict, List

import pymupdf
import pytest

from ingest.pipeline import ingest_book, ingest_epub

BOOK = "harbour-notes"

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""
PACKAGE = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">harbour-notes</dc:identifier>
    <dc:title>Harbour Notes</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    {manifest}
  </manifest>
  <spine>{spine}</spine>
</package>
"""
NAV = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol><li><a href="tides.xhtml">Tides</a></li></ol></nav></body>
</html>
"""
DOCUMENT = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Harbour Notes</title></head>
<body>{body}</body>
</html>
"""

TIDES = [
    "A tide rises twice a day on the north coast.",
    "Pilots read the tide tables before dawn.",
    "The pilot boardsthe ship at the outer buoy.",
    "Spring tides come with the new moon and the full moon.",
    "Slack water lasts a short while at the harbour mouth.",
    "Old charts mark the sandbanks in red ink.",
]
# The same chapter after a fix and a new edition: a new first paragraph, two words that no longer run together, one
# changed sentence, and the last paragraph is gone.
NEW_TIDES = [
    "Tides shaped every harbour town on this coast.",
    "A tide rises twice a day on the north coast.",
    "Pilots read the tide tables before dawn.",
    "The pilot boards the ship at the outer buoy.",
    "Spring tides come with the new moon and the full moon.",
    "Slack water lasts only a short while at the harbour mouth.",
]
MOORINGS = [
    "A mooring holds a ship at one place in the harbour.",
    "Heavy chains run from the buoy to a block on the sea bed.",
    "Crews check every shackle of the chain in spring.",
    "A swing mooring lets the ship turn with the wind.",
    "Fore and aft moorings keep a ship in a narrow channel.",
]
STORMS = [
    "Storms close the harbour mouth a few days each winter.",
    "The harbour master raises a black cone before a gale.",
    "Ships double their lines when the barometer falls fast.",
    "After a storm the pilots sound the channel again.",
]
DEDICATION = "For the harbour pilots of the north coast, who taught me the tides."
SAVED_AT = "2026-09-17T10:05:00.000Z"


def chapter(title: str, paragraphs: List[str]) -> str:
    return f"<h1>{title}</h1>" + "".join(f"<p>{text}</p>" for text in paragraphs)


FIRST_EDITION = {
    "tides.xhtml": chapter("Tides", TIDES),
    "moorings.xhtml": chapter("Moorings", MOORINGS),
    "storms.xhtml": chapter("Storms", STORMS),
}
# A dedication before the first chapter moves every chapter up by one, as the front matter moved the Dalton chapters
NEW_EDITION = {
    "dedication.xhtml": chapter("Dedication", [DEDICATION]),
    "tides.xhtml": chapter("Tides", NEW_TIDES),
    "moorings.xhtml": chapter("Moorings", MOORINGS),
    "storms.xhtml": chapter("Storms", STORMS),
}


def make_epub(path: Path, documents: Dict[str, str]) -> Path:
    manifest = "".join(
        f'<item id="d{n}" href="{name}" media-type="application/xhtml+xml"/>' for n, name in enumerate(documents)
    )
    spine = "".join(f'<itemref idref="d{n}"/>' for n in range(len(documents)))
    with zipfile.ZipFile(path, "w") as book:
        book.writestr("mimetype", "application/epub+zip")
        book.writestr("META-INF/container.xml", CONTAINER)
        book.writestr("OEBPS/content.opf", PACKAGE.format(manifest=manifest, spine=spine))
        book.writestr("OEBPS/nav.xhtml", NAV)
        for name, body in documents.items():
            book.writestr(f"OEBPS/{name}", DOCUMENT.format(body=body))
    return path


def squeezed(text: str) -> str:
    """Only the letters and digits of a text, so two words that ran together still match."""
    return re.sub(r"[^0-9a-z]", "", text.lower())


def paragraph(vault: Path, book_id: str, chapter_file: str, anchor: str) -> str:
    """The text of the paragraph with `anchor` in a chapter file, without the anchor."""
    text = (vault / "books" / book_id / chapter_file).read_text(encoding="utf-8")
    found = [block[: -len(anchor)].rstrip() for block in text.split("\n\n") if block.endswith(f" {anchor}")]
    assert len(found) == 1, f"{chapter_file} has no paragraph {anchor}"
    return found[0]


def chapter_titles(vault: Path, book_id: str) -> Dict[str, str]:
    meta = json.loads((vault / "books" / book_id / "_meta.json").read_text(encoding="utf-8"))
    return {chapter["file_path"]: chapter["title"] for chapter in meta["spine"]}


def read_lines(path: Path) -> List[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2), encoding="utf-8", newline="\n")


TIDES_NOTES = (
    "# Reflections: Harbour Notes - Tides\n\n"
    "## Key Takeaways\n\n"
    '> "The pilot boardsthe ship" (#^p-003)\n'
    "- Reflection: the pilot boards outside the harbour.\n\n"
    '> "a short while at the harbour mouth" (#^p-005)\n'
    "- Reflection: plan the entry around slack water.\n"
)
MOORINGS_NOTES = "# Moorings\n\n- Chains run to a block on the sea bed (^p-002)\n"
HIGHLIGHTS = [
    {
        "id": "hl-1",
        "exact": "read the tide tables",
        "prefix": "Pilots ",
        "suffix": " before dawn.",
        "anchor": "^p-002",
        "color": "yellow",
        "createdAt": "2026-09-17T10:00:00.000Z",
    },
    {
        "id": "hl-2",
        "exact": "mark the sandbanks",
        "prefix": "Old charts ",
        "suffix": " in red ink.",
        "anchor": "^p-006",
        "createdAt": "2026-09-17T10:01:00.000Z",
    },
]
STORM_HIGHLIGHTS = [
    {
        "id": "hl-3",
        "exact": "close the harbour mouth",
        "prefix": "Storms ",
        "suffix": " a few days",
        "anchor": "^p-001",
        "createdAt": "2026-09-17T10:02:00.000Z",
    }
]
ANALYTICAL = {
    "terms": [
        {
            "id": "term-1",
            "term": "Slack water",
            "authorDefinition": "The short time when the tide does not run.",
            "citation": {"chapterFile": "ch-01.md", "anchor": "^p-005", "quote": "a short while at the harbour mouth"},
        }
    ],
    "arguments": [
        {
            "id": "arg-1",
            "title": "Ships stay in port in a gale",
            "conclusion": {"chapterFile": "ch-03.md", "anchor": "^p-002", "quote": "raises a black cone before a gale"},
            "premises": [{"chapterFile": "ch-01.md", "anchor": "^p-004", "quote": "come with the new moon"}],
            "inferenceType": "deductive",
            "notes": "",
        }
    ],
    "critiques": [],
    "inquiries": [],
}
TOPIC = {
    "id": "harbour-weather",
    "title": "Harbour weather",
    "neutralTerms": [
        {
            "id": "nt-1",
            "term": "slack water",
            "neutralDefinition": "Water that does not flow.",
            "mappings": [
                {
                    "bookId": BOOK,
                    "authorVariant": "slack water",
                    "citation": {
                        "bookId": BOOK,
                        "chapterFile": "ch-02.md",
                        "anchor": "^p-001",
                        "quote": "holds a ship at one place",
                    },
                },
                {
                    "bookId": "other-book",
                    "authorVariant": "still water",
                    "citation": {"bookId": "other-book", "chapterFile": "ch-02.md", "anchor": "^p-001", "quote": "x"},
                },
            ],
        }
    ],
    "questions": [],
    "controversies": [],
}


def write_reader_files(vault: Path) -> None:
    """The files a reader made while reading the first edition."""
    notes = vault / "notes" / BOOK
    write_json(notes / "bookmark.json", {"chapterFile": "ch-01.md", "anchor": "^p-004", "savedAt": SAVED_AT})
    lines = [
        {"bookId": BOOK, "chapterFile": "ch-01.md", "secondsSpent": 300, "completed": True, "readAt": 1789000000},
        {
            "bookId": BOOK,
            "chapterFile": "ch-02.md",
            "secondsSpent": 120,
            "completed": False,
            "readAt": 1789000100,
            "wordsRead": 2467,
        },
        {"bookId": BOOK, "chapterFile": "ch-03.md", "secondsSpent": 60, "completed": False, "readAt": 1789000200},
    ]
    (notes / "reading.jsonl").write_text(
        "".join(json.dumps(line, separators=(",", ":")) + "\n" for line in lines), encoding="utf-8", newline="\n"
    )
    (notes / "ch-01-notes.md").write_text(TIDES_NOTES, encoding="utf-8", newline="\n")
    (notes / "ch-02-notes.md").write_text(MOORINGS_NOTES, encoding="utf-8", newline="\n")
    write_json(notes / "ch-01-highlights.json", HIGHLIGHTS)
    write_json(notes / "ch-03-highlights.json", STORM_HIGHLIGHTS)
    write_json(notes / "analytical.json", ANALYTICAL)
    write_json(notes / "vocabulary.json", [{"word": "slack", "definition": "not tight", "anchor": "^p-005"}])
    write_json(notes / "inspectional.json", {"exitAssessment": {"classification": "Practical", "completedAt": ""}})
    write_json(vault / "syntopicon" / "topics" / "harbour-weather.json", TOPIC)


@pytest.fixture
def new_edition(tmp_path: Path, capsys):
    """A vault whose reader read the first edition, after a new import of the new edition. Gives the vault and the
    text that the new import printed."""
    vault = tmp_path / "vault"
    ingest_epub(make_epub(tmp_path / "first.epub", FIRST_EDITION), vault, custom_book_id=BOOK)
    write_reader_files(vault)
    capsys.readouterr()
    ingest_epub(make_epub(tmp_path / "new.epub", NEW_EDITION), vault, custom_book_id=BOOK, replace=True)
    printed = capsys.readouterr()
    return vault, printed.out + printed.err


def test_the_new_import_moves_the_chapters_and_the_paragraphs(new_edition) -> None:
    vault, _ = new_edition

    assert chapter_titles(vault, BOOK) == {
        "ch-01.md": "Dedication",
        "ch-02.md": "Tides",
        "ch-03.md": "Moorings",
        "ch-04.md": "Storms",
    }
    assert paragraph(vault, BOOK, "ch-02.md", "^p-004") == "The pilot boards the ship at the outer buoy."


def test_the_bookmark_stays_on_its_paragraph(new_edition) -> None:
    vault, _ = new_edition

    bookmark = json.loads((vault / "notes" / BOOK / "bookmark.json").read_text(encoding="utf-8"))

    assert (bookmark["chapterFile"], bookmark["anchor"]) == ("ch-02.md", "^p-005")
    assert paragraph(vault, BOOK, bookmark["chapterFile"], bookmark["anchor"]) == TIDES[3]
    assert bookmark["savedAt"] == SAVED_AT, "the bookmark keeps the time the reader saved it"


def test_reading_time_stays_with_its_chapter(new_edition) -> None:
    vault, _ = new_edition
    titles = chapter_titles(vault, BOOK)

    lines = read_lines(vault / "notes" / BOOK / "reading.jsonl")

    assert [(titles.get(line["chapterFile"]), line["secondsSpent"], line["completed"]) for line in lines] == [
        ("Tides", 300, True),
        ("Moorings", 120, False),
        ("Storms", 60, False),
    ]
    assert lines[1]["wordsRead"] == 2467 and lines[1]["readAt"] == 1789000100, "every other field of a line stays"


def test_notes_stay_with_their_chapter_and_quote_their_own_paragraphs(new_edition) -> None:
    vault, _ = new_edition
    notes = vault / "notes" / BOOK

    tides = (notes / "ch-02-notes.md").read_text(encoding="utf-8")
    moorings = (notes / "ch-03-notes.md").read_text(encoding="utf-8")

    assert tides == TIDES_NOTES.replace("^p-005", "^p-006").replace("^p-003", "^p-004")
    for quote, anchor in re.findall(r'> "([^"]+)" \(#(\^p-\d{3})\)', tides):
        assert squeezed(quote) in squeezed(paragraph(vault, BOOK, "ch-02.md", anchor)), quote
    assert moorings == MOORINGS_NOTES
    dedication = notes / "ch-01-notes.md"
    assert not dedication.exists() or "boards outside" not in dedication.read_text(encoding="utf-8"), "only a template"
    assert not (notes / "ch-04-notes.md").exists()


def test_highlights_stay_with_their_chapter_and_paragraph(new_edition) -> None:
    vault, printed = new_edition
    notes = vault / "notes" / BOOK

    tides = json.loads((notes / "ch-02-highlights.json").read_text(encoding="utf-8"))
    storms = json.loads((notes / "ch-04-highlights.json").read_text(encoding="utf-8"))

    assert [item["id"] for item in tides] == ["hl-1", "hl-2"]
    assert tides[0] == {**HIGHLIGHTS[0], "anchor": "^p-003"}
    assert HIGHLIGHTS[0]["exact"] in paragraph(vault, BOOK, "ch-02.md", tides[0]["anchor"])
    assert storms == STORM_HIGHLIGHTS, "a paragraph that keeps its number keeps its anchor"
    assert not (notes / "ch-01-highlights.json").exists() and not (notes / "ch-03-highlights.json").exists()
    # The new edition does not have the text of the second highlight, so it goes to the paragraph before it
    assert tides[1] == {**HIGHLIGHTS[1], "anchor": "^p-006"}
    assert any(
        "ch-01-highlights.json" in line and "^p-006" in line and "nearest" in line for line in printed.splitlines()
    ), printed


def test_citations_stay_on_their_paragraphs_and_other_books_keep_theirs(new_edition) -> None:
    vault, _ = new_edition
    notes = vault / "notes" / BOOK

    analytical = json.loads((notes / "analytical.json").read_text(encoding="utf-8"))
    topic = json.loads((vault / "syntopicon" / "topics" / "harbour-weather.json").read_text(encoding="utf-8"))

    citations = [
        analytical["terms"][0]["citation"],
        analytical["arguments"][0]["conclusion"],
        analytical["arguments"][0]["premises"][0],
        topic["neutralTerms"][0]["mappings"][0]["citation"],
    ]
    assert [(c["chapterFile"], c["anchor"]) for c in citations] == [
        ("ch-02.md", "^p-006"),
        ("ch-04.md", "^p-002"),
        ("ch-02.md", "^p-005"),
        ("ch-03.md", "^p-001"),
    ]
    for citation in citations:
        assert citation["quote"] in paragraph(vault, BOOK, citation["chapterFile"], citation["anchor"])
    assert topic["neutralTerms"][0]["mappings"][1] == TOPIC["neutralTerms"][0]["mappings"][1], "another book's citation"


def test_files_that_name_no_chapter_are_left_as_they_are(new_edition) -> None:
    vault, _ = new_edition
    notes = vault / "notes" / BOOK

    assert json.loads((notes / "vocabulary.json").read_text(encoding="utf-8"))[0]["anchor"] == "^p-005"
    assessment = json.loads((notes / "inspectional.json").read_text(encoding="utf-8"))["exitAssessment"]
    assert assessment["classification"] == "Practical"


def test_a_new_import_of_the_same_book_changes_no_file_of_the_reader(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    epub = make_epub(tmp_path / "first.epub", FIRST_EDITION)
    ingest_epub(epub, vault, custom_book_id=BOOK)
    write_reader_files(vault)
    reader_files = [path for path in sorted((vault / "notes" / BOOK).iterdir()) if path.name != "practice-deck.md"]
    reader_files.append(vault / "syntopicon" / "topics" / "harbour-weather.json")
    before = {path: path.read_bytes() for path in reader_files}

    ingest_epub(epub, vault, custom_book_id=BOOK, replace=True)

    assert {path: path.read_bytes() for path in reader_files} == before
    deck = vault / "notes" / BOOK / "practice-deck.md"
    assert sorted((vault / "notes" / BOOK).iterdir()) == sorted([*reader_files[:-1], deck]), "and it adds no file"


def page_text(name: str) -> str:
    return (
        f"The {name} page keeps its own marker sentence here.\n"
        f"A harbour pilot reads the {name} tide tables.\n"
        "\n"
        f"The second paragraph of the {name} page is short.\n"
        f"It ends the {name} page with a calm remark.\n"
    )


def make_pdf(path: Path, pages: List[str], outline: List[list]) -> Path:
    doc = pymupdf.open()
    for name in pages:
        doc.new_page().insert_text((50, 72), page_text(name), fontsize=11)
    doc.set_toc(outline)
    doc.set_metadata({"title": "Harbour Test Book", "author": "Test Author"})
    doc.save(str(path))
    doc.close()
    return path


def test_a_pdf_book_that_gets_front_matter_keeps_the_readers_files_on_their_chapters(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    book = "harbour-pdf"
    (tmp_path / "first").mkdir()
    (tmp_path / "new").mkdir()
    first = make_pdf(
        tmp_path / "first" / "harbour.pdf",
        ["pilots", "tides"],
        [[1, "Chapter 1: Pilots", 1], [1, "Chapter 2: Tides", 2]],
    )
    # The PDF import keeps the front matter as a part of its own since IN-01, so a new import moves every chapter up
    new = make_pdf(
        tmp_path / "new" / "harbour.pdf",
        ["cover", "pilots", "tides"],
        [[1, "Cover", 1], [1, "Chapter 1: Pilots", 2], [1, "Chapter 2: Tides", 3]],
    )
    ingest_book(first, vault, book_id=book)
    notes = vault / "notes" / book
    assert chapter_titles(vault, book) == {"ch-01.md": "Chapter 1: Pilots", "ch-02.md": "Chapter 2: Tides"}
    kept_paragraph = paragraph(vault, book, "ch-02.md", "^p-002")
    with (notes / "ch-01-notes.md").open("a", encoding="utf-8", newline="\n") as own:
        own.write('> "keeps its own marker sentence" (#^p-001)\n- Reflection: my own words.\n')
    reader_notes = (notes / "ch-01-notes.md").read_text(encoding="utf-8")
    write_json(notes / "bookmark.json", {"chapterFile": "ch-02.md", "anchor": "^p-002", "savedAt": SAVED_AT})
    (notes / "reading.jsonl").write_text(
        f'{{"bookId":"{book}","chapterFile":"ch-01.md","secondsSpent":100,"completed":true,"readAt":1789000000}}\n'
        f'{{"bookId":"{book}","chapterFile":"ch-02.md","secondsSpent":50,"completed":false,"readAt":1789000100}}\n',
        encoding="utf-8",
        newline="\n",
    )

    ingest_book(new, vault, book_id=book, replace=True)

    titles = chapter_titles(vault, book)
    assert titles == {"ch-01.md": "Cover", "ch-02.md": "Chapter 1: Pilots", "ch-03.md": "Chapter 2: Tides"}
    bookmark = json.loads((notes / "bookmark.json").read_text(encoding="utf-8"))
    assert (bookmark["chapterFile"], bookmark["anchor"]) == ("ch-03.md", "^p-002")
    assert paragraph(vault, book, "ch-03.md", "^p-002") == kept_paragraph
    reading = read_lines(notes / "reading.jsonl")
    assert [titles[line["chapterFile"]] for line in reading] == ["Chapter 1: Pilots", "Chapter 2: Tides"]
    assert (notes / "ch-02-notes.md").read_text(encoding="utf-8") == reader_notes, "chapter 1 keeps its notes"
    assert not (notes / "ch-01-notes.md").exists(), "the cover gets no notes of another chapter"
    assert not (notes / "ch-03-notes.md").exists(), "chapter 2 had no notes, and gets none of another chapter"
