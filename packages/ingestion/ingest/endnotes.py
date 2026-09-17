"""Endnote and citation relocation engine.

Resolves internal reference targets (intra-chapter or severed backmatter files),
extracts the citation text, inlines it as a standard Markdown footnote definition
at the bottom of the corresponding chapter ([^1]: Citation text), and updates the
in-text link to [^1].
"""

from __future__ import annotations
import re
from typing import Dict, List, Optional, Set, Tuple
from bs4 import BeautifulSoup, Tag
import ebooklib
from ebooklib import epub

from ingest.line_endings import read_html


class EndnoteRegistry:
    """Collects and indexes endnote definitions across all EPUB documents."""

    def __init__(self) -> None:
        # Key: (doc_name, element_id) -> text
        self.exact_notes: Dict[Tuple[str, str], str] = {}
        # Fallback Key: element_id -> (doc_name, text)
        self.id_notes: Dict[str, str] = {}

    def register_document(self, doc_name: str, html_content: str | bytes) -> None:
        """Scan a document for potential footnote/endnote target elements with id or name."""
        soup = read_html(html_content)

        for el in soup.find_all(attrs={"id": True}):
            elem_id = el["id"]
            text = self._extract_clean_note_text(el)
            if text:
                self.exact_notes[(doc_name, elem_id)] = text
                self.id_notes[elem_id] = text

        for el in soup.find_all("a", attrs={"name": True}):
            elem_name = el["name"]
            # Look at parent container if <a> is just an anchor
            parent = el.parent if el.parent and el.parent.name in ("p", "li", "div", "dd") else el
            text = self._extract_clean_note_text(parent)
            if text:
                self.exact_notes[(doc_name, elem_name)] = text
                self.id_notes[elem_name] = text

    def _extract_clean_note_text(self, element: Tag) -> str:
        """Extract note text, removing back-reference links like [back], ↩, etc."""
        clone = BeautifulSoup(str(element), "html.parser")
        # Strip backlinks or return symbols
        for a in clone.find_all("a"):
            a_text = a.get_text().strip()
            # If link is pure back-link or arrow or identical to id/number
            if a_text in ("↩", "↑", "[back]", "back", "^", "return") or re.match(r"^\[?\d+\]?\.?$", a_text):
                a.decompose()

        text = clone.get_text(" ", strip=True)
        # A note is one line, because a footnote of a chapter is one line in Markdown and in the reader (IN-06)
        text = re.sub(r"\s*\n\s*", " ", text)
        # Strip leading numbers like "1. ", "1 ", "[1] "
        text = re.sub(r"^(?:\[\d+\]|\d+\.|\d+)\s*", "", text).strip()
        # Strip trailing back-reference indicators
        text = re.sub(r"\s*(?:\[back\]|↩|↑|\^|return)\s*$", "", text).strip()
        return text

    def resolve_note(self, source_doc: str, href: str) -> Optional[str]:
        """Resolve a link href to its target note text."""
        if "#" not in href:
            return None

        target_doc, fragment = href.split("#", 1)
        target_doc = target_doc.strip()

        # If href is "#n1", target_doc is source_doc
        if not target_doc:
            target_doc = source_doc
        else:
            # Normalize target_doc relative to source_doc directory
            source_dir = "/".join(source_doc.split("/")[:-1])
            if source_dir:
                normalized = f"{source_dir}/{target_doc}"
            else:
                normalized = target_doc
            # Try both normalized and raw filename
            for cand in (target_doc, normalized, target_doc.split("/")[-1]):
                if (cand, fragment) in self.exact_notes:
                    return self.exact_notes[(cand, fragment)]

        # Direct exact match
        if (target_doc, fragment) in self.exact_notes:
            return self.exact_notes[(target_doc, fragment)]

        # Fallback by fragment ID
        if fragment in self.id_notes:
            return self.id_notes[fragment]

        return None


def relocate_chapter_footnotes(
    chapter_soup: BeautifulSoup,
    source_doc: str,
    registry: EndnoteRegistry
) -> List[Tuple[str, str]]:
    """Find in-text note links in chapter_soup, replace them with [^n], and return list of (footnote_id, note_text).

    Returns [(footnote_id, note_text), ...] in order of appearance.
    """
    resolved_notes: List[Tuple[str, str]] = []
    seen_notes: Dict[str, str] = {}  # note_key -> footnote_id
    note_counter = 1

    # Find all candidate <a> tags
    for a in chapter_soup.find_all("a", href=True):
        href = a["href"]
        # Skip external http(s) links or mailto
        if href.startswith(("http://", "https://", "mailto:")):
            continue

        # Check if this link points to a note in the registry
        note_text = registry.resolve_note(source_doc, href)
        if not note_text:
            # Check heuristics: epub:type="noteref", class contains "noteref", or is a superscript link
            is_sup = a.find_parent("sup") is not None or a.find("sup") is not None
            classes = a.get("class", [])
            is_noteref = "noteref" in classes or a.get("epub:type") == "noteref" or is_sup
            if is_noteref and "#" in href:
                # If target text was not found, fall back to using inner link text or placeholder
                inner = a.get_text(strip=True)
                note_text = f"Citation {inner} (Reference target: {href})"

        if note_text:
            # Dedup if same note referenced twice
            target_key = href
            if target_key not in seen_notes:
                fn_id = str(note_counter)
                seen_notes[target_key] = fn_id
                resolved_notes.append((fn_id, note_text))
                note_counter += 1
            else:
                fn_id = seen_notes[target_key]

            # Replace <a> element in soup with footnote marker text [^fn_id]
            # If parent was <sup>, replace the <sup> with the marker
            marker_text = f"[^{fn_id}]"
            if a.parent and a.parent.name == "sup":
                a.parent.replace_with(marker_text)
            else:
                a.replace_with(marker_text)

    return resolved_notes
