"""End-to-end ingestion pipeline orchestrator."""

from __future__ import annotations
import json
import posixpath
import re
from pathlib import Path
from typing import Dict, List, Optional
from bs4 import BeautifulSoup
import ebooklib
from ebooklib import epub

from ingest.models import BookMeta, ChapterMeta, PracticeCard, TOCItem, InspectionalBlueprint, ScenarioCard
from ingest.assets import extract_epub_assets, normalize_image_markdown
from ingest.endnotes import EndnoteRegistry, relocate_chapter_footnotes
from ingest.anchors import inject_paragraph_anchors, extract_anchors, extract_inspectional_sampling, clean_preview_text
from ingest.elementary import compute_elementary_metrics
from ingest.salience import generate_chapter_practice_cards, generate_chapter_scenario_cards, format_practice_deck_markdown
from ingest.epub_parser import extract_metadata, parse_toc, html_to_markdown_blocks
from ingest.markdown_text import unescape_markdown_text
from ingest.pdf_parser import PDFParser
from ingest.reimport import check_book_can_be_imported
from ingest.toc_links import ImportedDocument, element_anchors, link_toc_to_chapters


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
    book_id, title, author, language = extract_metadata(book, fallback_id)
    if custom_book_id:
        book_id = custom_book_id

    # Stop before anything is written when the vault already has this book (DS-09)
    check_book_can_be_imported(vault_dir, book_id, replace)

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
    all_scenarios: List[ScenarioCard] = []
    all_clean_text: List[str] = []
    total_words = 0
    chapter_index = 1
    # The chapter file and the paragraphs of each imported source document, for the links of the contents (CQ-01)
    imported_documents: Dict[str, ImportedDocument] = {}

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

        # Convert HTML to Markdown blocks, and note the block where each element starts
        element_blocks: Dict[str, int] = {}
        blocks = html_to_markdown_blocks(soup, element_blocks)
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

        # Determine chapter title from heading or metadata. _meta.json holds the title as text (SEC-01).
        ch_title_match = re.search(r"^#{1,3}\s+(.+)$", anchored_md, re.MULTILINE)
        ch_title = unescape_markdown_text(ch_title_match.group(1).strip()) if ch_title_match else f"Chapter {chapter_index}"

        # Write chapter file: ch-01.md, ch-02.md, ...
        ch_id = f"ch-{chapter_index:02d}"
        ch_filename = f"{ch_id}.md"
        ch_path = book_dir / ch_filename
        ch_path.write_text(anchored_md, encoding="utf-8")
        imported_documents[posixpath.normpath(item_name)] = ImportedDocument(
            chapter_file=ch_filename,
            element_anchors=element_anchors(normalized_blocks[: len(blocks)], element_blocks, anchored_md),
        )

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
        elementary_metrics=elementary_metrics,
        inspectional_blueprint=inspectional_blueprint,
    )
    meta_path = book_dir / "_meta.json"
    meta_path.write_text(book_meta.model_dump_json(indent=2), encoding="utf-8")

    # 7. Save vault/notes/<book-id>/practice-deck.md
    practice_deck_md = format_practice_deck_markdown(title, all_practice_cards, all_scenarios)
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


def ingest_pdf(
    pdf_path: Path,
    vault_dir: Path,
    custom_book_id: Optional[str] = None,
    target_chapters: Optional[List[int]] = None,
    replace: bool = False,
) -> BookMeta:
    """Ingest a PDF file into vault/books/<book-id>/ and vault/notes/<book-id>/."""
    parser = PDFParser(pdf_path, vault_dir, custom_book_id)
    return parser.parse(target_chapters=target_chapters, replace=replace)


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

