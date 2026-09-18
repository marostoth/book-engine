"""Does a citation still point at its passage, and does a report link still open one? (CQ-06)

A syntopicon topic keeps a citation as free text: a book id, a chapter file, a paragraph anchor and a quote. The audit
already checks that the book, the chapter and the anchor are there. It never read the quote back, so a quote could say
one thing while the paragraph said another, and nobody would know.

A report in `vault/syntopicon/reports/` links to a passage. The links used to start at `vault/`, which is where the
repository starts and not where the report is, so every one of them led nowhere. A link is checked here by following
it, not by matching a shape, so a report written by any hand is checked the same way.

The quote is compared by its letters and digits only, the rule `words_of` in `places.py` uses. So a line wrap, a
changed dash or an added mark makes no difference, and only real text does. `vault/syntopicon_check.rs` in the app
uses the same rule, so the app and the audit agree.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Optional

from ingest.line_endings import normalize_line_endings
from ingest.places import words_of

#: A markdown link: the text in brackets, then the target in round brackets.
LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
#: A link that goes to the web or the mail, or that stays inside one file. It names no passage, so it is left alone.
NOT_A_PASSAGE = ("http://", "https://", "mailto:", "#")


def paragraph_at(chapter_text: str, anchor: str) -> Optional[str]:
    """The paragraph of the chapter whose last word is `anchor`, with the anchor taken off, or None."""
    if not anchor:
        return None
    for block in (block.strip() for block in normalize_line_endings(chapter_text).split("\n\n")):
        if not block.endswith(anchor):
            continue
        text = block[: -len(anchor)]
        if not text or text[-1].isspace():
            return text.rstrip()
    return None


def quote_is_there(quote: str, paragraph: str) -> bool:
    """True when the paragraph holds the quote, counting letters and digits only."""
    wanted = words_of(quote)
    return bool(wanted) and wanted in words_of(paragraph)


def quote_that_moved(citation: dict, chapter_text: str) -> Optional[str]:
    """Why this citation's quote cannot be read back from its paragraph, or None when it can.

    A citation with no quote, and one whose anchor names no paragraph, gives None: the audit reports a missing
    anchor itself, and saying it twice would only make its message longer.
    """
    quote = str(citation.get("quote") or "").strip()
    anchor = str(citation.get("anchor") or "")
    if not quote or not anchor:
        return None

    paragraph = paragraph_at(chapter_text, anchor)
    if paragraph is None or quote_is_there(quote, paragraph):
        return None
    return (
        f"The quote of paragraph '{anchor}' is not in that paragraph any more. Read the passage again and cite "
        "it as the book has it now."
    )


#: What is wrong with a link, and what to do about it. The fault decides the advice: a link written from the wrong
#: place is put right by exporting the report again, and a book that left the vault is not.
NO_FOLDER = "names a folder that is not in the vault. Put that book back, or take its citation out of the topic"
NO_FILE = "reaches no file. Export the report again, so its links are written from the folder it is saved in"
NO_READ = "names a file that cannot be read"
NO_PARAGRAPH = "names a file that has no such paragraph. Export the report again: a new import can give a paragraph another number"


def links_that_lead_nowhere(vault_dir: Path) -> List[Dict[str, str]]:
    """Every link in a report that reaches no file, or a file with no such paragraph.

    Each answer gives the report file name, the link, and what is wrong with it. A link to the web, to the mail or
    inside the same file is left alone.
    """
    reports_dir = Path(vault_dir) / "syntopicon" / "reports"
    broken: List[Dict[str, str]] = []
    for report in sorted(reports_dir.glob("*.md")) if reports_dir.is_dir() else []:
        try:
            text = report.read_bytes().decode("utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for href in LINK.findall(text):
            if href.startswith(NOT_A_PASSAGE):
                continue
            file_part, _, anchor = href.partition("#")
            target = report.parent / file_part
            if not target.is_file():
                broken.append({"report": report.name, "href": href, "why": NO_FILE if target.parent.is_dir() else NO_FOLDER})
                continue
            if not anchor:
                continue
            try:
                chapter = target.read_bytes().decode("utf-8")
            except (OSError, UnicodeDecodeError):
                broken.append({"report": report.name, "href": href, "why": NO_READ})
                continue
            if paragraph_at(chapter, anchor) is None:
                broken.append({"report": report.name, "href": href, "why": NO_PARAGRAPH})
    return broken
