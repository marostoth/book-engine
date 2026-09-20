"""A book goes into the vault only when every paragraph has its anchor and every footnote link has its note (IN-05).

The inbox script checked a book after the import had written it into the vault. When the check failed, the script still
reported "Success", moved the file to `inbox/processed/`, and the vault kept the book that failed. Now the import checks
the book in its build folder (`ingest.book_build`), and a book that fails stops the import with `BookCheckError`: the
vault keeps the book that it had. `.agent/skills/audit-anchors.py` checks a book folder of the vault with the same rule.

A chapter that holds a character which nothing could read fails the check too, because the book says something there
that the reader cannot show (`ingest.glyph_repair`, CQ-02).

So does a chapter that opens a paragraph with a word the book does not have. The drop-cap repair used to guess, and
52 of its guesses went into a reader's book and passed this check, because this check only ever looked at anchors,
footnote links and broken characters. A check that reads three things and blesses the fourth answers the question
(CQ-08).
"""

from __future__ import annotations

import re
from pathlib import Path

from ingest.chapter_shape import is_heading
from ingest.glyph_repair import REPLACEMENT, unreadable_count
from ingest.text_repair import words_of

#: The anchor at the end of a paragraph: `^p-012`
ANCHOR_AT_END = re.compile(r"\^p-[a-zA-Z0-9_-]+$")
#: The same anchor anywhere in the text, to name the block that a broken character sits in
ANCHOR = re.compile(r"\^p-[a-zA-Z0-9_-]+")
#: A footnote link in the text, `[^3]`, and the note that it links to, `[^3]: ...`
FOOTNOTE_LINK = re.compile(r"\[\^([a-zA-Z0-9_-]+)\](?!:)")
FOOTNOTE = re.compile(r"\[\^([a-zA-Z0-9_-]+)\]:")
#: A paragraph may open with markdown marks. The first word is what matters, not the marks in front of it.
OPENING_MARKS = re.compile(r"^[\s#>*_`\-]+")
#: A capital and a lowercase stem at the very start of a paragraph, which is the shape a drop cap leaves behind.
FIRST_WORD = re.compile(r"([A-Z])([a-z]{2,})\b")
#: How often the book must write the stem on its own before a joined word counts as invented rather than rare.
#:
#: Measured, not chosen. At 3, all 56 damaged paragraph starts in the reader's PDF book are still found, and so
#: are 6 of the 7 in the other PDF book. Two books that came in from EPUB, which the drop-cap rule never touches,
#: give **none** between them across 2,144 paragraph starts. A failing check stops an import, so the cost of
#: flagging a good book is a book the reader cannot import, and that is what this number is holding back.
STEM_WRITTEN_AT_LEAST = 3


class BookCheckError(Exception):
    """An import stopped before it changed the vault, because the book that it made fails the check."""

    def __init__(self, book_id: str, problems: list[str]) -> None:
        self.book_id = book_id
        self.problems = problems
        super().__init__(
            f'The import of "{book_id}" stopped, because the book that it made fails the check: {" ".join(problems)} '
            "Nothing in the vault changed."
        )


def _blocks_with(text: str, character: str) -> list[str]:
    """Which anchors name the blocks that hold `character`. A block keeps its anchor at its end."""
    names: list[str] = []
    for at, found in enumerate(text):
        if found != character:
            continue
        anchor = ANCHOR.search(text, at)
        name = anchor.group(0) if anchor else "a block with no anchor"
        if name not in names:
            names.append(name)
    return names


def _invented_first_words(text: str, book_words: dict[str, int]) -> list[str]:
    """The words this chapter opens a paragraph with that the whole book writes nowhere else, and would be words
    the book does write if the first letter came off.

    That is what a drop cap put on the wrong word looks like from the outside. The book writes `the` 5,682 times
    and has never written `Cthe`, so `Cthe` at the top of a paragraph is not a rare word; it is a made-up one.

    The counts come from the whole book, never from one chapter. A word damaged in chapter six is proved by the
    thirty-five chapters that spell it correctly.

    Headings are read too, unlike the anchor check above. Measured over four books, including them changes no
    count at all, and a heading is as able to lose its first letter as a paragraph is.
    """
    found: list[str] = []
    for block in text.split("\n\n"):
        if not block.strip():
            continue
        opening = FIRST_WORD.match(OPENING_MARKS.sub("", block))
        if not opening:
            continue
        whole, stem = opening.group(1) + opening.group(2), opening.group(2)
        the_book_never_writes_it = book_words.get(whole.lower(), 0) <= 1
        the_book_does_write_the_stem = book_words.get(stem.lower(), 0) >= STEM_WRITTEN_AT_LEAST
        if the_book_never_writes_it and the_book_does_write_the_stem and whole not in found:
            found.append(whole)
    return found


def book_problems(book_dir: Path) -> list[str]:
    """What is wrong in the chapter files in `book_dir`: paragraphs with no anchor, footnote links with no note,
    characters that nothing could read, and paragraphs that open with a word the book does not have.

    A folder with no chapter file in it is itself a problem (TL-04). The check used to read no file and report
    nothing wrong, so an empty folder passed. That let `audit-anchors.py` print "All chapters passed" for a folder
    that does not exist, and it would have let an import write a book with no chapter into the vault.
    """
    problems: list[str] = []
    chapters = sorted(Path(book_dir).glob("*.md"))
    if not chapters:
        return [f"{Path(book_dir).name}: this folder holds no chapter file, so nothing was checked."]
    texts = {chapter: chapter.read_text(encoding="utf-8") for chapter in chapters}
    # Every word of the whole book, counted once. One chapter cannot say whether its own odd word is a mistake.
    book_words = words_of("\n\n".join(texts.values()))
    for chapter in chapters:
        text = texts[chapter]
        unreadable = unreadable_count(text)
        if unreadable:
            blocks = sorted(_blocks_with(text, REPLACEMENT))
            characters_are = "1 character is" if unreadable == 1 else f"{unreadable} characters are"
            problems.append(
                f"{chapter.name}: {characters_are} broken (U+FFFD), in {', '.join(blocks)}. "
                "The book drew something there that nothing could read."
            )
        paragraphs = [block for block in text.split("\n\n") if block.strip() and not is_heading(block)]
        unanchored = [block for block in paragraphs if not ANCHOR_AT_END.search(block.strip())]
        if unanchored:
            paragraphs_have = "1 paragraph has" if len(unanchored) == 1 else f"{len(unanchored)} paragraphs have"
            problems.append(f"{chapter.name}: {paragraphs_have} no anchor.")
        no_note = set(FOOTNOTE_LINK.findall(text)) - set(FOOTNOTE.findall(text))
        if no_note:
            problems.append(f"{chapter.name}: these footnote links have no note: {', '.join(sorted(no_note))}.")
        invented = _invented_first_words(text, book_words)
        if invented:
            how_many = (
                "1 paragraph starts with a word this book writes nowhere else, and it is a word"
                if len(invented) == 1
                else f"{len(invented)} paragraphs start with words this book writes nowhere else, and each is a word"
            )
            problems.append(
                f"{chapter.name}: {how_many} the book does write once its first letter comes off: "
                f"{', '.join(sorted(invented))}. A big first letter was put on the wrong word."
            )
    return problems
