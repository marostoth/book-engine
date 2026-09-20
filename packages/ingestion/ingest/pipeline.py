"""End-to-end ingestion pipeline orchestrator."""

from __future__ import annotations

import posixpath
import re
from pathlib import Path

import ebooklib
from ebooklib import epub

from ingest.anchors import clean_preview_text, extract_anchors, extract_inspectional_sampling, inject_paragraph_anchors
from ingest.assets import extract_epub_assets, normalize_image_markdown
from ingest.book_build import BookBuild
from ingest.book_check import BookCheckError
from ingest.chapter_shape import HeldOverBlocks, chapter_name, holds_no_text
from ingest.elementary import compute_elementary_metrics
from ingest.endnotes import EndnoteRegistry, relocate_chapter_footnotes
from ingest.epub_parser import extract_metadata, html_to_markdown_blocks, parse_toc
from ingest.ledger import keep_numbers_true
from ingest.line_endings import read_html, write_text_file
from ingest.markdown_text import unescape_markdown_text
from ingest.models import BookMeta, BookSource, ChapterMeta, InspectionalBlueprint, PracticeCard, ScenarioCard
from ingest.note_documents import documents_of_only_notes
from ingest.pdf_parser import PDFParser
from ingest.places import read_book_text
from ingest.reimport import book_to_import
from ingest.salience import (
    format_practice_deck_markdown,
    generate_chapter_practice_cards,
    generate_chapter_scenario_cards,
)
from ingest.toc_links import (
    ImportedDocument,
    contents_of_chapters,
    element_anchors,
    link_toc_to_chapters,
    without_entries_that_lead_nowhere,
)


def documents_that_said_nothing(became: dict[str, str]) -> list[str]:
    """The documents of the spine that left the import without a reason, out of `document name -> what became of it`.

    A document earns its reason at every way out of the spine loop: it makes a chapter, or its title waits for the
    chapter it introduces, or it holds only notes, or it holds nothing a reader could read. A name still carrying
    the empty reason went out on a `continue` that says nothing, and that is the shape of CQ-09: a page that goes
    and leaves no hole anything can measure. The import stops on it, because a book quietly shorter than the book
    it was made from is the fault this is here to catch.
    """
    return [name for name, reason in became.items() if not reason]


def ingest_epub(
    epub_path: Path,
    vault_dir: Path,
    custom_book_id: str | None = None,
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
            f"# Reflections: {title} - {first_title}\n\n## Key Takeaways\n\n- \n\n## Open Inquiries\n\n- \n"
        )
        write_text_file(first_ch_notes, notes_template)

    # The ledger keeps the numbers of a book it already knows, so they never say the numbers of an
    # older import (CQ-05)
    keep_numbers_true(vault_dir, book_meta.book_id, book_meta.total_chapters, book_meta.total_words)

    return book_meta


def _build_epub_book(
    book: epub.EpubBook, book_dir: Path, book_id: str, title: str, author: str, language: str, source: BookSource
) -> tuple[BookMeta, str]:
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

    # 4. Process Chapter Documents
    spine_metas: list[ChapterMeta] = []
    all_practice_cards: list[PracticeCard] = []
    all_scenarios: list[ScenarioCard] = []
    all_clean_text: list[str] = []
    total_words = 0
    chapter_index = 1
    # The chapter file and the paragraphs of each imported source document, for the links of the contents (CQ-01)
    imported_documents: dict[str, ImportedDocument] = {}
    # A page that holds nothing but a title is no chapter, so its headings wait for the next one (CQ-04)
    held_over = HeldOverBlocks()

    # A document that holds nothing but notes makes no chapter: each of those notes is already at the foot of
    # the chapter that cites it. It is known by what it holds, never by the end of its file name (IN-07).
    only_notes = documents_of_only_notes(book, registry)
    # What became of each document of the spine. Every one of them leaves its reason here, and a document
    # still holding the empty reason at the end of the loop went past on a `continue` that said nothing,
    # which is the fault itself (CQ-09).
    became: dict[str, str] = {}

    for item_entry in book.spine:
        item_id = item_entry[0] if isinstance(item_entry, (tuple, list)) else item_entry
        item = book.get_item_with_id(item_id)
        if not item or item.get_type() != ebooklib.ITEM_DOCUMENT:
            continue

        item_name = item.get_name()
        became[item_name] = ""

        if item_name in only_notes:
            print(
                f"[*] {item_name} holds only notes, which go to the foot of the chapters that cite "
                "them, so it makes no chapter of its own."
            )
            became[item_name] = "holds only notes"
            continue

        html_bytes = item.get_content()
        # The text of the document with \n line endings only, also from a book made on Windows (IN-06)
        soup = read_html(html_bytes)

        # Relocate footnotes
        footnotes = relocate_chapter_footnotes(soup, item_name, registry)

        # Convert HTML to Markdown blocks, and note the block where each element starts
        element_blocks: dict[str, int] = {}
        blocks = html_to_markdown_blocks(soup, element_blocks)
        # A page that makes no block at all is the one page that makes no chapter and holds nothing back, and
        # it is named on the way past, because a document that leaves the import in silence is a document
        # nobody can miss. A length used to stand in front of this, twenty letters of text, and a dedication,
        # an epigraph, a frontispiece caption and a one-line closing page are all shorter than that. They were
        # in no book, in no message, and in no count, so nothing could tell a reader they had gone (CQ-09).
        if not blocks:
            print(f"[*] {item_name} holds nothing a reader could read, so it makes no chapter.")
            became[item_name] = "holds nothing a reader could read"
            continue

        # Normalize images in blocks
        normalized_blocks: list[str] = []
        for b in blocks:
            normalized_blocks.append(normalize_image_markdown(b, asset_map))

        # A page that holds nothing but a title is no chapter of its own: a reader would open it and find
        # nothing to read. Its headings wait for the chapter they introduce (CQ-04).
        if holds_no_text(normalized_blocks) and not footnotes:
            held_over.hold(normalized_blocks, item_name)
            became[item_name] = "holds a title, which waits for the chapter it introduces"
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
        became[item_name] = f"makes {ch_filename}"
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

    # Every document of the spine is counted against what became of it. Nothing compared the source against
    # the chapters written before this, so a page could go and leave no hole that anything measured (CQ-09).
    said_nothing = documents_that_said_nothing(became)
    if said_nothing:
        raise BookCheckError(book_id, [f"these documents of the book went past the import in silence: {said_nothing}"])
    made_a_chapter = [name for name, reason in became.items() if reason.startswith("makes ")]
    print(
        f"[*] {len(became)} documents of the spine: {len(made_a_chapter)} made a chapter, "
        f"{len(became) - len(made_a_chapter)} did not, and each of those said why."
    )

    # The contents open chapter files and paragraphs of the vault, not the source documents of the EPUB (CQ-01)
    link_toc_to_chapters(toc_items, imported_documents)
    # An entry that opens nothing at all does nothing for a reader, so it goes (CQ-04)
    toc_items = without_entries_that_lead_nowhere(toc_items)
    # A book that carries no contents, or whose every entry opened nothing, gets one entry for each
    # chapter, so a reader can always move through it. The comment here used to promise this and the
    # code wrote an empty list (IN-10).
    if not toc_items:
        toc_items = contents_of_chapters(spine_metas)

    # Aggregate elementary metrics
    elementary_metrics = compute_elementary_metrics(" ".join(all_clean_text))

    # Construct default inspectional blueprint
    pivotal_chapters: list[str] = []
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
    custom_book_id: str | None = None,
    target_chapters: list[int] | None = None,
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
    book_id: str | None = None,
    target_chapters: list[int] | None = None,
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
