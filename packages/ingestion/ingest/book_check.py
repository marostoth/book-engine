"""A book goes into the vault only when every paragraph has its anchor and every footnote link has its note (IN-05).

The inbox script checked a book after the import had written it into the vault. When the check failed, the script still
reported "Success", moved the file to `inbox/processed/`, and the vault kept the book that failed. Now the import checks
the book in its build folder (`ingest.book_build`), and a book that fails stops the import with `BookCheckError`: the
vault keeps the book that it had. `.agent/skills/audit-anchors.py` checks a book folder of the vault with the same rule.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import List

#: The anchor at the end of a paragraph: `^p-012`
ANCHOR_AT_END = re.compile(r"\^p-[a-zA-Z0-9_-]+$")
#: A footnote link in the text, `[^3]`, and the note that it links to, `[^3]: ...`
FOOTNOTE_LINK = re.compile(r"\[\^([a-zA-Z0-9_-]+)\](?!:)")
FOOTNOTE = re.compile(r"\[\^([a-zA-Z0-9_-]+)\]:")


class BookCheckError(Exception):
    """An import stopped before it changed the vault, because the book that it made fails the check."""

    def __init__(self, book_id: str, problems: List[str]) -> None:
        self.book_id = book_id
        self.problems = problems
        super().__init__(
            f'The import of "{book_id}" stopped, because the book that it made fails the check: {" ".join(problems)} '
            "Nothing in the vault changed."
        )


def book_problems(book_dir: Path) -> List[str]:
    """What is wrong in the chapter files in `book_dir`: paragraphs with no anchor, and footnote links with no note."""
    problems: List[str] = []
    for chapter in sorted(Path(book_dir).glob("*.md")):
        text = chapter.read_text(encoding="utf-8")
        paragraphs = [block for block in text.split("\n\n") if block.strip() and not block.startswith("#")]
        unanchored = [block for block in paragraphs if not ANCHOR_AT_END.search(block.strip())]
        if unanchored:
            paragraphs_have = "1 paragraph has" if len(unanchored) == 1 else f"{len(unanchored)} paragraphs have"
            problems.append(f"{chapter.name}: {paragraphs_have} no anchor.")
        no_note = set(FOOTNOTE_LINK.findall(text)) - set(FOOTNOTE.findall(text))
        if no_note:
            problems.append(f"{chapter.name}: these footnote links have no note: {', '.join(sorted(no_note))}.")
    return problems
