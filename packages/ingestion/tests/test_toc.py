"""Unit tests for hierarchical TOC parsing and schema contracts."""

from ebooklib import epub
from ingest.epub_parser import parse_toc
from ingest.models import BookMeta, ChapterMeta, TOCItem


def test_parse_nested_toc():
    toc_structure = [
        (
            epub.Section("Part 1: Fundamentals"),
            [
                epub.Link("ch01.xhtml", "Chapter 1: Clocks", "ch01"),
                epub.Link("ch02.xhtml", "Chapter 2: Consensus", "ch02"),
            ],
        ),
        epub.Link("notes.xhtml", "Endnotes", "notes"),
    ]

    items = parse_toc(toc_structure)

    assert len(items) == 2
    # Part 1
    part1 = items[0]
    assert part1.title == "Part 1: Fundamentals"
    assert part1.level == 1
    assert len(part1.subitems) == 2

    # Subchapters
    assert part1.subitems[0].title == "Chapter 1: Clocks"
    assert part1.subitems[0].href == "ch01.xhtml"
    assert part1.subitems[0].level == 2

    assert part1.subitems[1].title == "Chapter 2: Consensus"
    assert part1.subitems[1].href == "ch02.xhtml"

    # Top-level endnote
    assert items[1].title == "Endnotes"
    assert items[1].level == 1


def test_book_meta_serialization():
    meta = BookMeta(
        book_id="sample-book",
        title="Sample Book Title",
        author="Author Name",
        total_words=1250,
        total_chapters=2,
        toc=[
            TOCItem(
                id="p1",
                title="Part 1",
                href="",
                level=1,
                subitems=[TOCItem(id="c1", title="Chapter 1", href="ch01.xhtml", level=2)],
            )
        ],
        spine=[
            ChapterMeta(
                id="ch-01",
                title="Chapter 1",
                file_path="ch-01.md",
                order=1,
                word_count=600,
                anchor_count=10,
                first_anchor="^p-001",
                last_anchor="^p-010",
                footnotes_count=2,
            )
        ],
    )

    json_str = meta.model_dump_json(indent=2)
    assert '"book_id": "sample-book"' in json_str
    assert '"total_chapters": 2' in json_str
    assert '"first_anchor": "^p-001"' in json_str

    # Round trip
    loaded = BookMeta.model_validate_json(json_str)
    assert loaded.book_id == "sample-book"
    assert len(loaded.spine) == 1
