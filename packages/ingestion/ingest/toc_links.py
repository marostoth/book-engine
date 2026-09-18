"""Links the contents of an EPUB book to the chapter files and paragraphs of its import (CQ-01).

The contents of an EPUB book link to source documents and element ids, such as `text/part-2.xhtml#chapter-7`. The vault
has neither: the import writes each source document as a chapter file (`ch-07.md`) whose paragraphs end with an anchor
(`^p-012`). So the import writes into each entry the chapter file that holds it (`href`) and the paragraph where it
starts (`anchor`). The app opens an entry by file and paragraph, never by title, because chapters can share a title:
every book of The Wealth of Nations starts again at "CHAPTER I.".
"""

from __future__ import annotations

import posixpath
from dataclasses import dataclass, field
from typing import Dict, List, Mapping, Optional, Sequence
from urllib.parse import unquote

from ingest.anchors import ANCHOR_REGEX
from ingest.models import TOCItem


@dataclass(frozen=True)
class ImportedDocument:
    """A source document of the book, as the import wrote it."""

    chapter_file: str
    # The paragraph where each element id of the document starts, or None for an element before the first paragraph
    element_anchors: Mapping[str, Optional[str]] = field(default_factory=dict)


def element_anchors(
    blocks: Sequence[str], element_blocks: Mapping[str, int], anchored_markdown: str
) -> Dict[str, Optional[str]]:
    """The paragraph where each element of a document starts.

    `blocks` are the Markdown blocks of the document without its footnotes, `element_blocks` gives the block where each
    element starts (`html_to_markdown_blocks`), and `anchored_markdown` is the chapter with its paragraph anchors.

    An element starts at the first paragraph at or after its block. An element before the first paragraph gets None,
    the top of the chapter, and an element after the last paragraph gets the last paragraph.
    """
    # A block can hold a blank line, and a block whose picture was dropped is empty: count the Markdown blocks that
    # the anchors went to, as `inject_paragraph_anchors` splits them
    starts: List[int] = []
    pieces = 0
    for block in blocks:
        starts.append(pieces)
        pieces += sum(1 for piece in block.split("\n\n") if piece.strip())

    anchors: List[Optional[str]] = []
    for piece in anchored_markdown.split("\n\n"):
        if piece.strip():
            match = ANCHOR_REGEX.search(piece.strip())
            anchors.append(match.group(0).strip() if match else None)
    # `pieces` counts only the text, so an entry never starts in the footnotes after it
    pieces = min(pieces, len(anchors))

    first_from: List[Optional[str]] = [None] * (pieces + 1)
    for n in range(pieces - 1, -1, -1):
        first_from[n] = anchors[n] or first_from[n + 1]
    last_before: List[Optional[str]] = [None] * (pieces + 1)
    for n in range(pieces):
        last_before[n + 1] = anchors[n] or last_before[n]

    found: Dict[str, Optional[str]] = {}
    for element_id, block in element_blocks.items():
        start = min(starts[block], pieces) if block < len(starts) else pieces
        found[element_id] = (first_from[start] or last_before[start]) if last_before[start] else None
    return found


def link_toc_to_chapters(items: Sequence[TOCItem], documents: Mapping[str, ImportedDocument]) -> None:
    """Writes into each entry, and into its sub-entries, the chapter file that holds it and the paragraph where it starts.

    `documents` holds the imported source documents by their name in the manifest. An entry whose document made no
    chapter, such as an empty page or an endnote file whose notes moved into the chapters, gets no file (""). An entry
    whose element id the document does not have opens the top of the chapter.
    """
    for item in items:
        path, _, fragment = item.href.partition("#")
        document = _linked_document(path, documents)
        item.href = document.chapter_file if document else ""
        item.anchor = document.element_anchors.get(unquote(fragment)) if document and fragment else None
        link_toc_to_chapters(item.subitems, documents)


def without_entries_that_lead_nowhere(items: Sequence[TOCItem]) -> List[TOCItem]:
    """The contents without the entries that open nothing (CQ-04).

    An entry gets no chapter file when its document made none: an endnote file whose notes moved into the chapters,
    or a page that holds no text of the book, such as the license of Project Gutenberg that the import leaves out
    (IN-02). A reader taps such an entry and nothing happens, so it goes.

    An entry that only groups the entries below it, such as "Part I", has no file of its own and stays, because its
    children still open. Its children are weighed first, so a group whose every child leads nowhere goes with them.
    """
    kept: List[TOCItem] = []
    for item in items:
        item.subitems = without_entries_that_lead_nowhere(item.subitems)
        if item.href or item.subitems:
            kept.append(item)
    return kept


def _linked_document(path: str, documents: Mapping[str, ImportedDocument]) -> Optional[ImportedDocument]:
    """The imported document that a link of the contents names, or None.

    The navigation document of an EPUB 3 book, and an NCX file next to the manifest, name documents as the manifest
    does. An NCX file in another folder names them from its own folder, such as `../text/chapter-1.xhtml`: then a
    document whose name ends with that path counts, when it is the only one.
    """
    if not path:
        return None
    name = posixpath.normpath(unquote(path))
    if name in documents:
        return documents[name]
    while name.startswith("../"):
        name = name[3:]
    matches = [document for key, document in documents.items() if key == name or key.endswith("/" + name)]
    return matches[0] if len(matches) == 1 else None
