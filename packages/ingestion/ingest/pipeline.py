"""End-to-end ingestion pipeline orchestrator."""

from __future__ import annotations
import json
import posixpath
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import ebooklib
from ebooklib import epub

from ingest.models import BookMeta, BookSource, ChapterMeta, PracticeCard, TOCItem, InspectionalBlueprint, ScenarioCard
from ingest.assets import extract_epub_assets, normalize_image_markdown
from ingest.book_build import BookBuild
from ingest.chapter_shape import HeldOverBlocks, chapter_name, holds_no_text
from ingest.endnotes import EndnoteRegistry, relocate_chapter_footnotes
from ingest.ledger import keep_numbers_true
from ingest.anchors import inject_paragraph_anchors, extract_anchors, extract_inspectional_sampling, clean_preview_text
from ingest.elementary import compute_elementary_metrics
from ingest.salience import generate_chapter_practice_cards, generate_chapter_scenario_cards, format_practice_deck_markdown
from ingest.epub_parser import extract_metadata, parse_toc, html_to_markdown_blocks
from ingest.line_endings import read_html, write_text_file
from ingest.markdown_text import unescape_markdown_text
from ingest.pdf_parser import PDFParser
from ingest.places import read_book_text
from ingest.reimport import book_to_import
from ingest.toc_links import ImportedDocument, element_anchors, link_toc_to_chapters, without_entries_that_lead_nowhere


def ingest_epub(
    epub_path: Path,
    vault_dir: Path,
    custom_book_id: Optional[str] = None,
    replace: bool = False,
) -> BookMeta:
    """Ingest an EPUB file into vault/books/<book-id>/ and vault/notes/<book-id>/.

    A book that the vault already has is replaced only when `replace` is true (see `ingest.reimport`).
    """
    if not epub_path.exists():
        raise FileNotFoundError(f"Source EPUB not found: {epub_path}")

    # Read the EPUB archive
    book = epub.read_epub(str(epub_path))

    fallback_id = custom_book_id or epub_path.stem
    name_id, title, author, language = extract_metadata(book, fallback_id)

    # Stop before anything is written when the vault already has this book (DS-09), or another book has its id (IN-03)
    book_id, source = book_to_import(vault_dir, epub_path, name_id, custom_book_id or None, replace)
    # The chapters and paragraphs of the book before this import, so the reader's files can follow their text (IN-04)
    old_text = read_book_text(vault_dir / "books" / book_id)

    # 8. The book is built in a folder of its own. It goes into the vault with its practice deck, and the reader's files
    # follow its text, only when it is whole and checked (IN-05).
    build = BookBuild(vault_dir, book_id)
    try:
        book_meta, practice_deck_md = _build_epub_book(book, build.folder, book_id, title, author, language, source)
        build.put_in_vault(book_meta, practice_deck_md, old_text)
    finally:
        build.remove()

    # 9. Create user note template for first chapter if not existing
    first_ch_notes = vault_dir / "notes" / book_id / "ch-01-notes.md"
    if not first_ch_notes.exists():
        first_title = book_meta.spine[0].title if book_meta.spine else "Chapter 1"
        notes_template = (
            f"# Reflections: {title} - {first_title}\n\n"
            f"## Key Takeaways\n\n- \n\n"
            f"## Open Inquiries\n\n- \n"
        )
        write_text_file(first_ch_notes, notes_template)

    # The ledger keeps the numbers of a book it already knows, so they never say the numbers of an
    # older import (CQ-05)
    keep_numbers_true(vault_dir, book_meta.book_id, book_meta.total_chapters, book_meta.total_words)

    return book_meta


def _build_epub_book(
    book: epub.EpubBook, book_dir: Path, book_id: str, title: str, author: str, language: str, source: BookSource
) -> Tuple[BookMeta, str]:
    """Builds the chapters, the pictures and `_meta.json` of an EPUB book in `book_dir`, and gives its practice deck."""
    assets_dir = book_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

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
    all_scenarios: List[ScenarioCard] = []
    all_clean_text: List[str] = []
    total_words = 0
    chapter_index = 1
    # The chapter file and the paragraphs of each imported source document, for the links of the contents (CQ-01)
    imported_documents: Dict[str, ImportedDocument] = {}
    # A page that holds nothing but a title is no chapter, so its headings wait for the next one (CQ-04)
    held_over = HeldOverBlocks()

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
        # The text of the document with \n line endings only, also from a book made on Windows (IN-06)
        soup = read_html(html_bytes)

        # Skip empty / purely whitespace pages
        text_preview = soup.get_text(strip=True)
        if len(text_preview) < 20:
            continue

        # Relocate footnotes
        footnotes = relocate_chapter_footnotes(soup, item_name, registry)

        # Convert HTML to Markdown blocks, and note the block where each element starts
        element_blocks: Dict[str, int] = {}
        blocks = html_to_markdown_blocks(soup, element_blocks)
        if not blocks:
            continue

        # Normalize images in blocks
        normalized_blocks: List[str] = []
        for b in blocks:
            normalized_blocks.append(normalize_image_markdown(b, asset_map))

        # A page that holds nothing but a title is no chapter of its own: a reader would open it and find
        # nothing to read. Its headings wait for the chapter they introduce (CQ-04).
        if holds_no_text(normalized_blocks) and not footnotes:
            held_over.hold(normalized_blocks, item_name)
            continue

        # The headings of the pages that held no text go in front of this chapter. Its own blocks move down
        # by that many, so an element of its contents links still names its own block (CQ-04).
        if held_over.has_any():
            element_blocks = {name: block + held_over.shift() for name, block in element_blocks.items()}
            normalized_blocks = held_over.in_front_of(normalized_blocks)
            blocks = held_over.in_front_of(blocks)

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

        # The name of the chapter. It says what a reader who opens it reads, so a page that carries the title
        # of a division of the book and the first chapter after it is named after the chapter (CQ-04).
        # _meta.json holds the name as text (SEC-01).
        name = chapter_name(normalized_blocks[: len(blocks)])
        ch_title = unescape_markdown_text(name) if name else f"Chapter {chapter_index}"

        # Write chapter file: ch-01.md, ch-02.md, ...
        ch_id = f"ch-{chapter_index:02d}"
        ch_filename = f"{ch_id}.md"
        ch_path = book_dir / ch_filename
        write_text_file(ch_path, anchored_md)
        imported_documents[posixpath.normpath(item_name)] = ImportedDocument(
            chapter_file=ch_filename,
            element_anchors=element_anchors(normalized_blocks[: len(blocks)], element_blocks, anchored_md),
        )
        # A page that held no text has its heading at the top of this chapter, so its entry of the contents
        # opens the top of it: an element that a document does not name gets the top (CQ-04)
        for held_name in held_over.take_names():
            imported_documents[posixpath.normpath(held_name)] = ImportedDocument(chapter_file=ch_filename)

        # Determine first and last anchors
        anchors_list = extract_anchors(anchored_md)
        first_anchor = anchors_list[0][0] if anchors_list else None
        last_anchor = anchors_list[-1][0] if anchors_list else None

        # Extract inspectional sampling (head/tail anchors and clean previews)
        sampling = extract_inspectional_sampling(anchored_md)

        # Collect clean text for aggregate readability metrics
        clean_ch_text = clean_preview_text(anchored_md)
        if clean_ch_text:
            all_clean_text.append(clean_ch_text)

        ch_meta = ChapterMeta(
            id=ch_id,
            title=ch_title,
            file_path=ch_filename,
            order=chapter_index,
            word_count=words,
            anchor_count=anchor_count,
            first_anchor=first_anchor,
            last_anchor=last_anchor,
            footnotes_count=len(footnotes),
            inspectional_sampling=sampling,
        )
        spine_metas.append(ch_meta)

        # 5. Salience Scoring & Deterministic Cloze Deck
        chapter_cards = generate_chapter_practice_cards(ch_id, anchored_md, min_items=5, max_items=8)
        all_practice_cards.extend(chapter_cards)
        all_scenarios.extend(generate_chapter_scenario_cards(anchored_md, ch_id, max_items=3))

        chapter_index += 1

    # The contents open chapter files and paragraphs of the vault, not the source documents of the EPUB (CQ-01)
    link_toc_to_chapters(toc_items, imported_documents)
    # An entry that opens nothing at all does nothing for a reader, so it goes (CQ-04)
    toc_items = without_entries_that_lead_nowhere(toc_items)

    # Aggregate elementary metrics
    elementary_metrics = compute_elementary_metrics(" ".join(all_clean_text))

    # Construct default inspectional blueprint
    pivotal_chapters: List[str] = []
    if spine_metas:
        pivotal_chapters.append(spine_metas[0].id)
        if len(spine_metas) > 1:
            pivotal_chapters.append(spine_metas[-1].id)

    inspectional_blueprint = InspectionalBlueprint(
        front_matter={
            "has_preface": False,
            "preface_path": None,
            "publisher_blurb": f"{title} by {author}",
        },
        pivotal_chapters=pivotal_chapters,
        synthetic_index_clusters=[],
    )

    # 6. Save _meta.json
    book_meta = BookMeta(
        book_id=book_id,
        title=title,
        author=author,
        language=language,
        total_words=total_words,
        total_chapters=len(spine_metas),
        toc=toc_items,
        spine=spine_metas,
        source=source,
        elementary_metrics=elementary_metrics,
        inspectional_blueprint=inspectional_blueprint,
    )
    meta_path = book_dir / "_meta.json"
    write_text_file(meta_path, book_meta.model_dump_json(indent=2))

    # 7. The practice deck, which goes to vault/notes/<book-id>/practice-deck.md together with the book
    practice_deck_md = format_practice_deck_markdown(title, all_practice_cards, all_scenarios)
    return book_meta, practice_deck_md


def ingest_pdf(
    pdf_path: Path,
    vault_dir: Path,
    custom_book_id: Optional[str] = None,
    target_chapters: Optional[List[int]] = None,
    replace: bool = False,
) -> BookMeta:
    """Ingest a PDF file into vault/books/<book-id>/ and vault/notes/<book-id>/."""
    parser = PDFParser(pdf_path, vault_dir, custom_book_id)
    book_meta = parser.parse(target_chapters=target_chapters, replace=replace)
    # The ledger keeps the numbers of a book it already knows (CQ-05)
    keep_numbers_true(vault_dir, book_meta.book_id, book_meta.total_chapters, book_meta.total_words)
    return book_meta


def ingest_book(
    file_path: Path,
    vault_dir: Path,
    book_id: Optional[str] = None,
    target_chapters: Optional[List[int]] = None,
    replace: bool = False,
) -> BookMeta:
    """Entry point dispatching to appropriate ingestion handler based on file suffix.

    A book that the vault already has is replaced only when `replace` is true (see `ingest.reimport`).
    """
    suffix = file_path.suffix.lower()
    if suffix == ".epub":
        return ingest_epub(file_path, vault_dir, book_id, replace=replace)
    elif suffix == ".pdf":
        return ingest_pdf(file_path, vault_dir, book_id, target_chapters=target_chapters, replace=replace)
    else:
        raise NotImplementedError(f"Unsupported file format '{suffix}'. Only .epub and .pdf are currently implemented.")

