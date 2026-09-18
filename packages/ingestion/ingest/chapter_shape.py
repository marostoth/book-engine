"""A document of a book becomes a chapter only when it holds text, and a chapter's name says what a reader reads.

An EPUB can give a division of a book ("BOOK I.") a document of its own that holds nothing but the title. Such a page
is no chapter: a reader opens it and finds nothing to read, and it makes no practice card, because there is no
sentence. Its headings belong with the text they introduce, so they go to the top of the chapter that follows (CQ-04).

The same book can also put the title of a division and its first chapter in one document, as The Wealth of Nations
does for BOOK III and BOOK V. The name of such a chapter is then the name of the chapter, not of the division: the
division is already the line above it in the contents, and the list of chapters shows only the first words of a name.
"""

from __future__ import annotations

import re
from typing import List, Optional, Sequence

# The title of a division of a book, and the title of a chapter. `ingest.epub_parser` reads the contents of a book
# with the same two rules, so a division and a chapter mean the same thing everywhere.
DIVISION_TITLE = re.compile(r"^(?:BOOK|PART|VOLUME)\s+([IVXLCDM\d]+)", re.IGNORECASE)
CHAPTER_TITLE = re.compile(r"^(?:CHAPTER|CHAP\.)\s+([IVXLCDM\d]+)", re.IGNORECASE)

# The marks of a Markdown heading, and the spaces after them
HEADING_MARKS = re.compile(r"^#{1,6}[ \t]*")

# Only the three biggest headings name a chapter, as they always have. A smaller heading marks a part inside a
# chapter, such as "PART I. Of the Expense of Defence.".
NAMING_HEADING = re.compile(r"^#{1,3}[ \t]")

# A Markdown heading: one to six `#` marks, and then a space, a tab or the end of the line. A line with a
# word right after its marks, or with more than six of them, is text: "#1 rule of the market", a hashtag,
# "####### seven marks". Such a line used to count as a heading, so it got no paragraph anchor and no
# reader could search it, cite it or mark it (IN-08).
HEADING = re.compile(r"^#{1,6}(?:[ \t\n]|$)")


def is_heading(block: str) -> bool:
    """True for a Markdown heading. Every other block is text, which gets a paragraph anchor."""
    return bool(HEADING.match(block))


def names_a_chapter(block: str) -> bool:
    """True for a heading big enough to name a chapter."""
    return bool(NAMING_HEADING.match(block))


def heading_words(block: str) -> str:
    """The words of a heading, without its `#` marks."""
    return HEADING_MARKS.sub("", block).strip()


def holds_no_text(blocks: Sequence[str]) -> bool:
    """True when a document holds nothing but headings, so it is no chapter of its own.

    Every block that is not a heading gets a paragraph anchor, so a page of pictures, of a table or of a list is a
    chapter and stays one. Only a page whose whole content is a title has nothing for a reader to read.
    """
    return bool(blocks) and all(is_heading(block) for block in blocks)


def chapter_name(blocks: Sequence[str]) -> Optional[str]:
    """The name of the chapter that `blocks` make, or None when no heading of theirs names a chapter.

    It is the first such heading, except when that heading names a division of the book and the heading right after
    it names a chapter. A reader who opens the chapter reads that chapter, so the chapter carries its name, and the
    division stays the line above it in the contents.
    """
    naming = [heading_words(block) for block in blocks if names_a_chapter(block)]
    if not naming:
        return None
    first_two_name = len(blocks) >= 2 and names_a_chapter(blocks[0]) and names_a_chapter(blocks[1])
    if first_two_name and DIVISION_TITLE.match(naming[0]) and CHAPTER_TITLE.match(naming[1]):
        return naming[1]
    return naming[0]


class HeldOverBlocks:
    """The headings of the documents that held no text, waiting for the chapter they introduce.

    A document with no text of its own writes no chapter file. Its headings are held over and go to the top of the
    next chapter, so no word of the book is lost. Its entry of the contents then opens that chapter at the top,
    which is where its heading now stands, so no link of the book is lost either (CQ-01).
    """

    def __init__(self) -> None:
        self.blocks: List[str] = []
        # The name of each held-over document in the manifest, for the links of the contents (CQ-01)
        self.document_names: List[str] = []

    def hold(self, blocks: Sequence[str], document_name: str) -> None:
        self.blocks.extend(blocks)
        self.document_names.append(document_name)

    def in_front_of(self, blocks: Sequence[str]) -> List[str]:
        """The held-over headings, and then `blocks`."""
        return [*self.blocks, *blocks]

    def shift(self) -> int:
        """How far the blocks of the next document move, so that an element still names its own block."""
        return len(self.blocks)

    def take_names(self) -> List[str]:
        """The names of the held-over documents, and then nothing is held over any more."""
        names = list(self.document_names)
        self.blocks = []
        self.document_names = []
        return names

    def has_any(self) -> bool:
        return bool(self.document_names)
