"""High-performance, memory-safe PDF ingestion engine using PyMuPDF and pymupdf4llm."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pymupdf
import pymupdf4llm

from ingest.anchors import extract_anchors, inject_paragraph_anchors, extract_inspectional_sampling, clean_preview_text
from ingest.models import BookMeta, ChapterMeta, PracticeCard, TOCItem, InspectionalBlueprint, ScenarioCard
from ingest.elementary import compute_elementary_metrics
from ingest.salience import (
    format_practice_deck_markdown,
    generate_chapter_practice_cards,
    generate_chapter_scenario_cards,
)
from ingest.pdf_sanitizer import clean_author_metadata, generate_pdf_slug, sanitize_pdf_markdown
from ingest.assets import (
    filter_and_normalize_markdown_assets,
    cleanup_orphaned_assets,
    suppress_page_images,
)
from ingest.vector_figures import (
    detect_and_rasterize_vector_figures,
    replace_vector_diagram_streams,
)
from ingest.layout_stitcher import stitch_layout_blocks
from ingest.reimport import check_book_can_be_imported


__all__ = ["PDFParser", "generate_pdf_slug", "sanitize_pdf_markdown", "clean_author_metadata"]


class PDFParser:
    """Sequential, memory-bounded chapter-by-chapter PDF parser and extractor."""

    def __init__(
        self,
        pdf_path: Path,
        vault_dir: Path,
        custom_book_id: Optional[str] = None,
    ) -> None:
        self.pdf_path = Path(pdf_path).resolve()
        self.vault_dir = Path(vault_dir).resolve()
        self.custom_book_id = custom_book_id

        if not self.pdf_path.exists():
            raise FileNotFoundError(f"Source PDF not found: {self.pdf_path}")

    def parse(self, target_chapters: Optional[List[int]] = None, replace: bool = False) -> BookMeta:
        """Parses the PDF document into structured Markdown chapters, assets, and metadata.

        A book that the vault already has is replaced only when `replace` is true (see `ingest.reimport`).
        """
        doc = pymupdf.open(str(self.pdf_path))
        total_pages = len(doc)
        if total_pages == 0:
            doc.close()
            raise ValueError(f"PDF document {self.pdf_path.name} contains 0 pages.")

        # Extract title and author metadata
        raw_title = doc.metadata.get("title") or self.pdf_path.stem
        raw_author = doc.metadata.get("author") or ""
        title = raw_title.strip()
        author = clean_author_metadata(raw_author)

        book_id = self.custom_book_id or generate_pdf_slug(self.pdf_path.name, title)

        # Stop before anything is written when the vault already has this book (DS-09)
        try:
            check_book_can_be_imported(self.vault_dir, book_id, replace)
        except Exception:
            doc.close()
            raise

        # Establish destination directories
        book_dir = self.vault_dir / "books" / book_id
        assets_dir = book_dir / "assets"
        notes_dir = self.vault_dir / "notes" / book_id

        book_dir.mkdir(parents=True, exist_ok=True)
        assets_dir.mkdir(parents=True, exist_ok=True)
        notes_dir.mkdir(parents=True, exist_ok=True)

        # 1. Outline extraction & chapter range segmentation
        toc = doc.get_toc()  # Returns [level, title, 1-based page]
        chapter_ranges: List[Tuple[str, int, int]] = []

        # Filter for chapter-level entries (regex r"(?i)chapter\s+\d+" or lvl == 2)
        chapter_toc_entries = [
            (entry[1].strip(), entry[2])
            for entry in toc
            if re.search(r"(?i)chapter\s+\d+", entry[1])
        ]

        if not chapter_toc_entries:
            # Fallback to lvl == 2 entries (ignoring indexes / backmatter)
            chapter_toc_entries = [
                (entry[1].strip(), entry[2])
                for entry in toc
                if entry[0] == 2
                and not any(k in entry[1].lower() for k in ["index", "appendix", "glossary"])
            ]

        if chapter_toc_entries:
            # Build start/end page intervals from TOC (convert 1-based page numbers to 0-based indices)
            for i, (ch_title, start_1based) in enumerate(chapter_toc_entries):
                start_0 = max(0, start_1based - 1)
                if i + 1 < len(chapter_toc_entries):
                    next_start_1based = chapter_toc_entries[i + 1][1]
                    end_0 = max(start_0 + 1, min(total_pages, next_start_1based - 1))
                else:
                    # For the last chapter, search for any subsequent major section (level <= 2, e.g. Appendix, Index)
                    subsequent = [e[2] for e in toc if e[0] <= 2 and e[2] > start_1based]
                    if subsequent:
                        end_0 = max(start_0 + 1, min(total_pages, min(subsequent) - 1))
                    else:
                        end_0 = total_pages
                chapter_ranges.append((ch_title, start_0, end_0))
        else:
            # Fallback: chunk document into 35-page slices
            chunk_size = 35
            chunk_idx = 1
            for start_0 in range(0, total_pages, chunk_size):
                end_0 = min(total_pages, start_0 + chunk_size)
                ch_title = f"Chapter {chunk_idx}"
                chapter_ranges.append((ch_title, start_0, end_0))
                chunk_idx += 1

        # 2. Sequential Extraction: Iterate chapter-by-chapter (Memory-Safe)
        spine_metas: List[ChapterMeta] = []
        toc_items: List[TOCItem] = []
        all_practice_cards: List[PracticeCard] = []
        all_scenarios: List[ScenarioCard] = []
        all_clean_text: List[str] = []
        total_words = 0

        for chapter_idx, (ch_title, start_page, end_page) in enumerate(chapter_ranges, start=1):
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
                clean_t = clean_preview_text(anchored_md)
                if clean_t:
                    all_clean_text.append(clean_t)
                all_practice_cards.extend(generate_chapter_practice_cards(ch_id, anchored_md, min_items=5, max_items=8))
                all_scenarios.extend(generate_chapter_scenario_cards(anchored_md, ch_id, max_items=3))
                continue

            print(
                f"    -> Chapter {chapter_idx}/{len(chapter_ranges)}: '{ch_title}' (pages {start_page + 1}..{end_page})...",
                flush=True,
            )


            page_numbers = list(range(start_page, end_page))

            # 3. Pristine Snapshot Pass: Vector diagram rasterization directly from unredacted doc
            vec_figures = detect_and_rasterize_vector_figures(
                doc, page_numbers, chapter_idx, assets_dir
            )

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
            ch_path.write_text(anchored_md, encoding="utf-8")

            # Extract anchor boundaries
            anchors_list = extract_anchors(anchored_md)
            first_anchor = anchors_list[0][0] if anchors_list else None
            last_anchor = anchors_list[-1][0] if anchors_list else None

            # Extract inspectional sampling
            sampling = extract_inspectional_sampling(anchored_md)

            # Collect clean text for elementary metrics
            clean_ch_text = clean_preview_text(anchored_md)
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

            # 6. Salience Scoring & Deterministic Cloze Deck
            chapter_cards = generate_chapter_practice_cards(
                ch_id, anchored_md, min_items=5, max_items=8
            )
            all_practice_cards.extend(chapter_cards)
            all_scenarios.extend(generate_chapter_scenario_cards(anchored_md, ch_id, max_items=3))

        doc.close()

        # Clean up any orphaned asset files not referenced in any chapter markdown
        cleanup_orphaned_assets(book_dir, assets_dir, [ch.file_path for ch in spine_metas])

        # Aggregate elementary metrics
        pivotal_chapters = [spine_metas[0].id] if spine_metas else []
        if len(spine_metas) > 1:
            pivotal_chapters.append(spine_metas[-1].id)

        inspectional_blueprint = InspectionalBlueprint(
            front_matter={"has_preface": False, "preface_path": None, "publisher_blurb": f"{title} by {author}"},
            pivotal_chapters=pivotal_chapters,
            synthetic_index_clusters=[],
        )

        book_meta = BookMeta(
            book_id=book_id,
            title=title,
            author=author,
            language="en",
            total_words=total_words,
            total_chapters=len(spine_metas),
            toc=toc_items,
            spine=spine_metas,
            elementary_metrics=compute_elementary_metrics(" ".join(all_clean_text)),
            inspectional_blueprint=inspectional_blueprint,
        )
        (book_dir / "_meta.json").write_text(book_meta.model_dump_json(indent=2), encoding="utf-8")

        practice_deck_md = format_practice_deck_markdown(title, all_practice_cards, all_scenarios)
        (notes_dir / "practice-deck.md").write_text(practice_deck_md, encoding="utf-8")

        first_ch_notes = notes_dir / "ch-01-notes.md"
        if not first_ch_notes.exists():
            first_title = spine_metas[0].title if spine_metas else "Chapter 1"
            first_ch_notes.write_text(f"# Reflections: {title} - {first_title}\n\n## Key Takeaways\n\n- \n\n## Open Inquiries\n\n- \n", encoding="utf-8")

        return book_meta

