"""The parts of a PDF book from its outline (IN-01): every page is in a part, and each part has a kind.

The two real outlines below have the levels and pages of the Kotler and Dalton PDFs, with plain titles.
"""

from __future__ import annotations

from typing import List, Sequence, Tuple

from ingest.pdf_outline import (
    APPENDIX,
    BACK_MATTER,
    BODY,
    CHAPTER,
    FRONT_MATTER,
    BookPart,
    describe_pages,
    outline_parts,
)


def spans(parts: Sequence[BookPart]) -> List[Tuple[str, int, int, str]]:
    """(title, first page, last page, kind) with 1-based pages, as a reader counts them."""
    return [(part.title, part.first_page + 1, part.end_page, part.kind) for part in parts]


KOTLER_CHAPTER_STARTS = [25, 59, 87, 121, 161, 193, 215, 247, 283, 311, 335, 363, 399, 435, 459, 485, 515, 549, 573, 605]
KOTLER_PART_STARTS = {25: "Part 1", 87: "Part 2", 215: "Part 3", 549: "Part 4"}


def kotler_outline() -> List[list]:
    outline = [
        [1, "Cover", 1], [1, "Half Title", 2], [1, "Title Page", 4], [1, "Copyright", 5], [1, "Dedication", 6],
        [1, "A Commitment", 7], [1, "Brief Contents", 8], [1, "Contents", 10],
        [1, "Preface", 16], [2, "New in This Edition", 17], [3, "Customer Engagement", 17],
        [1, "About the Authors", 22],
    ]
    for number, page in enumerate(KOTLER_CHAPTER_STARTS, start=1):
        if page in KOTLER_PART_STARTS:
            outline.append([1, KOTLER_PART_STARTS[page], page])
        outline.append([2, f"Chapter {number}. Title {number}", page])
        outline.append([3, f"Section {number}.1", page + 1])
    outline += [
        [1, "Appendix 1: A Plan", 639], [1, "Appendix 2: Numbers", 649], [2, "Ratios", 650],
        [1, "Appendix 3: Careers", 666], [1, "Glossary", 679], [1, "References", 690],
        [1, "Index", 739], [2, "Index of Names", 739], [2, "Index of Subjects", 748],
    ]
    return outline


def test_a_kotler_shaped_outline_covers_every_page_and_keeps_the_chapter_pages() -> None:
    parts, left_out = outline_parts(kotler_outline(), 769)

    assert left_out == []
    front = [
        ("Cover", 1, 1), ("Half Title", 2, 3), ("Title Page", 4, 4), ("Copyright", 5, 5), ("Dedication", 6, 6),
        ("A Commitment", 7, 7), ("Brief Contents", 8, 9), ("Contents", 10, 15), ("Preface", 16, 21),
        ("About the Authors", 22, 24),
    ]
    assert spans(parts[:10]) == [(title, first, last, FRONT_MATTER) for title, first, last in front]
    # The chapters keep the pages that the import gave them before the fix: pages 25-638 in 20 chapters.
    ends = KOTLER_CHAPTER_STARTS[1:] + [639]
    assert spans(parts[10:30]) == [
        (f"Chapter {number}. Title {number}", first, end - 1, CHAPTER)
        for number, (first, end) in enumerate(zip(KOTLER_CHAPTER_STARTS, ends), start=1)
    ]
    assert spans(parts[30:]) == [
        ("Appendix 1: A Plan", 639, 648, APPENDIX),
        ("Appendix 2: Numbers", 649, 665, APPENDIX),
        ("Appendix 3: Careers", 666, 678, APPENDIX),
        ("Glossary", 679, 689, BACK_MATTER),
        ("References", 690, 738, BACK_MATTER),
        ("Index", 739, 769, BACK_MATTER),
    ]
    assert [part.makes_cards for part in parts] == [False] * 10 + [True] * 23 + [False] * 3
    assert [part.title for part in parts if part.is_preface] == ["Preface"]


def test_a_dalton_shaped_outline_keeps_the_pages_of_the_book_title() -> None:
    chapters = [21, 27, 53, 79, 297, 315, 317]
    outline = [[1, "Book Title", 1], [2, "Contents", 7], [2, "Preface", 15], [2, "Acknowledgments", 19]]
    outline += [[2, f"Chapter {number}: Title", page] for number, page in enumerate(chapters, start=1)]
    outline += [[3, "A Section", 80], [4, "A Smaller Section", 81]]
    outline += [
        [2, "Appendix 1: Values", 351], [2, "Appendix II: Profiles", 355], [2, "Suggested Readings", 361],
        [2, "About the Authors", 363], [2, "Index", 365],
    ]
    outline.sort(key=lambda entry: entry[2])

    parts, left_out = outline_parts(outline, 370)

    assert left_out == []
    assert spans(parts) == [
        ("Book Title", 1, 6, FRONT_MATTER),
        ("Contents", 7, 14, FRONT_MATTER),
        ("Preface", 15, 18, FRONT_MATTER),
        ("Acknowledgments", 19, 20, FRONT_MATTER),
        # The same pages as before the fix
        ("Chapter 1: Title", 21, 26, CHAPTER),
        ("Chapter 2: Title", 27, 52, CHAPTER),
        ("Chapter 3: Title", 53, 78, CHAPTER),
        ("Chapter 4: Title", 79, 296, CHAPTER),
        ("Chapter 5: Title", 297, 314, CHAPTER),
        ("Chapter 6: Title", 315, 316, CHAPTER),
        ("Chapter 7: Title", 317, 350, CHAPTER),
        ("Appendix 1: Values", 351, 354, APPENDIX),
        ("Appendix II: Profiles", 355, 360, APPENDIX),
        ("Suggested Readings", 361, 362, BACK_MATTER),
        ("About the Authors", 363, 364, BACK_MATTER),
        ("Index", 365, 370, BACK_MATTER),
    ]


def test_the_last_chapter_keeps_its_sections() -> None:
    outline = [[1, "Chapter 1: A", 1], [2, "1.1 B", 2], [1, "Chapter 2: C", 3], [2, "2.1 D", 4], [2, "2.2 E", 5]]
    parts, left_out = outline_parts(outline, 5)
    assert spans(parts) == [("Chapter 1: A", 1, 2, CHAPTER), ("Chapter 2: C", 3, 5, CHAPTER)]
    assert left_out == []


def test_a_part_title_page_is_body_but_the_title_pages_of_the_whole_book_are_front_matter() -> None:
    parts, _ = outline_parts([
        [1, "Preface", 1],
        [1, "Part 1", 2], [2, "Chapter 1", 3],
        [1, "Part 2", 4], [2, "Chapter 2", 5], [2, "Interlude", 6], [2, "Chapter 3", 7],
        [1, "Index", 8],
    ], 8)
    assert spans(parts) == [
        ("Preface", 1, 1, FRONT_MATTER),
        ("Part 1", 2, 2, BODY),
        ("Chapter 1", 3, 3, CHAPTER),
        ("Part 2", 4, 4, BODY),
        ("Chapter 2", 5, 5, CHAPTER),
        ("Interlude", 6, 6, BODY),
        ("Chapter 3", 7, 7, CHAPTER),
        ("Index", 8, 8, BACK_MATTER),
    ]
    parts, _ = outline_parts([[1, "The Whole Book", 1], [2, "Chapter 1", 3], [2, "Chapter 2", 4]], 4)
    assert spans(parts)[0] == ("The Whole Book", 1, 2, FRONT_MATTER)


def test_chapters_with_a_number_but_without_the_word_are_found() -> None:
    parts, _ = outline_parts([
        [1, "Foreword", 1],
        [1, "Part I", 2], [2, "1 Beginnings", 2], [3, "1.1 A Section", 3], [2, "2. Middles", 4],
        [1, "Part II", 5], [2, "3: Endings", 5],
        [1, "Glossary", 6],
    ], 6)
    assert spans(parts) == [
        ("Foreword", 1, 1, FRONT_MATTER),
        ("1 Beginnings", 2, 3, CHAPTER),
        ("2. Middles", 4, 4, CHAPTER),
        ("3: Endings", 5, 5, CHAPTER),
        ("Glossary", 6, 6, BACK_MATTER),
    ]


def test_chapter_titles_with_a_roman_numeral_or_a_number_word_are_found() -> None:
    parts, _ = outline_parts([
        [1, "Preface", 1],
        [1, "Part I", 2], [2, "Chapter One: Ships", 2], [2, "CHAPTER IV. Tides", 3],
        [1, "Part II", 4], [2, "Chapter Twenty-One", 4],
        [1, "Index", 5],
    ], 5)
    assert spans(parts) == [
        ("Preface", 1, 1, FRONT_MATTER),
        ("Chapter One: Ships", 2, 2, CHAPTER),
        ("CHAPTER IV. Tides", 3, 3, CHAPTER),
        ("Chapter Twenty-One", 4, 4, CHAPTER),
        ("Index", 5, 5, BACK_MATTER),
    ]


def test_parts_named_with_a_number_hold_the_chapters_when_no_title_looks_like_a_chapter() -> None:
    parts, _ = outline_parts([
        [1, "Foreword", 1],
        [1, "Part One: Ships", 2], [2, "The Pilots", 3], [3, "Harbours", 4], [2, "The Tides", 5],
        [1, "Book 2: Weather", 6], [2, "The Storms", 6],
        [1, "Index", 7],
    ], 7)
    assert spans(parts) == [
        ("Foreword", 1, 1, CHAPTER),
        ("Part One: Ships", 2, 2, CHAPTER),
        ("The Pilots", 3, 4, CHAPTER),
        ("The Tides", 5, 5, CHAPTER),
        ("The Storms", 6, 6, CHAPTER),
        ("Index", 7, 7, CHAPTER),
    ]
    # A title that only starts with the word "Part" names no part.
    parts, _ = outline_parts([[1, "Part of the Problem", 1], [2, "Pilots", 2], [1, "Tides", 3]], 3)
    assert spans(parts) == [("Part of the Problem", 1, 2, CHAPTER), ("Tides", 3, 3, CHAPTER)]


def test_an_outline_without_chapter_titles_makes_every_top_part_a_chapter() -> None:
    parts, _ = outline_parts([
        [1, "Preface", 1], [1, "Harbours", 2], [2, "Pilots", 3], [1, "Appendix: Tides", 4], [1, "Index", 5],
    ], 5)
    assert spans(parts) == [
        ("Preface", 1, 1, CHAPTER),
        ("Harbours", 2, 3, CHAPTER),
        ("Appendix: Tides", 4, 4, APPENDIX),
        ("Index", 5, 5, CHAPTER),
    ]


def test_outline_entries_that_start_on_the_same_page_share_one_part() -> None:
    parts, _ = outline_parts([[1, "Dedication", 1], [1, "Epigraph", 1], [1, "Chapter 1", 2]], 3)
    assert spans(parts) == [("Dedication / Epigraph", 1, 1, FRONT_MATTER), ("Chapter 1", 2, 3, CHAPTER)]
    assert parts[0].titles == ("Dedication", "Epigraph")


def test_the_parts_follow_the_pages_when_the_outline_does_not() -> None:
    parts, _ = outline_parts([[1, "Chapter 2", 3], [1, "Chapter 1", 1], [1, "Index", 5]], 5)
    assert spans(parts) == [("Chapter 1", 1, 2, CHAPTER), ("Chapter 2", 3, 4, CHAPTER), ("Index", 5, 5, BACK_MATTER)]


def test_the_pages_before_the_first_part_are_left_out_and_named() -> None:
    parts, left_out = outline_parts([[1, "Chapter 1", 3], [1, "Chapter 2", 5]], 6)
    assert spans(parts) == [("Chapter 1", 3, 4, CHAPTER), ("Chapter 2", 5, 6, CHAPTER)]
    assert left_out == [0, 1]
    assert describe_pages(left_out) == "pages 1-2"
    assert describe_pages([0]) == "page 1"
    assert describe_pages([0, 1, 2, 3, 4, 5, 8]) == "pages 1-6, 9"


def test_entries_without_a_page_of_the_book_are_ignored_and_no_outline_gives_parts_of_35_pages() -> None:
    parts, left_out = outline_parts([[1, "Chapter 1", 1], [1, "Nowhere", -1], [1, "  ", 2], [1, "Beyond", 99]], 3)
    assert spans(parts) == [("Chapter 1", 1, 3, CHAPTER)]
    assert left_out == []

    parts, left_out = outline_parts([], 80)
    assert spans(parts) == [("Chapter 1", 1, 35, CHAPTER), ("Chapter 2", 36, 70, CHAPTER), ("Chapter 3", 71, 80, CHAPTER)]
    assert left_out == []


def test_only_chapters_body_and_appendices_make_cards_and_only_a_front_preface_is_the_preface() -> None:
    def part(kind: str, title: str = "Preface") -> BookPart:
        return BookPart((title,), 0, 1, kind)

    assert [part(kind).makes_cards for kind in (FRONT_MATTER, CHAPTER, BODY, APPENDIX, BACK_MATTER)] == [
        False, True, True, True, False,
    ]
    assert part(FRONT_MATTER, "Preface to the Second Edition").is_preface
    assert not part(BACK_MATTER, "Preface").is_preface
    assert not part(FRONT_MATTER, "Foreword").is_preface
