"""The PDF import keeps every part of the book that the PDF outline names, not only the chapters (IN-01).

Each test makes a small PDF, imports it into a vault in a temporary folder and reads what the import wrote. The tests
use no module that the fix added, so they also run against the import from before the fix.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence

import pymupdf
import pytest

from ingest.models import BookMeta
from ingest.pipeline import ingest_book

SKILLS = Path(__file__).resolve().parents[3] / ".agent" / "skills"


def page_text(name: str) -> str:
    """Two paragraphs with a marker sentence that only this page has, and a term that the page repeats."""
    return (
        f"The {name} page keeps its own marker sentence here.\n"
        f"A harbour pilot reads the {name} tide tables.\n"
        f"Every harbour pilot checks the {name} buoys at dawn.\n"
        "\n"
        f"The second paragraph of the {name} page is short.\n"
        f"It ends the {name} page with a calm remark.\n"
    )


def marker(name: str) -> str:
    return f"The {name} page keeps its own marker sentence here."


@dataclass
class ImportedBook:
    meta: BookMeta
    book_dir: Path
    notes_dir: Path
    printed: str

    def pages_per_part(self, pages: Sequence[str]) -> Dict[str, List[str]]:
        """The page names that each chapter file holds, by the title of its spine item."""
        found: Dict[str, List[str]] = {}
        for chapter in self.meta.spine:
            text = (self.book_dir / chapter.file_path).read_text(encoding="utf-8")
            found[chapter.title] = [name for name in pages if marker(name) in text]
        return found

    def deck(self) -> str:
        return (self.notes_dir / "practice-deck.md").read_text(encoding="utf-8")


def import_pdf(folder: Path, pages: Sequence[str], outline: Sequence[Sequence], **options) -> ImportedBook:
    pdf_path = folder / "harbour-test-book.pdf"
    if not pdf_path.exists():
        doc = pymupdf.open()
        for name in pages:
            doc.new_page().insert_text((50, 72), page_text(name), fontsize=11)
        if outline:
            doc.set_toc([list(entry) for entry in outline])
        doc.set_metadata({"title": "Harbour Test Book", "author": "Test Author"})
        doc.save(str(pdf_path))
        doc.close()
    printed = io.StringIO()
    with contextlib.redirect_stdout(printed):
        meta = ingest_book(pdf_path, folder / "vault", **options)
    return ImportedBook(
        meta=meta,
        book_dir=folder / "vault" / "books" / meta.book_id,
        notes_dir=folder / "vault" / "notes" / meta.book_id,
        printed=printed.getvalue(),
    )


# A book like Kotler's PDF: front matter, parts that hold chapters, appendices and back matter at the top level
HARBOUR_PAGES = [
    "cover", "preface", "partone", "pilots", "moorings", "tides", "parttwo", "storms", "tables", "sources", "lookup",
]
HARBOUR_OUTLINE = [
    [1, "Preface", 2],
    [1, "Part 1: Ships", 3],
    [2, "Chapter 1: Pilots", 4],
    [2, "Chapter 2: Tides", 6],
    [1, "Part 2: Weather", 7],
    [2, "Chapter 3: Storms", 8],
    [1, "Appendix A: Tables", 9],
    [1, "References", 10],
    [1, "Index", 11],
]


@pytest.fixture(scope="module")
def harbour_book(tmp_path_factory: pytest.TempPathFactory) -> ImportedBook:
    return import_pdf(tmp_path_factory.mktemp("harbour"), HARBOUR_PAGES, HARBOUR_OUTLINE)


def test_the_import_keeps_the_front_matter_the_part_pages_and_the_back_matter(harbour_book: ImportedBook) -> None:
    assert harbour_book.pages_per_part(HARBOUR_PAGES) == {
        "Preface": ["preface"],
        "Part 1: Ships": ["partone"],
        "Chapter 1: Pilots": ["pilots", "moorings"],
        "Chapter 2: Tides": ["tides"],
        "Part 2: Weather": ["parttwo"],
        "Chapter 3: Storms": ["storms"],
        "Appendix A: Tables": ["tables"],
        "References": ["sources"],
        "Index": ["lookup"],
    }
    assert [chapter.file_path for chapter in harbour_book.meta.spine] == [f"ch-{n:02d}.md" for n in range(1, 10)]
    assert harbour_book.meta.total_chapters == 9


def test_the_import_names_the_pages_that_no_part_of_the_outline_covers(harbour_book: ImportedBook) -> None:
    assert "Not imported: page 1. No part of the PDF outline covers it." in harbour_book.printed
    for chapter in harbour_book.meta.spine:
        assert marker("cover") not in (harbour_book.book_dir / chapter.file_path).read_text(encoding="utf-8")


def test_only_chapters_part_pages_and_appendices_make_practice_cards(harbour_book: ImportedBook) -> None:
    deck = harbour_book.deck()
    chapters_with_cards = sorted(set(re.findall(r"^- \*\*Chapter:\*\* (ch-\d+)$", deck, flags=re.MULTILINE)))
    # The owner's choice: a preface, a reference list or an index makes no cards.
    assert chapters_with_cards == ["ch-02", "ch-03", "ch-04", "ch-05", "ch-06", "ch-07"]


def test_the_blueprint_and_the_first_notes_point_at_the_chapters(harbour_book: ImportedBook) -> None:
    blueprint = harbour_book.meta.inspectional_blueprint
    assert blueprint is not None
    assert blueprint.pivotal_chapters == ["ch-03", "ch-06"], "the first and the last chapter, not the preface or index"
    assert blueprint.front_matter["has_preface"] is True
    assert blueprint.front_matter["preface_path"] == "ch-01.md"

    notes = sorted(path.name for path in harbour_book.notes_dir.iterdir())
    assert notes == ["ch-03-notes.md", "practice-deck.md"]
    first_line = (harbour_book.notes_dir / "ch-03-notes.md").read_text(encoding="utf-8").splitlines()[0]
    assert first_line == "# Reflections: Harbour Test Book - Chapter 1: Pilots"

    written = json.loads((harbour_book.book_dir / "_meta.json").read_text(encoding="utf-8"))
    assert [item["title"] for item in written["toc"]] == [chapter.title for chapter in harbour_book.meta.spine]
    assert written["total_words"] == sum(item["word_count"] for item in written["spine"])


def load_skill(file_name: str):
    spec = importlib.util.spec_from_file_location(file_name[:-3].replace("-", "_"), SKILLS / file_name)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_audits_pass_on_the_imported_book(harbour_book: ImportedBook) -> None:
    # Short parts, such as a page with two paragraphs, must still get head and tail samples that share no paragraph.
    vault = harbour_book.book_dir.parents[1]
    assert load_skill("audit-anchors.py").audit_book(harbour_book.book_dir)

    system = load_skill("audit-system.py")
    passed, metric = system.audit_inspectional_parity(vault)
    assert passed, metric
    elementary = system.check_elementary_reading_parity(vault)
    assert elementary.passed, elementary.errors

    deck = load_skill("audit-practice.py").audit_book_practice_deck(harbour_book.notes_dir / "practice-deck.md", vault / "books")
    assert (deck.mismatches, deck.errors) == (0, [])
    assert deck.total > 0


def test_a_book_title_that_holds_every_chapter_keeps_its_own_pages(tmp_path: Path) -> None:
    # A book like Dalton's PDF: the outline has the book title on top and every part one level below it
    pages = ["titlepage", "copyright", "contents", "pilots", "tides", "tables", "lookup"]
    book = import_pdf(tmp_path, pages, [
        [1, "Harbour Test Book", 1],
        [2, "Contents", 3],
        [2, "Chapter 1: Pilots", 4],
        [2, "Chapter 2: Tides", 5],
        [2, "Appendix 1: Tables", 6],
        [2, "Index", 7],
    ])
    assert book.pages_per_part(pages) == {
        "Harbour Test Book": ["titlepage", "copyright"],
        "Contents": ["contents"],
        "Chapter 1: Pilots": ["pilots"],
        "Chapter 2: Tides": ["tides"],
        "Appendix 1: Tables": ["tables"],
        "Index": ["lookup"],
    }
    assert book.printed.count("Not imported") == 0


def test_the_last_chapter_keeps_its_sections(tmp_path: Path) -> None:
    pages = ["pilots", "moorings", "tides", "currents", "storms"]
    book = import_pdf(tmp_path, pages, [
        [1, "Chapter 1: Pilots", 1],
        [2, "Moorings", 2],
        [1, "Chapter 2: Tides", 3],
        [2, "Currents", 4],
        [2, "Storms", 5],
    ])
    assert book.pages_per_part(pages) == {
        "Chapter 1: Pilots": ["pilots", "moorings"],
        "Chapter 2: Tides": ["tides", "currents", "storms"],
    }


def test_parts_without_a_chapter_number_are_imported(tmp_path: Path) -> None:
    pages = ["intro", "pilots", "interlude", "tides", "conclusion", "epilogue"]
    book = import_pdf(tmp_path, pages, [
        [1, "Introduction", 1],
        [1, "Chapter 1: Pilots", 2],
        [1, "Interlude", 3],
        [1, "Chapter 2: Tides", 4],
        [1, "Conclusion", 5],
        [1, "Epilogue", 6],
    ])
    assert book.pages_per_part(pages) == {
        "Introduction": ["intro"],
        "Chapter 1: Pilots": ["pilots"],
        "Interlude": ["interlude"],
        "Chapter 2: Tides": ["tides"],
        "Conclusion": ["conclusion"],
        "Epilogue": ["epilogue"],
    }


def test_outline_entries_that_start_on_the_same_page_share_one_part(tmp_path: Path) -> None:
    pages = ["dedication", "pilots"]
    book = import_pdf(tmp_path, pages, [
        [1, "Dedication", 1],
        [1, "Epigraph", 1],
        [1, "Chapter 1: Pilots", 2],
    ])
    assert book.pages_per_part(pages) == {"Dedication / Epigraph": ["dedication"], "Chapter 1: Pilots": ["pilots"]}


def test_a_pdf_without_an_outline_is_still_imported_in_parts_of_35_pages(tmp_path: Path) -> None:
    pages = ["first", "second", "third"]
    book = import_pdf(tmp_path, pages, [])
    assert book.pages_per_part(pages) == {"Chapter 1": ["first", "second", "third"]}


def test_importing_one_part_again_writes_the_same_book_and_deck(tmp_path: Path) -> None:
    whole = import_pdf(tmp_path, HARBOUR_PAGES, HARBOUR_OUTLINE)
    meta_before = json.loads((whole.book_dir / "_meta.json").read_text(encoding="utf-8"))
    deck_before = whole.deck()

    again = import_pdf(tmp_path, HARBOUR_PAGES, HARBOUR_OUTLINE, target_chapters=[3], replace=True)
    meta_after = json.loads((again.book_dir / "_meta.json").read_text(encoding="utf-8"))
    assert meta_after == meta_before
    assert again.deck() == deck_before
