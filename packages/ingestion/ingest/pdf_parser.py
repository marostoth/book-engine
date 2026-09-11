"""High-performance, memory-safe PDF ingestion engine using PyMuPDF and pymupdf4llm."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pymupdf
import pymupdf4llm

from ingest.anchors import extract_anchors, inject_paragraph_anchors
from ingest.models import BookMeta, ChapterMeta, PracticeCard, TOCItem
from ingest.salience import format_practice_deck_markdown, generate_chapter_practice_cards


def generate_pdf_slug(filename: str, title: Optional[str] = None) -> str:
    """Derives a clean, normalized book identifier slug from filename and document metadata.

    Strips release tags (e.g. [MKTG]), 4-digit years (e.g. 2023), edition abbreviations,
    and author prefixes to generate clean slugs like 'principles-of-marketing-19ed'.
    """
    stem = re.sub(r"\.pdf$", "", filename, flags=re.IGNORECASE)
    # Strip bracketed tags like [MKTG], [CS]
    stem = re.sub(r"\[.*?\]", "", stem).strip()
    # Strip standalone release years like 2023, 1999
    stem = re.sub(r"\b(19|20)\d{2}\b", "", stem).strip()

    # If title exists and overlaps with stem, isolate title portion
    if title:
        clean_t = re.sub(r"[^a-zA-Z0-9\s]", "", title).lower()
        words = clean_t.split()
        if len(words) >= 2:
            lead = " ".join(words[:2])
            idx = stem.lower().find(lead)
            if idx != -1:
                stem = stem[idx:]
    else:
        # Check for author list ending with period + space before title
        m = re.search(r"(?<=\.\s)(?=[A-Z][a-z])", stem)
        if m:
            stem = stem[m.end() :]

    slug = re.sub(r"[^a-zA-Z0-9]+", "-", stem).strip("-").lower()
    return slug or "unnamed-book"


def sanitize_pdf_markdown(markdown_text: str) -> str:
    """Strips running headers, footers, solitary page numbers, and orphan footnote brackets from page margins."""
    lines = markdown_text.splitlines()
    cleaned_lines: List[str] = []

    for line in lines:
        stripped = line.strip()

        # 1. Solitary page numbers on their own lines: e.g. "25", "123"
        if re.match(r"^\d{1,4}$", stripped):
            continue

        # 2. Running headers / footers with chapter or part titles:
        # e.g. "> CHAPTER 1 | Marketing: Creating Customer Value and Engagement 25"
        # e.g. "26<sup>PART 1</sup> |<sup>Defining Marketing and the Marketing Process</sup>"
        # e.g. "CHAPTER 1 | Marketing... 25"
        if re.match(
            r"^(?:>\s*)?(?:CHAPTER\s+\d+|PART\s+\d+|\d+<sup>.*?</sup>)\s*\|\s*.*?(?:\d+)?$",
            stripped,
            flags=re.IGNORECASE,
        ):
            continue
        if re.match(
            r"^(?:>\s*)?.*?\s*\|\s*(?:CHAPTER\s+\d+|PART\s+\d+)\s*(?:\d+)?$",
            stripped,
            flags=re.IGNORECASE,
        ):
            continue
        if re.match(r"^(?:>\s*)?CHAPTER\s+\d+\s+.*?\s+\d{1,4}$", stripped, flags=re.IGNORECASE):
            continue
        if re.match(r"^(?:>\s*)?PART\s+\d+\s+.*?\s+\d{1,4}$", stripped, flags=re.IGNORECASE):
            continue

        cleaned_lines.append(line)

    cleaned_md = "\n".join(cleaned_lines)
    cleaned_md = re.sub(r"\n{3,}", "\n\n", cleaned_md)

    # Neutralize any orphan footnote callouts [^callout] that lack definitions [^callout]:
    callouts = set(re.findall(r"\[\^([a-zA-Z0-9_-]+)\](?!:)", cleaned_md))
    definitions = set(re.findall(r"\[\^([a-zA-Z0-9_-]+)\]:", cleaned_md))
    orphans = callouts - definitions
    for orphan in orphans:
        cleaned_md = cleaned_md.replace(f"[^{orphan}]", f"[{orphan}]")

    return cleaned_md.strip()


def clean_author_metadata(raw_author: str) -> str:
    """Normalizes author string by deduplicating and cleaning semicolon/comma delimited names."""
    if not raw_author:
        return "Unknown Author"

    parts = [p.strip() for p in re.split(r"[;\n]", raw_author) if p.strip()]
    unique_authors: List[str] = []
    seen = set()
    for part in parts:
        clean = part.rstrip(".,")
        # Format 'Lastname, Firstname' -> 'Firstname Lastname'
        if "," in clean:
            sub = [s.strip() for s in clean.split(",", 1)]
            if len(sub) == 2 and sub[1]:
                clean = f"{sub[1]} {sub[0]}"
        if clean.lower() not in seen:
            seen.add(clean.lower())
            unique_authors.append(clean)

    if not unique_authors:
        return raw_author.strip()
    if len(unique_authors) == 1:
        return unique_authors[0]
    if len(unique_authors) == 2:
        return f"{unique_authors[0]} & {unique_authors[1]}"
    return ", ".join(unique_authors[:-1]) + f", & {unique_authors[-1]}"


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

    def parse(self) -> BookMeta:
        """Parses the PDF document into structured Markdown chapters, assets, and metadata."""
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
        total_words = 0

        for chapter_idx, (ch_title, start_page, end_page) in enumerate(chapter_ranges, start=1):
            ch_id = f"ch-{chapter_idx:02d}"
            ch_filename = f"{ch_id}.md"
            ch_path = book_dir / ch_filename

            print(
                f"    -> Chapter {chapter_idx}/{len(chapter_ranges)}: '{ch_title}' (pages {start_page + 1}..{end_page})...",
                flush=True,
            )

            # Snapshot existing assets to track newly generated images
            existing_assets = set(os.listdir(assets_dir)) if assets_dir.exists() else set()

            # Convert chapter page range to Markdown using pymupdf4llm
            page_numbers = list(range(start_page, end_page))
            raw_chapter_md = pymupdf4llm.to_markdown(
                doc,
                pages=page_numbers,
                write_images=True,
                image_path=str(assets_dir),
            )

            # 3. Asset Filtering (<150x150 px or <8 KB are discarded)
            current_assets = set(os.listdir(assets_dir)) if assets_dir.exists() else set()
            new_assets = current_assets - existing_assets

            for asset_name in new_assets:
                asset_path = assets_dir / asset_name
                try:
                    file_size = asset_path.stat().st_size
                    pix = pymupdf.Pixmap(str(asset_path))
                    width, height = pix.width, pix.height
                    del pix

                    if width < 150 or height < 150 or file_size < 8192:
                        # Low-resolution icon, bullet, or decorative element: delete
                        asset_path.unlink(missing_ok=True)
                        # Remove markdown image reference
                        raw_chapter_md = re.sub(
                            rf"!\[.*?\]\([^\)]*?{re.escape(asset_name)}[^\)]*?\)",
                            "",
                            raw_chapter_md,
                        )
                    else:
                        # Normalize markdown reference to vault assets/<filename>
                        def make_rel(m: re.Match[str]) -> str:
                            alt = m.group(1)
                            return f"![{alt}](assets/{asset_name})"

                        raw_chapter_md = re.sub(
                            rf"!\[(.*?)\]\([^\)]*?{re.escape(asset_name)}[^\)]*?\)",
                            make_rel,
                            raw_chapter_md,
                        )
                except Exception:
                    pass

            # 4. Sanitization: Strip margins, solitary numbers, running headers
            sanitized_md = sanitize_pdf_markdown(raw_chapter_md)

            # Ensure the chapter begins with a proper H1 heading
            if not re.match(r"^#{1,2}\s+", sanitized_md):
                sanitized_md = f"# {ch_title}\n\n{sanitized_md}"

            # 5. Anchor Tagging: Inject deterministic ^p-xxx
            anchored_md, anchor_count = inject_paragraph_anchors(sanitized_md, start_index=1)

            # Compute chapter word count
            word_count = len(re.findall(r"\b\w+\b", anchored_md))
            total_words += word_count

            # Write chapter markdown file
            ch_path.write_text(anchored_md, encoding="utf-8")

            # Extract anchor boundaries
            anchors_list = extract_anchors(anchored_md)
            first_anchor = anchors_list[0][0] if anchors_list else None
            last_anchor = anchors_list[-1][0] if anchors_list else None

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

        doc.close()

        # 7. Construct & Save BookMeta (_meta.json)
        book_meta = BookMeta(
            book_id=book_id,
            title=title,
            author=author,
            language="en",
            total_words=total_words,
            total_chapters=len(spine_metas),
            toc=toc_items,
            spine=spine_metas,
        )
        meta_path = book_dir / "_meta.json"
        meta_path.write_text(book_meta.model_dump_json(indent=2), encoding="utf-8")

        # 8. Save Practice Deck
        practice_deck_md = format_practice_deck_markdown(title, all_practice_cards)
        practice_deck_path = notes_dir / "practice-deck.md"
        practice_deck_path.write_text(practice_deck_md, encoding="utf-8")

        # 9. Starter Note Template for Chapter 1
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
