"""A page's own layout marks come off the text, and a word the layout cut in two is made whole (CQ-03).

A printed page is not a stream of words. A designer puts a highlight behind a heading, drops a big
first letter into a paragraph, and hangs a hyphen at the end of a line. A text reader keeps all of
that, so a chapter can arrive pre-highlighted, with a heading that says nothing, with "consumer-
generated" split in two, and with a paragraph that lost its first letter.

Nothing here guesses a word. A letter goes back only when the chapter's own words prove which letter
it was, and only when exactly one letter fits. A hyphen closes only when the word after it is not a
joining word, because "heat- and moisture-resistant" is how the book means to write it.

The splits that run across two paragraphs are a different job: `layout_stitcher.py` does those.
"""

from __future__ import annotations

import re
import string
from collections import Counter

# The book's own highlight. In the vault a <mark> means "the reader highlighted this", so a book
# must never bring one of its own.
MARK = re.compile(r"</?mark\b[^>]*>", re.IGNORECASE)

# A heading with no words at all, left over when the layout put its text somewhere else.
EMPTY_HEADING = re.compile(r"^[ \t]*#{1,6}[ \t]*$\n?", re.MULTILINE)

# "consumer- generated": a hyphen with a space after it, inside one line.
CUT_WORD = re.compile(r"\b([A-Za-z]{2,})-[ \t]+([a-z]{2,})\b")

# "heat- and moisture-resistant" and "Product- versus Market-Oriented" are right as they stand:
# the hyphen hangs on purpose, because it waits for the second half of the next word.
JOINING_WORDS = frozenset({"and", "or", "nor", "but", "to", "versus", "vs"})

# The title of a story box at the start of a paragraph, and then a lowercase word: the paragraph
# may have lost the big first letter that the designer drew over its first two lines. The title
# must start the paragraph, because a run of bold text in the middle of a sentence is just bold
# text, and a lowercase word after it is the sentence carrying on.
LOST_FIRST_LETTER = re.compile(r"(?:(?<=\n\n)|(?<=\A))(\*\*[^\n*]{2,200}?\*\*)([ \t]+)([a-z]{2,})\b")

WORD = re.compile(r"[A-Za-z][A-Za-z'’]*")

CAPITALS = string.ascii_uppercase


def words_of(text: str) -> dict[str, int]:
    """How many times the text uses each word, in lower case."""
    counts: Counter[str] = Counter()
    for word in WORD.findall(text):
        counts[word.lower()] += 1
    return counts


def take_off_marks(text: str) -> str:
    """Takes the book's own highlight off the text and keeps the words."""
    return MARK.sub("", text)


def drop_empty_headings(text: str) -> str:
    """Drops a heading that has no words."""
    return EMPTY_HEADING.sub("", text)


def close_cut_words(text: str) -> str:
    """Closes a word that a hyphen and a space cut in two, and leaves a hanging hyphen alone."""

    def _close(match: re.Match[str]) -> str:
        head, tail = match.group(1), match.group(2)
        if tail.lower() in JOINING_WORDS:
            return match.group(0)
        return f"{head}-{tail}"

    return CUT_WORD.sub(_close, text)


def letter_that_fits(stem: str, counts: dict[str, int]) -> str:
    """The one capital letter that turns `stem` into a word the text uses, or "" when unsure.

    Exactly one letter must make a word that the text uses more than once, and the text must use
    that whole word more often than the bare stem. Anything less is a guess, so nothing is changed.
    """
    bare = counts.get(stem.lower(), 0)
    fits = [letter for letter in CAPITALS if counts.get((letter + stem).lower(), 0) > max(1, bare)]
    return fits[0] if len(fits) == 1 else ""


def first_letter_back(text: str) -> str:
    """Puts back the big first letter of a paragraph when the text's own words prove which it was."""
    counts = words_of(text)

    def _repair(match: re.Match[str]) -> str:
        bold, gap, stem = match.group(1), match.group(2), match.group(3)
        letter = letter_that_fits(stem, counts)
        if not letter:
            return match.group(0)
        return f"{bold}{gap}{letter}{stem}"

    return LOST_FIRST_LETTER.sub(_repair, text)


def repair_page_text(text: str) -> str:
    """Takes a page's own marks off a chapter and makes its cut words whole again."""
    text = take_off_marks(text)
    text = drop_empty_headings(text)
    text = close_cut_words(text)
    return first_letter_back(text)


def repairs_of(text: str) -> list[str]:
    """What `repair_page_text` would change in this text, as short lines for the import log.

    It walks the same steps in the same order, so each count is the count of the real repair.
    """
    lines: list[str] = []

    marks = len(MARK.findall(text))
    if marks:
        lines.append(f"{marks} of the book's own highlight mark(s) taken off")
    text = take_off_marks(text)

    headings = len(EMPTY_HEADING.findall(text))
    if headings:
        lines.append(f"{headings} heading(s) with no words dropped")
    text = drop_empty_headings(text)

    closed = len(CUT_WORD.findall(text)) - len(CUT_WORD.findall(close_cut_words(text)))
    if closed:
        lines.append(f"{closed} word(s) closed that a hyphen had cut in two")
    text = close_cut_words(text)

    counts = words_of(text)
    letters = sum(1 for match in LOST_FIRST_LETTER.finditer(text) if letter_that_fits(match.group(3), counts))
    if letters:
        lines.append(f"{letters} first letter(s) put back")

    return lines
