"""EPUB document parser and structure extractor."""

from __future__ import annotations

import re
from collections.abc import Iterable, Iterator
from typing import Any

from bs4 import BeautifulSoup, CData, Tag
from bs4.element import NavigableString, PageElement, PreformattedString
from ebooklib import epub

from ingest.book_id import book_id_of_name, plain_letters
from ingest.chapter_shape import CHAPTER_TITLE, DIVISION_TITLE
from ingest.markdown_text import escape_heading_mark, escape_markdown_text
from ingest.models import TOCItem


def extract_metadata(book: epub.EpubBook, fallback_id: str) -> tuple[str, str, str, str]:
    """Extract (book_id, title, author, language) from EPUB metadata."""
    title_meta = book.get_metadata("DC", "title")
    title = title_meta[0][0] if title_meta else fallback_id.replace("-", " ").title()

    creator_meta = book.get_metadata("DC", "creator")
    author = creator_meta[0][0] if creator_meta else "Unknown Author"

    lang_meta = book.get_metadata("DC", "language")
    language = lang_meta[0][0] if lang_meta else "en"

    id_meta = book.get_metadata("DC", "identifier")
    book_id = fallback_id or (id_meta[0][0] if id_meta else "book")
    # Sanitize book_id: letters with marks become plain letters, and a name in another script gets a code (IN-03)
    safe_book_id = re.sub(r"[^a-zA-Z0-9_-]", "-", plain_letters(book_id)).strip("-").lower()
    return book_id_of_name(safe_book_id, book_id), title, author, language


def normalize_toc_hierarchy(items: list[TOCItem]) -> list[TOCItem]:
    """Structure flat or semi-flat TOC lists into hierarchical Books/Parts -> Chapters -> Sections.

    A division and a chapter are the same thing here as in a chapter file, so both rules live in
    `ingest.chapter_shape` (CQ-04).
    """
    book_part_pattern = DIVISION_TITLE
    chapter_pattern = CHAPTER_TITLE

    has_books = any(book_part_pattern.match(it.title.strip()) for it in items)
    has_chapters = any(chapter_pattern.match(it.title.strip()) for it in items)

    if not (has_books and has_chapters):
        return items

    normalized: list[TOCItem] = []
    current_book: TOCItem | None = None

    for it in items:
        title = it.title.strip()
        is_book = bool(book_part_pattern.match(title))
        is_chapter = bool(chapter_pattern.match(title))

        if is_book:
            current_book = TOCItem(id=it.id, title=it.title, href=it.href, level=1, subitems=list(it.subitems))
            for s in current_book.subitems:
                s.level = 2
                for ss in s.subitems:
                    ss.level = 3
            normalized.append(current_book)
        elif is_chapter and current_book is not None:
            ch_copy = TOCItem(id=it.id, title=it.title, href=it.href, level=2, subitems=list(it.subitems))
            for s in ch_copy.subitems:
                s.level = 3
                for ss in s.subitems:
                    ss.level = 4
            current_book.subitems.append(ch_copy)
        else:
            if (
                current_book is not None
                and not is_chapter
                and not is_book
                and "license" not in title.lower()
                and "gutenberg" not in title.lower()
            ):
                ch_copy = TOCItem(id=it.id, title=it.title, href=it.href, level=2, subitems=list(it.subitems))
                for s in ch_copy.subitems:
                    s.level = 3
                current_book.subitems.append(ch_copy)
            else:
                current_book = None
                it.level = 1
                normalized.append(it)

    return normalized


def parse_toc(toc_list: Any, level: int = 1) -> list[TOCItem]:
    """Recursively parse ebooklib's book.toc into hierarchical TOCItem list."""
    items: list[TOCItem] = []
    if not toc_list:
        return items

    for entry in toc_list:
        if isinstance(entry, (tuple, list)):
            # Form: (parent_link_or_section, [subitems])
            parent = entry[0]
            children_raw = entry[1] if len(entry) > 1 else []
            subitems = parse_toc(children_raw, level + 1)

            if isinstance(parent, epub.Link):
                items.append(
                    TOCItem(
                        id=parent.uid or parent.href.replace(".", "_"),
                        title=parent.title,
                        href=parent.href,
                        level=level,
                        subitems=subitems,
                    )
                )
            elif isinstance(parent, epub.Section):
                items.append(
                    TOCItem(
                        id=parent.href.replace(".", "_") if parent.href else f"sec_{len(items)}",
                        title=parent.title,
                        href=parent.href or "",
                        level=level,
                        subitems=subitems,
                    )
                )
        elif isinstance(entry, epub.Link):
            items.append(
                TOCItem(
                    id=entry.uid or entry.href.replace(".", "_"),
                    title=entry.title,
                    href=entry.href,
                    level=level,
                    subitems=[],
                )
            )
        elif isinstance(entry, epub.Section):
            items.append(
                TOCItem(
                    id=entry.href.replace(".", "_") if entry.href else f"sec_{len(items)}",
                    title=entry.title,
                    href=entry.href or "",
                    level=level,
                    subitems=[],
                )
            )

    if level == 1:
        return normalize_toc_hierarchy(items)

    return items


# Elements that hold no text of the book: the head of a document, scripts, styles and templates, and the navigation of
# the book, which the contents of the reader replace
SKIPPED_TAGS = {"head", "script", "style", "template", "nav"}
# Project Gutenberg marks its own header and its license with this class. They are no text of the book, so the import
# leaves them out, as the owner chose (IN-02).
BOILERPLATE_CLASSES = {"pg-boilerplate"}
# Elements that a browser shows as blocks, so that their text never runs into the text around them (IN-02)
BLOCK_TAGS = {
    "address",
    "article",
    "aside",
    "blockquote",
    "body",
    "caption",
    "center",
    "dd",
    "details",
    "dialog",
    "div",
    "dl",
    "dt",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hgroup",
    "hr",
    "li",
    "main",
    "menu",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "summary",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul",
}
HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
# While inline text is written, a `<br>` is LINE_BREAK, and the edge of a block inside the text, such as a paragraph of
# a list item, is BLOCK_EDGE. Book text holds neither, because each run of its whitespace becomes one space.
LINE_BREAK = "\n"
BLOCK_EDGE = "\x1f"


def html_to_markdown_blocks(soup: BeautifulSoup, element_blocks: dict[str, int] | None = None) -> list[str]:
    """Convert HTML content into a list of clean Markdown blocks (paragraphs, headers, etc.).

    With `element_blocks`, it also notes the block where each element with an id, or an `<a name>`, starts, because
    the links of the contents name such elements (CQ-01). An element that makes no block starts at the next block.

    Every text that a browser shows is written, in any layout (IN-02). Text and inline elements between two blocks make
    a paragraph, a container such as `<aside>` or `<figure>` gives the blocks inside it, and a `<br>` is a line break. A
    paragraph is one line: a line break of the book text is a space, as a browser shows it.
    """
    writer = _BlockWriter(element_blocks)
    writer.add_blocks_of(soup.body if soup.body else soup)
    return writer.blocks


class _BlockWriter:
    """Writes the Markdown blocks of HTML elements, and notes the block where each element starts."""

    def __init__(self, element_blocks: dict[str, int] | None) -> None:
        self.blocks: list[str] = []
        self.element_blocks = element_blocks

    def note_starts(self, element: Tag, with_inner_elements: bool) -> None:
        if self.element_blocks is not None:
            _note_element_starts(element, len(self.blocks), self.element_blocks, with_inner_elements)

    def add_blocks_of(self, container: Tag) -> None:
        """Adds the blocks of the content of `container`. Text and inline elements between two blocks make a
        paragraph."""
        run: list[PageElement] = []
        for child in container.children:
            if isinstance(child, Tag) and _is_block(child):
                self.add_paragraph(run)
                run = []
                self.add_block(child)
            else:
                if isinstance(child, Tag):
                    self.note_starts(child, with_inner_elements=True)
                run.append(child)
        self.add_paragraph(run)

    def add_text(self, block: str) -> None:
        """Adds a block of book text, with no line that Markdown would read as a heading (IN-08).

        A heading gets no paragraph anchor, so a paragraph that Markdown read as one could not be
        searched, cited or marked. Preformatted text is written by `_preformatted_block`, which keeps
        every character of the book, and a heading of the book is written as a heading below.
        """
        self.blocks.append(escape_heading_mark(block))

    def add_paragraph(self, nodes: Iterable[PageElement]) -> None:
        text = _inline_text(nodes, "<br>")
        if text:
            self.add_text(text)

    def add_block(self, element: Tag) -> None:
        name = element.name.lower()
        if _is_skipped(element):
            self.note_starts(element, with_inner_elements=True)
            return

        if name in HEADINGS:
            self.note_starts(element, with_inner_elements=True)
            # Headings, on one line: a line break in a heading cut the chapter title, such as "CHAPTER I.", and
            # the reader showed the heading as a paragraph with its marks (CQ-01)
            h_text = re.sub(r"\s+", " ", _inline_text(element.children, " ")).strip()
            if h_text:
                self.blocks.append(f"{'#' * int(name[1])} {h_text}")

        # A term of a definition list: a paragraph in bold, before the blocks of its definition
        elif name == "dt":
            self.note_starts(element, with_inner_elements=True)
            term = _inline_text(element.children, "<br>")
            if term:
                self.add_text(term if "**" in term else f"**{term}**")

        # Blockquotes
        elif name == "blockquote":
            self.note_starts(element, with_inner_elements=True)
            self.add_quote(element)

        # Lists
        elif name in ("ul", "ol"):
            self.note_starts(element, with_inner_elements=True)
            list_lines = _list_lines(element, "")
            if list_lines:
                self.add_text("\n".join(list_lines))

        # Tables
        elif name == "table":
            self.note_starts(element, with_inner_elements=True)
            self.add_table(element)

        # Preformatted text, such as code
        elif name == "pre":
            self.note_starts(element, with_inner_elements=True)
            pre_block = _preformatted_block(element)
            if pre_block:
                self.blocks.append(pre_block)

        # A line across the page holds no text
        elif name == "hr":
            self.note_starts(element, with_inner_elements=True)

        # Paragraphs, and containers such as <div>, <section>, <aside>, <figure>, <header> and <dd>: their blocks
        else:
            self.note_starts(element, with_inner_elements=False)
            self.add_blocks_of(element)

    def add_quote(self, quote: Tag) -> None:
        """Adds a quote as one block: each line of the blocks inside it after `> `, and a line `>` between two
        blocks."""
        inner = _BlockWriter(None)
        inner.add_blocks_of(quote)
        lines: list[str] = []
        for block in inner.blocks:
            if lines:
                lines.append(">")
            lines.extend(f"> {line}" for line in block.split("\n"))
        if lines:
            self.blocks.append("\n".join(lines))

    def add_table(self, table: Tag) -> None:
        """Adds a table: its caption as a paragraph, and a block with one line of cells for each row."""
        caption = table.find("caption", recursive=False)
        if caption is not None:
            self.add_paragraph(caption.children)
        rows: list[str] = []
        for tr in table.find_all("tr"):
            cells = [_inline_text(cell.children, "<br>") for cell in tr.find_all(["td", "th"])]
            if any(cells):
                rows.append(" | ".join(cells))
        if rows:
            self.add_text("\n".join(rows))


def _note_element_starts(element: Tag, block: int, element_blocks: dict[str, int], with_inner_elements: bool) -> None:
    """Notes `block` as the start of `element`, and with `with_inner_elements` of every element inside it."""
    for el in [element, *element.find_all(True)] if with_inner_elements else [element]:
        name = el.get("id") or (el.get("name") if el.name == "a" else None)
        if name:
            element_blocks.setdefault(str(name), block)


def _is_block(element: Tag) -> bool:
    """True for an element that a browser shows as a block, and for an element that holds one, such as a `<span>`
    around two paragraphs."""
    return _is_block_tag(element) or element.find(_is_block_tag) is not None


def _is_block_tag(element: Tag) -> bool:
    return element.name.lower() in BLOCK_TAGS


def _is_skipped(element: Tag) -> bool:
    """True for an element that holds no text of the book (SKIPPED_TAGS and BOILERPLATE_CLASSES)."""
    return element.name.lower() in SKIPPED_TAGS or not BOILERPLATE_CLASSES.isdisjoint(element.get("class") or [])


def _is_book_text(node: PageElement) -> bool:
    """True for text of the book, and False for a comment, a declaration or a processing instruction of its file."""
    return isinstance(node, NavigableString) and (isinstance(node, CData) or not isinstance(node, PreformattedString))


def _list_lines(element: Tag, indent: str) -> list[str]:
    """The lines of a list: `- ` or `1. ` and the text of each item, and below it the items of its inner lists,
    indented.

    An item keeps its own `#` mark, because Markdown reads a heading inside a list item too (IN-08).
    """
    ordered = element.name.lower() == "ol"
    lines: list[str] = []
    for number, item in enumerate(element.find_all("li", recursive=False), start=1):
        marker = f"{number}." if ordered else "-"
        text_nodes: list[PageElement] = []
        inner_lists: list[Tag] = []
        for child in item.children:
            if isinstance(child, Tag) and child.name.lower() in ("ul", "ol"):
                inner_lists.append(child)
            else:
                text_nodes.append(child)
        li_text = escape_heading_mark(_inline_text(text_nodes, "<br>"))
        if li_text:
            lines.append(f"{indent}{marker} {li_text}")
        for inner_list in inner_lists:
            lines.extend(_list_lines(inner_list, indent + " " * (len(marker) + 1)))
    return lines


def _preformatted_block(pre: Tag) -> str | None:
    """Preformatted text, such as code, as a `<pre>` block with the lines and the spaces of the book (IN-02).

    The reader reads Markdown marks in every block, so `*`, a backtick, `[` and a `#` that starts a line are written as
    character references, like `<` and `&` (SEC-01). A blank line ends a block of a chapter file, so each blank line is
    a `&#10;` at the end of the line before it.
    """
    lines = [line.rstrip() for line in "".join(_preformatted_text(pre)).split("\n")]
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    if not lines:
        return None
    text = escape_markdown_text("\n".join(lines))
    text = text.replace("*", "&#42;").replace("`", "&#96;").replace("[", "&#91;")
    text = re.sub(r"^#", "&#35;", text, flags=re.MULTILINE)
    return "<pre>" + re.sub(r"\n(?=\n)", "&#10;", text) + "</pre>"


def _preformatted_text(element: Tag) -> Iterator[str]:
    """The text of a preformatted element as the book has it, with a line break for each `<br>`."""
    for child in element.children:
        if isinstance(child, Tag):
            name = child.name.lower()
            if name == "br":
                yield "\n"
            elif not _is_skipped(child):
                yield from _preformatted_text(child)
        elif _is_book_text(child):
            yield str(child)


def _inline_text(nodes: Iterable[PageElement], line_break: str) -> str:
    """The inline Markdown of `nodes` on one line, with `line_break` for each `<br>`.

    A run of whitespace is one space, as a browser shows it, and the edge of a block inside the text, such as between
    two paragraphs of a list item, is a space too, so that words never run together (IN-02).
    """
    text = "".join(_render_inline(node) for node in nodes).replace(BLOCK_EDGE, " ")
    text = re.sub(r" ?\n ?", LINE_BREAK, re.sub(r" {2,}", " ", text)).strip()
    return text.replace(LINE_BREAK, line_break)


def _render_inline(node: PageElement) -> str:
    """Render inline HTML tags to Markdown formatting. Text that looks like HTML is written as text (SEC-01)."""
    if not isinstance(node, Tag):
        if not _is_book_text(node):
            # A comment of the book file is no text of the book
            return ""
        return escape_markdown_text(re.sub(r"[ \t\n\r\f\x1f]+", " ", str(node)))

    name = node.name.lower()
    if _is_skipped(node):
        return ""
    if name == "br":
        return LINE_BREAK
    if name == "img":
        alt = escape_markdown_text(str(node.get("alt", "")))
        src = node.get("src", "")
        return f"![{alt}]({src})" if src else ""

    inner = "".join(_render_inline(child) for child in node.children)
    if name in ("strong", "b"):
        return _marked(inner, "**")
    if name in ("em", "i"):
        return _marked(inner, "*")
    if name == "code":
        return _marked(inner, "`")
    if name in BLOCK_TAGS:
        return f"{BLOCK_EDGE}{inner}{BLOCK_EDGE}"
    return inner


def _marked(inner: str, mark: str) -> str:
    """`inner` between two marks, such as `**` for bold. The spaces and line breaks at its edges stay outside the marks,
    so that the words around it stay apart."""
    core = inner.strip()
    if not core:
        return inner
    start = len(inner) - len(inner.lstrip())
    return f"{inner[:start]}{mark}{core}{mark}{inner[start + len(core) :]}"
