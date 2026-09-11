"""EPUB document parser and structure extractor."""

from __future__ import annotations
import re
from pathlib import Path
from typing import Any, List, Optional, Tuple
from bs4 import BeautifulSoup, NavigableString, Tag
import ebooklib
from ebooklib import epub

from ingest.models import TOCItem


def extract_metadata(book: epub.EpubBook, fallback_id: str) -> Tuple[str, str, str, str]:
    """Extract (book_id, title, author, language) from EPUB metadata."""
    title_meta = book.get_metadata("DC", "title")
    title = title_meta[0][0] if title_meta else fallback_id.replace("-", " ").title()

    creator_meta = book.get_metadata("DC", "creator")
    author = creator_meta[0][0] if creator_meta else "Unknown Author"

    lang_meta = book.get_metadata("DC", "language")
    language = lang_meta[0][0] if lang_meta else "en"

    id_meta = book.get_metadata("DC", "identifier")
    book_id = fallback_id or (id_meta[0][0] if id_meta else "book")
    # Sanitize book_id
    safe_book_id = re.sub(r"[^a-zA-Z0-9_-]", "-", book_id).strip("-").lower()
    if not safe_book_id:
        safe_book_id = "sample"

    return safe_book_id, title, author, language


def normalize_toc_hierarchy(items: List[TOCItem]) -> List[TOCItem]:
    """Structure flat or semi-flat TOC lists into hierarchical Books/Parts -> Chapters -> Sections."""
    book_part_pattern = re.compile(r"^(?:BOOK|PART|VOLUME)\s+([IVXLCDM\d]+)", re.IGNORECASE)
    chapter_pattern = re.compile(r"^(?:CHAPTER|CHAP\.)\s+([IVXLCDM\d]+)", re.IGNORECASE)

    has_books = any(book_part_pattern.match(it.title.strip()) for it in items)
    has_chapters = any(chapter_pattern.match(it.title.strip()) for it in items)

    if not (has_books and has_chapters):
        return items

    normalized: List[TOCItem] = []
    current_book: Optional[TOCItem] = None

    for it in items:
        title = it.title.strip()
        is_book = bool(book_part_pattern.match(title))
        is_chapter = bool(chapter_pattern.match(title))

        if is_book:
            current_book = TOCItem(
                id=it.id,
                title=it.title,
                href=it.href,
                level=1,
                subitems=list(it.subitems)
            )
            for s in current_book.subitems:
                s.level = 2
                for ss in s.subitems:
                    ss.level = 3
            normalized.append(current_book)
        elif is_chapter and current_book is not None:
            ch_copy = TOCItem(
                id=it.id,
                title=it.title,
                href=it.href,
                level=2,
                subitems=list(it.subitems)
            )
            for s in ch_copy.subitems:
                s.level = 3
                for ss in s.subitems:
                    ss.level = 4
            current_book.subitems.append(ch_copy)
        else:
            if current_book is not None and not is_chapter and not is_book and "license" not in title.lower() and "gutenberg" not in title.lower():
                ch_copy = TOCItem(
                    id=it.id,
                    title=it.title,
                    href=it.href,
                    level=2,
                    subitems=list(it.subitems)
                )
                for s in ch_copy.subitems:
                    s.level = 3
                current_book.subitems.append(ch_copy)
            else:
                current_book = None
                it.level = 1
                normalized.append(it)

    return normalized


def parse_toc(toc_list: Any, level: int = 1) -> List[TOCItem]:
    """Recursively parse ebooklib's book.toc into hierarchical TOCItem list."""
    items: List[TOCItem] = []
    if not toc_list:
        return items

    for entry in toc_list:
        if isinstance(entry, tuple) or isinstance(entry, list):
            # Form: (parent_link_or_section, [subitems])
            parent = entry[0]
            children_raw = entry[1] if len(entry) > 1 else []
            subitems = parse_toc(children_raw, level + 1)

            if isinstance(parent, epub.Link):
                items.append(TOCItem(
                    id=parent.uid or parent.href.replace(".", "_"),
                    title=parent.title,
                    href=parent.href,
                    level=level,
                    subitems=subitems
                ))
            elif isinstance(parent, epub.Section):
                items.append(TOCItem(
                    id=parent.href.replace(".", "_") if parent.href else f"sec_{len(items)}",
                    title=parent.title,
                    href=parent.href or "",
                    level=level,
                    subitems=subitems
                ))
        elif isinstance(entry, epub.Link):
            items.append(TOCItem(
                id=entry.uid or entry.href.replace(".", "_"),
                title=entry.title,
                href=entry.href,
                level=level,
                subitems=[]
            ))
        elif isinstance(entry, epub.Section):
            items.append(TOCItem(
                id=entry.href.replace(".", "_") if entry.href else f"sec_{len(items)}",
                title=entry.title,
                href=entry.href or "",
                level=level,
                subitems=[]
            ))

    if level == 1:
        return normalize_toc_hierarchy(items)

    return items


BLOCK_CONTAINERS = {"div", "section", "article", "main", "body"}
BLOCK_ELEMENTS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "table", "pre", "div", "section", "article"}


def html_to_markdown_blocks(soup: BeautifulSoup) -> List[str]:
    """Convert HTML content into a list of clean Markdown blocks (paragraphs, headers, etc.)."""
    blocks: List[str] = []
    root = soup.body if soup.body else soup

    def process_node(node: Tag | NavigableString) -> None:
        if isinstance(node, NavigableString):
            text = str(node).strip()
            if text:
                blocks.append(text)
            return

        for child in node.children:
            if isinstance(child, NavigableString):
                text = str(child).strip()
                if text:
                    blocks.append(text)
                continue

            if not isinstance(child, Tag):
                continue

            tag_name = child.name.lower()

            # Headings
            if tag_name in ("h1", "h2", "h3", "h4", "h5", "h6"):
                level = int(tag_name[1])
                h_text = _render_inline(child).strip()
                if h_text:
                    blocks.append(f"{'#' * level} {h_text}")

            # Containers: recurse if contains block elements, else treat as single block
            elif tag_name in BLOCK_CONTAINERS:
                has_child_blocks = any(isinstance(c, Tag) and c.name.lower() in BLOCK_ELEMENTS for c in child.children)
                if has_child_blocks:
                    process_node(child)
                else:
                    text = _render_inline(child).strip()
                    if text:
                        blocks.append(text)

            # Paragraphs
            elif tag_name == "p":
                p_text = _render_inline(child).strip()
                if p_text:
                    blocks.append(p_text)

            # Blockquotes
            elif tag_name == "blockquote":
                b_text = _render_inline(child).strip()
                if b_text:
                    quoted = "\n".join(f"> {line}" for line in b_text.splitlines() if line.strip())
                    blocks.append(quoted)

            # Lists
            elif tag_name in ("ul", "ol"):
                list_items: List[str] = []
                is_ordered = (tag_name == "ol")
                for idx, li in enumerate(child.find_all("li", recursive=False), start=1):
                    li_text = _render_inline(li).strip()
                    if li_text:
                        prefix = f"{idx}." if is_ordered else "-"
                        list_items.append(f"{prefix} {li_text}")
                if list_items:
                    blocks.append("\n".join(list_items))

            # Tables
            elif tag_name == "table":
                rows: List[str] = []
                for tr in child.find_all("tr"):
                    cells = [_render_inline(td).strip() for td in tr.find_all(["td", "th"])]
                    if any(cells):
                        rows.append(" | ".join(cells))
                if rows:
                    blocks.append("\n".join(rows))

            # Standalone Images
            elif tag_name == "img":
                alt = child.get("alt", "")
                src = child.get("src", "")
                if src:
                    blocks.append(f"![{alt}]({src})")

    process_node(root)
    return blocks


def _render_inline(element: Tag | NavigableString) -> str:
    """Render inline HTML tags to Markdown formatting."""
    if isinstance(element, NavigableString):
        return str(element)

    out: List[str] = []
    for child in element.children:
        if isinstance(child, NavigableString):
            out.append(str(child))
        elif isinstance(child, Tag):
            name = child.name.lower()
            inner = _render_inline(child)
            if name in ("strong", "b"):
                out.append(f"**{inner.strip()}**" if inner.strip() else "")
            elif name in ("em", "i"):
                out.append(f"*{inner.strip()}*" if inner.strip() else "")
            elif name == "code":
                out.append(f"`{inner.strip()}`" if inner.strip() else "")
            elif name == "img":
                alt = child.get("alt", "")
                src = child.get("src", "")
                out.append(f"![{alt}]({src})" if src else "")
            else:
                out.append(inner)

    # Normalize whitespace
    raw_text = "".join(out)
    clean_text = re.sub(r"[ \t]+", " ", raw_text)
    return clean_text
