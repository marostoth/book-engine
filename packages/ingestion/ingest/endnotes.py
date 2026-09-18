"""Endnote and citation relocation engine.

Resolves internal reference targets (intra-chapter or severed backmatter files),
extracts the citation text, inlines it as a standard Markdown footnote definition
at the bottom of the corresponding chapter ([^1]: Citation text), and updates the
in-text link to [^1].

Only a link to a note becomes a footnote (IN-02): a link that says that it names a note, a link to an element that says
that it is a note, and a link that looks like the mark of a note, such as a superscript number. Its target must be able
to be a note, so a heading or a part of the book, such as a section, never is one. Any other link, such as "see Section
Two", keeps its words as text of the chapter.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag

from ingest.line_endings import read_html

# The kinds of a note in `epub:type` (EPUB 3) and in `role` (DPUB-ARIA)
NOTE_KINDS = {"footnote", "endnote", "rearnote", "doc-footnote", "doc-endnote"}
# The kinds of a list of notes
NOTE_LIST_KINDS = {"footnotes", "endnotes", "rearnotes", "doc-endnotes"}
# The kinds of a link to a note
NOTE_REFERENCE_KINDS = {"noteref", "doc-noteref"}
# Elements that are never a note: headings, and the parts of a book
NOT_NOTES = {
    "html",
    "body",
    "main",
    "article",
    "section",
    "nav",
    "header",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
}
# The text of a link that marks a note: a number or a sign such as *, maybe in brackets
NOTE_MARK = re.compile(r"[\[(]?(?:\d{1,4}|[*†‡§¶]{1,3})[\])]?")


@dataclass(frozen=True)
class NoteTarget:
    """An element that a link can name: its text as a note, and what the registry knows about it."""

    text: str
    # The element says that it is a note, or it is inside a note or a list of notes
    declared: bool
    # The element can be a note: it is no heading or part of a book, and it holds no heading
    note_sized: bool


def attribute(tag: Tag, name: str) -> str:
    """The value of an attribute as one string. BeautifulSoup gives a list for a multi-valued attribute
    such as `class`, and an element that has no such attribute gives nothing at all."""
    value = tag.get(name)
    if isinstance(value, list):
        return " ".join(str(one) for one in value)
    return str(value) if value is not None else ""


class EndnoteRegistry:
    """Collects and indexes endnote definitions across all EPUB documents."""

    def __init__(self) -> None:
        # Key: (doc_name, element_id) -> target
        self.exact_notes: dict[tuple[str, str], NoteTarget] = {}
        # Fallback Key: element_id -> target
        self.id_notes: dict[str, NoteTarget] = {}

    def register_document(self, doc_name: str, html_content: str | bytes) -> None:
        """Scan a document for potential footnote/endnote target elements with id or name."""
        soup = read_html(html_content)

        for el in soup.find_all(None, {"id": True}):
            self._register(doc_name, attribute(el, "id"), el)

        for el in soup.find_all("a", attrs={"name": True}):
            self._register(doc_name, attribute(el, "name"), named_element(el))

    def _register(self, doc_name: str, name: str, element: Tag) -> None:
        text = self._extract_clean_note_text(element)
        if text:
            target = NoteTarget(text, declares_note(element), can_be_note(element))
            self.exact_notes[(doc_name, name)] = target
            self.id_notes[name] = target

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

    def resolve_note(self, source_doc: str, href: str) -> str | None:
        """Resolve a link href to its target note text."""
        target = self.resolve_target(source_doc, href)
        return target.text if target else None

    def resolve_target(self, source_doc: str, href: str) -> NoteTarget | None:
        """The element that a link href names, or None."""
        key = self.resolve_key(source_doc, href)
        if key is not None:
            return self.exact_notes[key]

        # Fallback by fragment id alone, which names no document
        fragment = href.split("#", 1)[1] if "#" in href else ""
        return self.id_notes.get(fragment)

    def resolve_key(self, source_doc: str, href: str) -> tuple[str, str] | None:
        """The (document, element name) that a link href names, as the registry holds it, or None.

        A link that only the fragment id resolves gives None, because that match names no document. Code that has to
        know which document holds the note (`ingest/note_documents.py`, IN-07) needs the document to be certain.
        """
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
            normalized = f"{source_dir}/{target_doc}" if source_dir else target_doc
            # Try both normalized and raw filename
            for cand in (target_doc, normalized, target_doc.split("/")[-1]):
                if (cand, fragment) in self.exact_notes:
                    return (cand, fragment)

        # Direct exact match
        if (target_doc, fragment) in self.exact_notes:
            return (target_doc, fragment)

        return None


def relocate_chapter_footnotes(
    chapter_soup: BeautifulSoup, source_doc: str, registry: EndnoteRegistry
) -> list[tuple[str, str]]:
    """Find in-text note links in chapter_soup, replace them with [^n], and return list of (footnote_id, note_text).

    Returns [(footnote_id, note_text), ...] in order of appearance.

    A link that names no note stays in the chapter, so its words stay (IN-02). A note of this document that says that it
    is a note leaves the text of the chapter, because the chapter shows it as a footnote, as a reading system does.
    """
    resolved_notes: list[tuple[str, str]] = []
    seen_notes: dict[str, str] = {}  # note_key -> footnote_id
    note_counter = 1
    # The names of the elements of this document that became footnotes
    shown_as_footnotes: list[str] = []

    # Find all candidate <a> tags
    for a in chapter_soup.find_all("a", href=True):
        href = attribute(a, "href")
        # Skip external http(s) links or mailto
        if href.startswith(("http://", "https://", "mailto:")):
            continue

        # Check if this link points to a note in the registry
        note_text = None
        target = registry.resolve_target(source_doc, href)
        if target is not None:
            if is_note_reference(a, target):
                note_text = target.text
                name = href.partition("#")[2]
                if target.declared and registry.exact_notes.get((source_doc, name)) is target:
                    shown_as_footnotes.append(name)
        elif "#" in href and (says_note_reference(a) or is_superscript(a)):
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
            elif not is_superscript(a) and NOTE_MARK.fullmatch(a.get_text(strip=True)) is None:
                # A link with words, such as "see note 5", keeps its words before the marker
                a.insert_after(marker_text)
                a.unwrap()
            else:
                a.replace_with(marker_text)

    for name in shown_as_footnotes:
        element = chapter_soup.find("a", attrs={"name": name})
        element = named_element(element) if element is not None else chapter_soup.find(None, {"id": name})
        if element is not None and declares_note(element):
            element.decompose()

    return resolved_notes


def named_element(anchor: Tag) -> Tag:
    """The element that an `<a name>` names: the paragraph, item or box that holds it, or else the anchor itself."""
    return anchor.parent if anchor.parent and anchor.parent.name in ("p", "li", "div", "dd") else anchor


def kinds(element: Tag) -> set[str]:
    """The kinds that an element says it has, in `epub:type` and in `role`."""
    return {kind.lower() for attribute in ("epub:type", "role") for kind in str(element.get(attribute) or "").split()}


def declares_note(element: Tag) -> bool:
    """True when the element says that it is a note, or it is inside a note or a list of notes."""
    if kinds(element) & NOTE_KINDS:
        return True
    return any(kinds(parent) & (NOTE_KINDS | NOTE_LIST_KINDS) for parent in element.parents)


def can_be_note(element: Tag) -> bool:
    """True when the element is no heading or part of a book, such as a section, and holds no heading."""
    return element.name.lower() not in NOT_NOTES and element.find(re.compile(r"^h[1-6]$")) is None


def says_note_reference(link: Tag) -> bool:
    """True when a link says that it names a note: `epub:type="noteref"`, `role="doc-noteref"` or class `noteref`."""
    return bool(kinds(link) & NOTE_REFERENCE_KINDS) or "noteref" in (link.get("class") or [])


def is_superscript(link: Tag) -> bool:
    """True when a link is a superscript or holds one, as the mark of a note often is."""
    return link.find_parent("sup") is not None or link.find("sup") is not None


def is_note_reference(link: Tag, target: NoteTarget) -> bool:
    """True when a link names a note (IN-02).

    Its target must be able to be a note, and the link or its target says that it is a note, or the link looks like the
    mark of a note: a superscript, or a number or a sign such as `[1]` or `*`.
    """
    if not target.note_sized:
        return False
    if says_note_reference(link) or target.declared or is_superscript(link):
        return True
    return NOTE_MARK.fullmatch(link.get_text(strip=True)) is not None
