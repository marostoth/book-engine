"""Deterministic paragraph anchor tagging engine.

Every top-level paragraph in chapter Markdown files receives a deterministic anchor:
'Market segmentation is the bedrock of targeted positioning. ^p-042'
Anchors follow the format ^p-[0-9]{3,} and are preserved across re-indexes.
"""

from __future__ import annotations
import re
from typing import List, Tuple

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
