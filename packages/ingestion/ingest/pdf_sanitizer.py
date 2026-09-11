"""Text sanitization, slug normalization, and author cleaning utilities for PDF ingestion."""

from __future__ import annotations

import re
from typing import List, Optional


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
