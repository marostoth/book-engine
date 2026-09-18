"""Text sanitization, slug normalization, and author cleaning utilities for PDF ingestion."""

from __future__ import annotations

import re
from typing import List, Optional

from ingest.book_id import book_id_of_name, plain_letters
from ingest.text_repair import repair_page_text


def generate_pdf_slug(filename: str, title: Optional[str] = None) -> str:
    """Derives a clean, normalized book identifier slug from filename and document metadata.

    Strips release tags (e.g. [MKTG]), 4-digit years (e.g. 2023), edition abbreviations,
    and author prefixes to generate clean slugs like 'principles-of-marketing-19ed'. Letters with marks become plain
    letters, and a name in another script gets a code (`book_id_of_name`, IN-03).
    """
    stem = re.sub(r"\.pdf$", "", plain_letters(filename), flags=re.IGNORECASE)
    # Strip bracketed tags like [MKTG], [CS]
    stem = re.sub(r"\[.*?\]", "", stem).strip()
    # Strip standalone release years like 2023, 1999
    stem = re.sub(r"\b(19|20)\d{2}\b", "", stem).strip()

    # If title exists and overlaps with stem, isolate title portion
    if title:
        clean_t = re.sub(r"[^a-zA-Z0-9\s]", "", plain_letters(title)).lower()
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
    return book_id_of_name(slug, stem)


def heal_drop_caps(text: str) -> str:
    """Repairs drop-caps and displaced leading capitals caused by PDF layout extraction:
    1. Standalone single-letter line or block before lowercase word: 'J\\n\\nim was' -> 'Jim was'.
    2. Spaced drop-cap at block start: 'J im was' -> 'Jim was'.
    3. Displaced 2-line drop-cap: initial letter missing from paragraph start and attached to
       a subsequent word on line 2 (e.g. 'im Kelvin ... an Jinterest' -> 'Jim Kelvin ... an interest').
    """
    # 1. Standalone single-letter block or line preceding lowercase text
    text = re.sub(r"(?:(?<=\n\n)|(?<=\A))([A-Z])\s*\n+([a-z]{2,}\b)", r"\1\2", text)

    # 2. Leading single capital letter followed by space and lowercase stem
    text = re.sub(r"(?:(?<=\n\n)|(?<=\A))([A-Z])\s+([a-z]{2,}\b)", r"\1\2", text)

    # 3. Displaced drop-cap where paragraph starts with lowercase stem
    def _heal_paragraph(p: str) -> str:
        m_start = re.match(r"^([a-z]{2,})\b", p)
        if not m_start:
            return p
        lead_chunk = p[:350]
        # Look for rogue capital letter inside first 350 chars after an article or preposition
        m_rogue = re.search(r"\b(an)\s+([BCDFGHJKLMNPQRSTVWXYZ])([a-z]{2,})\b", lead_chunk)
        if not m_rogue:
            m_rogue = re.search(r"\b(a|an|the|in|on|at|to|for|with|of|by|from|into)\s+([A-Z])([a-z]{3,})\b", lead_chunk)
            if m_rogue and m_rogue.group(3) in ("exas", "ondon", "ork", "merica", "ngland", "rance", "alifornia"):
                m_rogue = None

        if m_rogue:
            cap = m_rogue.group(2)
            rogue_full = m_rogue.group(0)
            fixed_full = f"{m_rogue.group(1)} {m_rogue.group(3)}"
            p_healed = cap + p
            p_healed = p_healed.replace(rogue_full, fixed_full, 1)
            return p_healed
        return p

    paragraphs = text.split("\n\n")
    return "\n\n".join(_heal_paragraph(p) for p in paragraphs)


def clean_chapter_markdown(markdown_text: str) -> str:
    """Pre-processing cleanup for PDF extracted chapters:
    - Normalizes spaced capital headers like 'C H A P T E R 1'.
    - Strips isolated single-digit lines or chapter labels at chapter start.
    - Normalizes run-in chapter subheadings like 'CHAPTER This first chapter introduces...'.
    - Deduplicates identical title lines appearing within the first three paragraphs of a chapter.
    - Repairs displaced drop-caps (e.g. 'im Kelvin ... an Jinterest' -> 'Jim Kelvin ... an interest').
    """
    # 0. Collapse spaced uppercase tokens: e.g. "C H A P T E R 1" -> "CHAPTER 1", "P A R T" -> "PART"
    markdown_text = re.sub(r"\b[A-Z](?:\s+[A-Z]){2,}\b", lambda m: m.group(0).replace(" ", ""), markdown_text)

    lines = markdown_text.splitlines()
    pre_cleaned_lines: List[str] = []

    # 1. Strip isolated single-digit lines & chapter labels at the start of chapters before content
    seen_content = False
    for line in lines:
        stripped = line.strip()

        # Check for isolated single-digit lines or chapter labels at chapter start before content
        if not seen_content and (
            re.match(r"^(?:#+\s*)?(?:\*\*)?\d+(?:\*\*)?\.?(?:\s*\^p-\d+)?$", stripped) or
            re.match(r"^(?:#+\s*)?(?:\*\*)?(?:CHAPTER|PART)\s+\d+(?:\*\*)?\.?(?:\s*\^p-\d+)?$", stripped, flags=re.IGNORECASE)
        ):
            continue

        if stripped and not stripped.startswith("#"):
            seen_content = True

        # Normalize run-in chapter subheadings like "CHAPTER This first chapter introduces..."
        m = re.match(r"^(?:>\s*)?(?:\*\*)?CHAPTER(?:\s+\d+)?(?:\*\*)?\s+([A-Z][a-z].*)$", stripped)
        if m:
            line = m.group(1)

        pre_cleaned_lines.append(line)

    text = "\n".join(pre_cleaned_lines)

    # 2. Deduplicate identical title lines appearing within the first three paragraphs
    blocks = re.split(r"\n\s*\n", text)
    if len(blocks) >= 2:
        def _normalize_title_text(t: str) -> str:
            s = re.sub(r"^#+\s*", "", t).strip()
            s = re.sub(r"^[\*_`]+|[\*_`]+$", "", s).strip()
            s = re.sub(r"^(?:Chapter|Part)\s+\d+\s*[:\-–—]\s*", "", s, flags=re.IGNORECASE).strip()
            s = re.sub(r"\s*\^p-\d+$", "", s).strip()
            return re.sub(r"[^a-zA-Z0-9]", "", s).lower()

        seen_titles = set()
        deduped_blocks: List[str] = []

        for idx, block in enumerate(blocks):
            b_stripped = block.strip()
            if not b_stripped:
                continue

            if idx < 4:  # Inspect the opening paragraphs
                norm = _normalize_title_text(b_stripped)
                is_short_title = len(b_stripped.splitlines()) <= 2 and len(b_stripped) < 150
                if is_short_title and norm and norm in seen_titles:
                    # Skip duplicate title block
                    continue
                if norm and (is_short_title or b_stripped.startswith("#")):
                    seen_titles.add(norm)

            deduped_blocks.append(block)

        text = "\n\n".join(deduped_blocks)

    # 3. Heal drop caps
    text = heal_drop_caps(text)

    return text


def deduplicate_figure_captions(markdown_text: str) -> str:
    """Suppresses duplicate standalone caption paragraphs appearing immediately adjacent
    to figures whose artwork or tags already include the caption.
    """
    # 1. Figure tag immediately followed by duplicate standalone caption paragraph
    # e.g.: ![Figure 1.3...](...) \n\n FIGURE 1.3 Selling and Marketing...
    pat_after = re.compile(
        r"(!\[[^\]]*\]\([^\)]+\)(?:\s*\^p-\d+)?)\s*\n\s*\n"
        r"((?:#+\s*)?(?:FIGURE|Figure)\s+\d+[\.\s]+\d+[^\n]*(?:\s*\^p-\d+)?)(?=\n\s*\n|\Z)",
        re.IGNORECASE,
    )

    def _clean_after(m: re.Match[str]) -> str:
        tag = m.group(1)
        caption = m.group(2).strip()
        if len(caption) < 150:
            return tag
        return m.group(0)

    markdown_text = pat_after.sub(_clean_after, markdown_text)

    # 2. Standalone caption paragraph immediately preceding figure tag
    # e.g.: FIGURE 1.3 ... \n\n ![Figure 1.3...](...)
    pat_before = re.compile(
        r"(?:\A|\n\n)"
        r"((?:#+\s*)?(?:FIGURE|Figure)\s+(\d+)[\.\s]+(\d+)[^\n]*(?:\s*\^p-\d+)?)\s*\n\s*\n"
        r"(!\[(?:Figure\s+\2[\.\s]+\3[^\]]*|[^\]]*)\]\([^\)]+\)(?:\s*\^p-\d+)?)",
        re.IGNORECASE,
    )

    def _clean_before(m: re.Match[str]) -> str:
        caption = m.group(1).strip()
        tag = m.group(4)
        if len(caption) < 150:
            return tag if m.start() == 0 else f"\n\n{tag}"
        return m.group(0)

    markdown_text = pat_before.sub(_clean_before, markdown_text)

    return markdown_text


def sanitize_pdf_markdown(markdown_text: str) -> str:
    """Strips running headers, footers, solitary page numbers, picture text markers, and orphan footnotes.

    It also takes a page's own layout marks off the text and makes a cut word whole again
    (`ingest/text_repair.py`, CQ-03).
    """
    # Strip picture text boundary comments if any leaked
    markdown_text = re.sub(
        r"<!--\s*Start of picture text\s*-->.*?<!--\s*End of picture text\s*-->",
        "",
        markdown_text,
        flags=re.DOTALL,
    )
    markdown_text = clean_chapter_markdown(markdown_text)
    markdown_text = deduplicate_figure_captions(markdown_text)
    lines = markdown_text.splitlines()
    cleaned_lines: List[str] = []

    for line in lines:
        stripped = line.strip()

        # 1. Solitary page numbers on their own lines: e.g. "25", "123"
        if re.match(r"^\d{1,4}$", stripped):
            continue

        # 1b. The front matter counts its pages in small roman numbers: "vi", "xiv" (CQ-03). Left
        # in, such a line lands in the middle of a sentence or inside the table of contents. Only
        # the numbers 1 to 89 count, because "mix" is the roman number 1009 and also a word that a
        # marketing book uses on every other page.
        if stripped and re.match(r"^(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$", stripped):
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
    # A page's own highlight, a heading with no words and a word a hyphen cut in two (CQ-03)
    cleaned_md = repair_page_text(cleaned_md)
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
