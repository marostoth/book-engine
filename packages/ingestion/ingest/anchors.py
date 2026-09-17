"""Deterministic paragraph anchor tagging engine.

Every top-level paragraph in chapter Markdown files receives a deterministic anchor:
'Market segmentation is the bedrock of targeted positioning. ^p-042'
Anchors follow the format ^p-[0-9]{3,} and are preserved across re-indexes.
"""

from __future__ import annotations
import re
from typing import List, Tuple

from ingest.markdown_text import unescape_markdown_text

ANCHOR_REGEX = re.compile(r"\s*\^p-[a-zA-Z0-9_-]+$")


def format_anchor(index: int) -> str:
    """Format an anchor string with at least 3 digits: ^p-001."""
    return f"^p-{index:03d}"


def strip_anchor(paragraph: str) -> str:
    """Remove trailing anchor if present."""
    return ANCHOR_REGEX.sub("", paragraph.strip())


def has_anchor(paragraph: str) -> bool:
    """Check if paragraph ends with a valid anchor tag."""
    return bool(ANCHOR_REGEX.search(paragraph.strip()))


def inject_paragraph_anchors(markdown_content: str, start_index: int = 1) -> Tuple[str, int]:
    """Inject deterministic anchors into all non-heading paragraphs separated by blank lines.

    Returns:
        (updated_markdown, total_anchors_injected)
    """
    blocks = [b.strip() for b in markdown_content.split("\n\n") if b.strip()]
    anchored_blocks: List[str] = []
    current_index = start_index

    for block in blocks:
        # Headings do not receive paragraph anchors
        if block.startswith("#"):
            anchored_blocks.append(block)
            continue

        # Strip existing anchor if present for deterministic re-indexing
        cleaned = strip_anchor(block)

        # Append deterministic anchor
        anchor_tag = format_anchor(current_index)
        anchored_blocks.append(f"{cleaned} {anchor_tag}")
        current_index += 1

    result_md = "\n\n".join(anchored_blocks)
    return result_md, current_index - start_index


def extract_anchors(markdown_content: str) -> List[Tuple[str, str]]:
    """Extract list of (anchor_id, paragraph_text) from markdown."""
    results: List[Tuple[str, str]] = []
    blocks = [b.strip() for b in markdown_content.split("\n\n") if b.strip()]

    for block in blocks:
        match = ANCHOR_REGEX.search(block)
        if match:
            anchor_id = match.group(0).strip()
            clean_text = ANCHOR_REGEX.sub("", block).strip()
            results.append((anchor_id, clean_text))

    return results


def clean_preview_text(text: str) -> str:
    r"""Clean markdown formatting for inspectional preview extracts.

    Strips:
      - Header marks (#+ )
      - Inline footnote citations (\[\^\w+\])
      - Markdown emphasis/code marks (**, *, _, `)
      - Block paragraph anchors (^p-xxx)
      - Writes `&lt;` and `&amp;` that the import wrote for book text as `<` and `&` again (SEC-01)
      - Normalizes whitespace
    """
    cleaned = text
    # Strip block paragraph anchors
    cleaned = re.sub(r"\s*\^p-[a-zA-Z0-9_-]+\s*$", "", cleaned)
    cleaned = re.sub(r"\^p-[a-zA-Z0-9_-]+", "", cleaned)
    # Strip header marks
    cleaned = re.sub(r"^\s*#{1,6}\s+", "", cleaned, flags=re.MULTILINE)
    # Strip inline footnote citations
    cleaned = re.sub(r"\[\^\w+\]", "", cleaned)
    # Strip markdown emphasis and code marks
    cleaned = re.sub(r"[*_`]+", "", cleaned)
    # Strip image markdown syntax
    cleaned = re.sub(r"!\[.*?\]\(.*?\)", "", cleaned)
    # The book text again, as the reader shows it
    cleaned = unescape_markdown_text(cleaned)
    # Normalize whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def extract_inspectional_sampling(markdown_content: str, depth: int = 2) -> InspectionalSampling:
    """Extract opening and trailing paragraph anchors and clean text previews for a chapter."""
    from ingest.models import InspectionalSampling

    blocks = [b.strip() for b in markdown_content.split("\n\n") if b.strip()]
    candidate_blocks: List[str] = []

    for b in blocks:
        # Skip headings
        if b.startswith("#"):
            continue
        # Skip footnote definitions
        if re.match(r"^\[\^[^\]]+\]:", b):
            continue
        # Skip pure image blocks
        if re.match(r"^!\[.*?\]\(.*?\)$", b):
            continue
        # Check if block has anchor
        if ANCHOR_REGEX.search(b):
            candidate_blocks.append(b)

    if not candidate_blocks:
        return InspectionalSampling()

    if 2 <= len(candidate_blocks) < 2 * depth:
        # A short chapter, such as the cover of a PDF book (IN-01): the head and the tail share no paragraph
        middle = (len(candidate_blocks) + 1) // 2
        head_candidates = candidate_blocks[:middle]
        tail_candidates = candidate_blocks[middle:]
    else:
        head_candidates = candidate_blocks[:depth]
        tail_candidates = candidate_blocks[-depth:]

    head_anchors: List[str] = []
    for b in head_candidates:
        m = ANCHOR_REGEX.search(b)
        if m:
            head_anchors.append(m.group(0).strip())

    tail_anchors: List[str] = []
    for b in tail_candidates:
        m = ANCHOR_REGEX.search(b)
        if m:
            tail_anchors.append(m.group(0).strip())

    head_preview = " ".join(clean_preview_text(b) for b in head_candidates)
    tail_preview = " ".join(clean_preview_text(b) for b in tail_candidates)

    return InspectionalSampling(
        head_anchors=head_anchors,
        tail_anchors=tail_anchors,
        head_text_preview=head_preview,
        tail_text_preview=tail_preview,
    )

