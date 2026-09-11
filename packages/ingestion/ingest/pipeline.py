"""End-to-end ingestion pipeline orchestrator."""

from __future__ import annotations
import json
import re
from pathlib import Path
from typing import List, Optional
from bs4 import BeautifulSoup
import ebooklib
from ebooklib import epub

from ingest.models import BookMeta, ChapterMeta, PracticeCard, TOCItem
from ingest.assets import extract_epub_assets, normalize_image_markdown
from ingest.endnotes import EndnoteRegistry, relocate_chapter_footnotes
from ingest.anchors import inject_paragraph_anchors, extract_anchors
from ingest.salience import generate_chapter_practice_cards, format_practice_deck_markdown
from ingest.epub_parser import extract_metadata, parse_toc, html_to_markdown_blocks


def ingest_epub(epub_path: Path, vault_dir: Path, custom_book_id: Optional[str] = None) -> BookMeta:
    """Ingest an EPUB file into vault/books/<book-id>/ and vault/notes/<book-id>/."""
    if not epub_path.exists():
        raise FileNotFoundError(f"Source EPUB not found: {epub_path}")

    # Read the EPUB archive
    book = epub.read_epub(str(epub_path))

    fallback_id = custom_book_id or epub_path.stem
    book_id, title, author, language = extract_metadata(book, fallback_id)
    if custom_book_id:
        book_id = custom_book_id

    # Vault destinations
    book_dir = vault_dir / "books" / book_id
    assets_dir = book_dir / "assets"
    notes_dir = vault_dir / "notes" / book_id

    book_dir.mkdir(parents=True, exist_ok=True)
    assets_dir.mkdir(parents=True, exist_ok=True)
    notes_dir.mkdir(parents=True, exist_ok=True)

    # 1. Asset Extraction
    asset_map = extract_epub_assets(book, assets_dir)

    # 2. Build Endnote Registry across all documents
    registry = EndnoteRegistry()
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        registry.register_document(item.get_name(), item.get_content())

    # 3. Parse Table of Contents
    toc_items = parse_toc(book.toc)
    if not toc_items:
        # Fallback: create single-level TOC from spine
        toc_items = []

    # 4. Process Chapter Documents
    spine_metas: List[ChapterMeta] = []
    all_practice_cards: List[PracticeCard] = []
    total_words = 0
    chapter_index = 1

    # Detect dedicated endnote files to avoid emitting them as separate empty chapters
    endnote_file_patterns = re.compile(r"(?:endnotes?|backmatter|footnotes?|notes)\.x?html?$", re.IGNORECASE)

    for item_entry in book.spine:
        item_id = item_entry[0] if isinstance(item_entry, (tuple, list)) else item_entry
        item = book.get_item_with_id(item_id)
        if not item or item.get_type() != ebooklib.ITEM_DOCUMENT:
            continue

        item_name = item.get_name()

        # Check if this item is a dedicated endnote file that was already relocated
        if endnote_file_patterns.search(item_name):
            continue

        html_bytes = item.get_content()
        soup = BeautifulSoup(html_bytes, "html.parser")

        # Skip empty / purely whitespace pages
        text_preview = soup.get_text(strip=True)
        if len(text_preview) < 20:
            continue

        # Relocate footnotes
        footnotes = relocate_chapter_footnotes(soup, item_name, registry)

        # Convert HTML to Markdown blocks
        blocks = html_to_markdown_blocks(soup)
        if not blocks:
            continue

        # Normalize images in blocks
        normalized_blocks: List[str] = []
        for b in blocks:
            normalized_blocks.append(normalize_image_markdown(b, asset_map))

        # Append relocated footnotes as anchored definitions at the end
        for fn_id, note_text in footnotes:
            normalized_blocks.append(f"[^{fn_id}]: {note_text}")

        # Combine blocks into chapter raw markdown
        raw_markdown = "\n\n".join(normalized_blocks)

        # Invert anchors: Inject deterministic ^p-001, ^p-002...
        anchored_md, anchor_count = inject_paragraph_anchors(raw_markdown, start_index=1)

        # Compute word count
        words = len(re.findall(r"\b\w+\b", anchored_md))
        total_words += words

        # Determine chapter title from heading or metadata
        ch_title_match = re.search(r"^#{1,3}\s+(.+)$", anchored_md, re.MULTILINE)
        ch_title = ch_title_match.group(1).strip() if ch_title_match else f"Chapter {chapter_index}"

        # Write chapter file: ch-01.md, ch-02.md, ...
        ch_id = f"ch-{chapter_index:02d}"
        ch_filename = f"{ch_id}.md"
        ch_path = book_dir / ch_filename
        ch_path.write_text(anchored_md, encoding="utf-8")

        # Determine first and last anchors
        anchors_list = extract_anchors(anchored_md)
        first_anchor = anchors_list[0][0] if anchors_list else None
        last_anchor = anchors_list[-1][0] if anchors_list else None

        ch_meta = ChapterMeta(
            id=ch_id,
            title=ch_title,
            file_path=ch_filename,
            order=chapter_index,
            word_count=words,
            anchor_count=anchor_count,
            first_anchor=first_anchor,
            last_anchor=last_anchor,
            footnotes_count=len(footnotes)
        )
        spine_metas.append(ch_meta)

        # 5. Salience Scoring & Deterministic Cloze Deck
        chapter_cards = generate_chapter_practice_cards(ch_id, anchored_md, min_items=5, max_items=8)
        all_practice_cards.extend(chapter_cards)

        chapter_index += 1

    # 6. Save _meta.json
    book_meta = BookMeta(
        book_id=book_id,
        title=title,
        author=author,
        language=language,
        total_words=total_words,
        total_chapters=len(spine_metas),
        toc=toc_items,
        spine=spine_metas
    )
    meta_path = book_dir / "_meta.json"
    meta_path.write_text(book_meta.model_dump_json(indent=2), encoding="utf-8")

    # 7. Save vault/notes/<book-id>/practice-deck.md
    practice_deck_md = format_practice_deck_markdown(title, all_practice_cards)
    practice_deck_path = notes_dir / "practice-deck.md"
    practice_deck_path.write_text(practice_deck_md, encoding="utf-8")

    # 8. Create user note template for first chapter if not existing
    first_ch_notes = notes_dir / "ch-01-notes.md"
    if not first_ch_notes.exists():
        first_title = spine_metas[0].title if spine_metas else "Chapter 1"
        notes_template = (
            f"# Reflections: {title} - {first_title}\n\n"
            f"## Key Takeaways\n\n- \n\n"
            f"## Open Inquiries\n\n- \n"
        )
        first_ch_notes.write_text(notes_template, encoding="utf-8")

    return book_meta


def ingest_book(file_path: Path, vault_dir: Path, book_id: Optional[str] = None) -> BookMeta:
    """Entry point dispatching to appropriate ingestion handler based on file suffix."""
    suffix = file_path.suffix.lower()
    if suffix == ".epub":
        return ingest_epub(file_path, vault_dir, book_id)
    else:
        raise NotImplementedError(f"Unsupported file format '{suffix}'. Only .epub is currently implemented.")
