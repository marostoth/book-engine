"""High-performance, memory-safe PDF ingestion engine using PyMuPDF and pymupdf4llm."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pymupdf
import pymupdf4llm

from ingest.anchors import clean_preview_text, extract_anchors, extract_inspectional_sampling, inject_paragraph_anchors
from ingest.assets import (
    cleanup_orphaned_assets,
    filter_and_normalize_markdown_assets,
    suppress_page_images,
)
from ingest.book_build import BookBuild
from ingest.elementary import compute_elementary_metrics
from ingest.glyph_repair import repair_glyph_maps
from ingest.layout_stitcher import stitch_layout_blocks
from ingest.line_endings import write_text_file
from ingest.models import BookMeta, BookSource, ChapterMeta, InspectionalBlueprint, PracticeCard, ScenarioCard, TOCItem
from ingest.pdf_outline import CHAPTER, describe_pages, outline_parts
from ingest.pdf_sanitizer import book_language, clean_author_metadata, generate_pdf_slug, sanitize_pdf_markdown
from ingest.places import read_book_text
from ingest.reimport import book_to_import
from ingest.salience import (
    format_practice_deck_markdown,
    generate_chapter_practice_cards,
    generate_chapter_scenario_cards,
)
from ingest.vector_figures import (
    detect_and_rasterize_vector_figures,
    replace_vector_diagram_streams,
)

__all__ = ["PDFParser", "clean_author_metadata", "generate_pdf_slug", "sanitize_pdf_markdown"]


class PDFParser:
    """Sequential, memory-bounded chapter-by-chapter PDF parser and extractor."""

    def __init__(
        self,
        pdf_path: Path,
        vault_dir: Path,
        custom_book_id: str | None = None,
    ) -> None:
        self.pdf_path = Path(pdf_path).resolve()
        self.vault_dir = Path(vault_dir).resolve()
        self.custom_book_id = custom_book_id

        if not self.pdf_path.exists():
            raise FileNotFoundError(f"Source PDF not found: {self.pdf_path}")

    def parse(self, target_chapters: list[int] | None = None, replace: bool = False) -> BookMeta:
        """Parses the PDF document into structured Markdown chapters, assets, and metadata.

        A book that the vault already has is replaced only when `replace` is true (see `ingest.reimport`).
        """
        doc = pymupdf.open(str(self.pdf_path))
        total_pages = len(doc)
        if total_pages == 0:
            doc.close()
            raise ValueError(f"PDF document {self.pdf_path.name} contains 0 pages.")

        # A font that names its maths characters wrongly is corrected before any text is read, so an
        # "=" does not come out as a "1/4" (CQ-02). The file on disk is not touched.
        for line in repair_glyph_maps(doc):
            print(f"[*] Character map repaired: {line}")

        # Extract title and author metadata
        about = doc.metadata or {}
        raw_title = about.get("title") or self.pdf_path.stem
        raw_author = about.get("author") or ""
        title = raw_title.strip()
        author = clean_author_metadata(raw_author)
        # The language the PDF says it is in. Every PDF used to be written down as English (IN-10).
        language = book_language(doc)

        # Stop before anything is written when the vault already has this book (DS-09), or another book has its id (IN-03)
        try:
            name_id = generate_pdf_slug(self.pdf_path.name, title)
            book_id, source = book_to_import(
                self.vault_dir, self.pdf_path, name_id, self.custom_book_id or None, replace
            )
        except Exception:
            doc.close()
            raise
        # The chapters and paragraphs of the book before this import, so the reader's files can follow their text
        # (IN-04)
        old_text = read_book_text(self.vault_dir / "books" / book_id)

        # The book is built in a folder of its own. It goes into the vault with its practice deck, and the reader's
        # files follow its text, only when it is whole and checked. An import of some parts starts from a copy (IN-05).
        try:
            build = BookBuild(self.vault_dir, book_id, from_book=bool(target_chapters))
            try:
                book_meta, practice_deck_md, first_chapter = self._build_book(
                    doc, build.folder, book_id, title, author, language, source, target_chapters
                )
                build.put_in_vault(book_meta, practice_deck_md, old_text)
            finally:
                build.remove()
        finally:
            if not doc.is_closed:
                doc.close()

        # The notes template goes with the first chapter, not with the cover
        notes_file = f"{first_chapter.id}-notes.md" if first_chapter else "ch-01-notes.md"
        first_ch_notes = self.vault_dir / "notes" / book_id / notes_file
        if not first_ch_notes.exists():
            first_title = first_chapter.title if first_chapter else "Chapter 1"
            write_text_file(
                first_ch_notes,
                f"# Reflections: {title} - {first_title}\n\n## Key Takeaways\n\n- \n\n## Open Inquiries\n\n- \n",
            )

        return book_meta

    def _build_book(
        self,
        doc: Any,
        book_dir: Path,
        book_id: str,
        title: str,
        author: str,
        language: str,
        source: BookSource,
        target_chapters: list[int] | None,
    ) -> tuple[BookMeta, str, ChapterMeta | None]:
        """Builds the parts, the pictures and `_meta.json` of the book in `book_dir`. Gives the practice deck and the
        first chapter."""
        total_pages = len(doc)
        assets_dir = book_dir / "assets"
        assets_dir.mkdir(parents=True, exist_ok=True)

        # 1. The parts of the book: every part that the PDF outline names, not only the chapters (IN-01)
        parts, pages_left_out = outline_parts(doc.get_toc(), total_pages)
        if pages_left_out:
            which = "it" if len(pages_left_out) == 1 else "them"
            print(
                f"    [!] Not imported: {describe_pages(pages_left_out)}. No part of the PDF outline covers {which}.",
                flush=True,
            )

        # 2. Sequential Extraction: Iterate part-by-part (Memory-Safe)
        spine_metas: list[ChapterMeta] = []
        toc_items: list[TOCItem] = []
        all_practice_cards: list[PracticeCard] = []
        all_scenarios: list[ScenarioCard] = []
        all_clean_text: list[str] = []
        total_words = 0

        for chapter_idx, part in enumerate(parts, start=1):
            ch_title, start_page, end_page = part.title, part.first_page, part.end_page
            ch_id = f"ch-{chapter_idx:02d}"
            ch_filename = f"{ch_id}.md"
            ch_path = book_dir / ch_filename

            if target_chapters and chapter_idx not in target_chapters and ch_path.exists():
                anchored_md = ch_path.read_text(encoding="utf-8")
                word_count = len(re.findall(r"\b\w+\b", anchored_md))
                total_words += word_count
                anchors_list = extract_anchors(anchored_md)
                spine_metas.append(
                    ChapterMeta(
                        id=ch_id,
                        title=ch_title,
                        file_path=ch_filename,
                        order=chapter_idx,
                        word_count=word_count,
                        anchor_count=len(anchors_list),
                        first_anchor=anchors_list[0][0] if anchors_list else None,
                        last_anchor=anchors_list[-1][0] if anchors_list else None,
                        footnotes_count=0,
                        inspectional_sampling=extract_inspectional_sampling(anchored_md),
                    )
                )
                toc_items.append(TOCItem(id=ch_id, title=ch_title, href=ch_filename, level=1, subitems=[]))
                if part.makes_cards:
                    clean_t = clean_preview_text(anchored_md)
                    if clean_t:
                        all_clean_text.append(clean_t)
                    all_practice_cards.extend(
                        generate_chapter_practice_cards(ch_id, anchored_md, min_items=5, max_items=8)
                    )
                    all_scenarios.extend(generate_chapter_scenario_cards(anchored_md, ch_id, max_items=3))
                continue

            print(
                f"    -> Part {chapter_idx}/{len(parts)} ({part.kind}): '{ch_title}' (pages {start_page + 1}..{end_page})...",
                flush=True,
            )

            page_numbers = list(range(start_page, end_page))

            # 3. Pristine Snapshot Pass: Vector diagram rasterization directly from unredacted doc
            vec_figures = detect_and_rasterize_vector_figures(doc, page_numbers, chapter_idx, assets_dir)

            # 4. Non-Destructive Markdown Conversion directly from source doc (Zero Redaction)
            raw_chapter_md = pymupdf4llm.to_markdown(
                doc,
                pages=page_numbers,
                write_images=True,
                image_path=str(assets_dir),
            )

            # 6. Single-Tag Reconciliation: Suppress auto-extracted images on vector diagram pages
            if vec_figures:
                vec_pages = {val[2] for val in vec_figures.values() if len(val) > 2}
                raw_chapter_md = suppress_page_images(raw_chapter_md, assets_dir, vec_pages)

            # 7. Micro-Asset & Aspect Ratio Filter (< 50 pt or aspect ratio > 6:1 discarded)
            raw_chapter_md = filter_and_normalize_markdown_assets(raw_chapter_md, assets_dir)

            # 8. Replace vector diagram streams and insert rasterized figure tags
            if vec_figures:
                raw_chapter_md = replace_vector_diagram_streams(raw_chapter_md, vec_figures)

            # 8. Sanitization & layout stitching
            sanitized_md = sanitize_pdf_markdown(raw_chapter_md)
            stitched_md = stitch_layout_blocks(sanitized_md)

            # Ensure the chapter begins with a proper H1 heading
            if not re.match(r"^#{1,2}\s+", stitched_md):
                stitched_md = f"# {ch_title}\n\n{stitched_md}"

            # Inject persistent paragraph anchors
            anchored_md, anchor_count = inject_paragraph_anchors(stitched_md, start_index=1)

            # Calculate word count
            word_count = len(re.findall(r"\b\w+\b", anchored_md))
            total_words += word_count

            # Write chapter markdown file
            write_text_file(ch_path, anchored_md)

            # Extract anchor boundaries
            anchors_list = extract_anchors(anchored_md)
            first_anchor = anchors_list[0][0] if anchors_list else None
            last_anchor = anchors_list[-1][0] if anchors_list else None

            # Extract inspectional sampling
            sampling = extract_inspectional_sampling(anchored_md)

            # Collect clean text for elementary metrics, from the parts that make cards: a reader studies them
            clean_ch_text = clean_preview_text(anchored_md) if part.makes_cards else ""
            if clean_ch_text:
                all_clean_text.append(clean_ch_text)

            ch_meta = ChapterMeta(
                id=ch_id,
                title=ch_title,
                file_path=ch_filename,
                order=chapter_idx,
                word_count=word_count,
                anchor_count=anchor_count,
                first_anchor=first_anchor,
                last_anchor=last_anchor,
                footnotes_count=0,
                inspectional_sampling=sampling,
            )
            spine_metas.append(ch_meta)

            toc_items.append(
                TOCItem(
                    id=ch_id,
                    title=ch_title,
                    href=ch_filename,
                    level=1,
                    subitems=[],
                )
            )

            # 6. Salience Scoring & Deterministic Cloze Deck, for the parts the owner chose (IN-01)
            if part.makes_cards:
                chapter_cards = generate_chapter_practice_cards(ch_id, anchored_md, min_items=5, max_items=8)
                all_practice_cards.extend(chapter_cards)
                all_scenarios.extend(generate_chapter_scenario_cards(anchored_md, ch_id, max_items=3))

        doc.close()

        # Clean up any orphaned asset files not referenced in any chapter markdown
        cleanup_orphaned_assets(book_dir, assets_dir, [ch.file_path for ch in spine_metas])

        # The first and the last chapter are pivotal, not the cover or the index
        chapter_metas = [
            meta for meta, part in zip(spine_metas, parts, strict=False) if part.kind == CHAPTER
        ] or spine_metas
        pivotal_chapters = [chapter_metas[0].id] if chapter_metas else []
        if len(chapter_metas) > 1:
            pivotal_chapters.append(chapter_metas[-1].id)
        preface = next((meta for meta, part in zip(spine_metas, parts, strict=False) if part.is_preface), None)

        inspectional_blueprint = InspectionalBlueprint(
            front_matter={
                "has_preface": preface is not None,
                "preface_path": preface.file_path if preface else None,
                "publisher_blurb": f"{title} by {author}",
            },
            pivotal_chapters=pivotal_chapters,
            synthetic_index_clusters=[],
        )

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
            elementary_metrics=compute_elementary_metrics(" ".join(all_clean_text)),
            inspectional_blueprint=inspectional_blueprint,
        )
        write_text_file(book_dir / "_meta.json", book_meta.model_dump_json(indent=2))

        practice_deck_md = format_practice_deck_markdown(title, all_practice_cards, all_scenarios)
        return book_meta, practice_deck_md, (chapter_metas[0] if chapter_metas else None)
