"""The parts of a PDF book, from its outline (the PDF table of contents), so the import keeps every page (IN-01).

Every outline entry at the level of the chapters becomes a part: the preface, each chapter, each appendix, the index.
So does an entry above that level that holds no chapter, together with the sections inside it. An entry that holds
chapters, such as "Part 1" or the book title, is not a part itself, but the pages it has before its first inner
entry are. A part runs until the next part starts, so only the pages before the first part are left out.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Any, List, Optional, Pattern, Sequence, Tuple

# A number in a title: 12, XII or twelve
_NUMBER = (
    r"(?:\d+|[IVXLCDM]+\b|(?i:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)"
    r"(?:-(?:one|two|three|four|five|six|seven|eight|nine))?|one|two|three|four|five|six|seven|eight|nine|ten"
    r"|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b)"
)
CHAPTER_TITLE = re.compile(rf"\b(?i:chapter)\s+{_NUMBER}")
# A chapter that has a number but not the word, such as "1 Introduction" or "12. Pricing" (not "1.2 Section")
NUMBERED_TITLE = re.compile(r"^\d{1,3}[.:]?\s+[^\d\s]")
# An entry that holds chapters, such as "Part 2", "Book One" or "Volume IV"
PART_TITLE = re.compile(rf"^(?i:part|book|volume)\s+{_NUMBER}")
APPENDIX_TITLE = re.compile(r"(?i)^appendi(?:x|ces)\b")
PREFACE_TITLE = re.compile(r"(?i)\bpreface\b")

FRONT_MATTER = "front matter"
CHAPTER = "chapter"
# A part between two chapters that has no chapter title, such as the title page of "Part 2" or an interlude
BODY = "body"
APPENDIX = "appendix"
BACK_MATTER = "back matter"
# The book owner chose these (IN-01): a preface, a reference list or an index gives weak practice cards.
KINDS_WITH_CARDS = (CHAPTER, BODY, APPENDIX)

PAGES_PER_PART_WITHOUT_OUTLINE = 35


@dataclass(frozen=True)
class BookPart:
    """One part of the book: its outline titles, its pages and its kind."""

    titles: Tuple[str, ...]
    first_page: int  # 0-based
    end_page: int  # 0-based, the page after the last page of the part
    kind: str = CHAPTER

    @property
    def title(self) -> str:
        # A page cannot be split, so outline entries that start on the same page share one part.
        return " / ".join(self.titles)

    @property
    def pages(self) -> List[int]:
        return list(range(self.first_page, self.end_page))

    @property
    def makes_cards(self) -> bool:
        return self.kind in KINDS_WITH_CARDS

    @property
    def is_preface(self) -> bool:
        return self.kind == FRONT_MATTER and any(PREFACE_TITLE.search(title) for title in self.titles)


@dataclass(frozen=True)
class _Start:
    page: int
    title: str
    # "part" for the pages of an entry that holds some chapters, before its first inner entry, such as the title
    # page of "Part 1"; "book" when the entry holds every chapter, such as the book title; "" for any other part
    opens: str = ""


def _usable_entries(toc: Sequence[Sequence[Any]], page_count: int) -> List[Tuple[int, str, int]]:
    """(level, title, 0-based page) for the outline entries that have a title and a page of this book."""
    entries = []
    for entry in toc:
        level, title, page = int(entry[0]), str(entry[1]).strip(), int(entry[2])
        if title and 1 <= page <= page_count:
            entries.append((level, title, page - 1))
    return entries


def _chapter_level(entries: Sequence[Tuple[int, str, int]]) -> Tuple[int, Optional[Pattern[str]]]:
    """The outline level of the chapters, and the title pattern that found them (None when no title looks like one)."""
    for pattern in (CHAPTER_TITLE, NUMBERED_TITLE):
        levels = Counter(level for level, title, _ in entries if pattern.search(title))
        if levels:
            return _most_common(levels), pattern
    # No title looks like a chapter: the chapters are one level below the entries named like parts, if the outline
    # has such entries with entries inside them, or else on the first level that has more than one entry.
    part_levels = Counter(
        level for index, (level, title, _) in enumerate(entries)
        if PART_TITLE.search(title) and index + 1 < len(entries) and entries[index + 1][0] > level
    )
    if part_levels:
        return _most_common(part_levels) + 1, None
    counts = Counter(level for level, _, _ in entries)
    return next((level for level in sorted(counts) if counts[level] > 1), min(counts)), None


def _most_common(levels: Counter) -> int:
    """The level that holds the most entries; of two levels that hold as many, the one nearer the top."""
    most = max(levels.values())
    return min(level for level, count in levels.items() if count == most)


def _is_chapter_title(title: str, pattern: Optional[Pattern[str]]) -> bool:
    return pattern is not None and bool(pattern.search(title)) and not APPENDIX_TITLE.search(title)


def _starts(entries: Sequence[Tuple[int, str, int]], level: int, pattern: Optional[Pattern[str]]) -> List[_Start]:
    """Where each part starts, in outline order."""

    def is_chapter(entry_level: int, title: str) -> bool:
        return entry_level == level and (pattern is None or _is_chapter_title(title, pattern))

    all_chapters = sum(1 for entry_level, title, _ in entries if is_chapter(entry_level, title))
    starts: List[_Start] = []
    inside_part_level: Optional[int] = None
    for index, (entry_level, title, page) in enumerate(entries):
        if inside_part_level is not None and entry_level > inside_part_level:
            continue  # a section of a part
        inside_part_level = None
        if entry_level > level:
            continue
        inner = []
        for inner_entry in entries[index + 1:]:
            if inner_entry[0] <= entry_level:
                break
            inner.append(inner_entry)
        chapters = sum(1 for inner_level, inner_title, _ in inner if is_chapter(inner_level, inner_title))
        if entry_level < level and chapters:
            first_inner_page = next(inner_page for inner_level, _, inner_page in inner if inner_level <= level)
            if page < first_inner_page:
                starts.append(_Start(page, title, "book" if chapters == all_chapters else "part"))
            continue
        starts.append(_Start(page, title))
        inside_part_level = entry_level
    return starts


def outline_parts(toc: Sequence[Sequence[Any]], page_count: int) -> Tuple[List[BookPart], List[int]]:
    """The parts of the book in page order, and the 0-based pages that no part covers.

    `toc` is the outline as PyMuPDF gives it: [level, title, 1-based page, ...] per entry.
    """
    entries = _usable_entries(toc, page_count)
    if not entries:
        parts = [
            BookPart((f"Chapter {number}",), first, min(page_count, first + PAGES_PER_PART_WITHOUT_OUTLINE))
            for number, first in enumerate(range(0, page_count, PAGES_PER_PART_WITHOUT_OUTLINE), start=1)
        ]
        return parts, []

    level, pattern = _chapter_level(entries)
    grouped: List[List[_Start]] = []
    for start in sorted(_starts(entries, level, pattern), key=lambda start: start.page):  # stable sort
        if grouped and grouped[-1][0].page == start.page:
            grouped[-1].append(start)
        else:
            grouped.append([start])

    chapter_places = [
        place for place, group in enumerate(grouped) if any(_is_chapter_title(start.title, pattern) for start in group)
    ]
    kinds: List[str] = []
    for place, group in enumerate(grouped):
        if any(APPENDIX_TITLE.search(start.title) for start in group):
            kinds.append(APPENDIX)
        elif not chapter_places or place in chapter_places:
            kinds.append(CHAPTER)
        elif place < chapter_places[0]:
            kinds.append(FRONT_MATTER)
        elif place > chapter_places[-1]:
            kinds.append(BACK_MATTER)
        else:
            kinds.append(BODY)
    if chapter_places:
        # The title page of "Part 1" comes before the first chapter, but it belongs to the body.
        place = chapter_places[0] - 1
        while place >= 0 and kinds[place] == FRONT_MATTER and all(start.opens == "part" for start in grouped[place]):
            kinds[place] = BODY
            place -= 1

    ends = [group[0].page for group in grouped[1:]] + [page_count]
    parts = [
        BookPart(tuple(start.title for start in group), group[0].page, ends[place], kinds[place])
        for place, group in enumerate(grouped)
    ]
    return parts, list(range(parts[0].first_page))


def describe_pages(pages: Sequence[int]) -> str:
    """Names 0-based pages for people, with 1-based numbers: "page 1" or "pages 1-6, 9"."""
    runs: List[List[int]] = []
    for page in sorted(set(pages)):
        if runs and page == runs[-1][1] + 1:
            runs[-1][1] = page
        else:
            runs.append([page, page])
    text = ", ".join(f"{first + 1}-{last + 1}" if last > first else f"{first + 1}" for first, last in runs)
    return f"page {text}" if len(set(pages)) == 1 else f"pages {text}"
