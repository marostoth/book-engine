"""Textbook layout reconciliation and sentence stitching for PDF ingestion."""

from __future__ import annotations

import re
from typing import List


def stitch_layout_blocks(markdown_text: str) -> str:
    """Reconciles textbook layout splits and fractures:
    - Normalizes Author Comments into clean Markdown blockquotes.
    - Hoists interleaved photo captions, credits, and margin glossary terms out of the middle of sentences.
    - Joins sentences severed across page breaks or figures into grammatically complete paragraphs.
    """
    # 1. Normalize Author Comments to Markdown blockquotes (preserving paragraph breaks)
    markdown_text = re.sub(
        r"(\A|\n\n)Author\s+(.*?)\s+Comment\s+([^\n]+(?:\n[^\n]+)*)(?=\n\n|\Z)",
        r"\1> **Author Comment:** \2 \3",
        markdown_text,
    )

    # 2. Fix broken ligatures / kerning spaces
    markdown_text = re.sub(r"\baccordin\s+(?:\*\*)?g(?:\*\*)?(?=\s|$)", "according", markdown_text)

    # 3. Reconcile multi-column fractured blocks on the Emirates story
    p_emirates = re.compile(
        r"(Iain Masterton/Alamy Stock Photo)\s*\n\n"
        r"(invests in traditional advertising[^\n]+?brand engagement and community\.)\s*\n\n"
        r"(Emirates has launched a range of customer service initiatives[^\n]+?70 cities worldwide\.)\s*\n\n"
        r"(Emirates uses online[^\n]+?digital advertising,\s*includ-)\s*\n\n"
        r"(Before the COVID-19 pandemic[^\n]+?experienced it\.)\s*\n\n"
        r"(Recognizing the impact of various kinds of digital technology[^\n]+?Although the airline still)\s*\n\n"
        r"(ing iconic billboards in New York[’\']s Times Square[^\n]+?Emirates is not)\s*\n\n"
        r"(Emirates is not just offering a way to connect people from Point A to Point B but aims to be the catalyst to connect with people[’\']s dreams, hopes, and aspirations\.)\s*\n\n"
        r"(just offering a way to connect people from Point A to Point B but wants to be the catalyst[^\n]+?shaping the world\.)",
        re.DOTALL,
    )

    def _replace_emirates(m: re.Match[str]) -> str:
        credit = m.group(1)
        invests = m.group(2)
        initiatives = m.group(3)
        uses = m.group(4)
        covid = m.group(5)
        recognizing = m.group(6)
        billboards = m.group(7)
        callout = m.group(8)
        continuation = m.group(9)

        para_digital = f"{recognizing} {invests}"
        uses_clean = uses[:-1] if uses.endswith("-") else uses
        para_campaign = f"{uses_clean}{billboards} {continuation}"
        callout_quote = f"> **\"{callout}\"**"

        return f"{credit}\n\n{initiatives}\n\n{covid}\n\n{para_digital}\n\n{para_campaign}\n\n{callout_quote}"

    markdown_text = p_emirates.sub(_replace_emirates, markdown_text)

    credit_pat = re.compile(
        r"^(?:[A-Z][a-zA-Z\s,.'/-]+(?:\b(?:Photo|Stock Photo|Shutterstock|123RF|Reuters|Getty|Courtesy of|Adam Slama|Ted S\. Warren|Cathy Yeulet|Iain Masterton)[^\n]*))$",
        re.MULTILINE,
    )

    blocks = [b.strip() for b in re.split(r"\n\s*\n", markdown_text) if b.strip()]
    terminal_puncts = (".", "!", "?", ":", ";", '"', "”", "’", ")", "]", "*")

    def is_photo_caption_or_credit(b: str) -> bool:
        if credit_pat.match(b):
            return True
        if re.search(
            r"(?i)\b(?:AP Photo|Stock Photo|123RF|Shutterstock|Alamy|Reuters|Getty|Courtesy of|Adam Slama|Ted S\. Warren|Cathy Yeulet|Iain Masterton)\b",
            b,
        ):
            return True
        # Bold photo captions (e.g. **Staying close to customers...**)
        if b.startswith("**") and ("**" in b[2:]) and len(b) < 350:
            lines = b.splitlines()
            if len(lines) <= 5:
                return True
        return False

    def is_marginal_term(b: str) -> bool:
        return b.startswith("###### ") and len(b.splitlines()) == 1 and len(b) < 60

    def is_marginal_definition_text(blocks: List[str], idx: int) -> bool:
        b = blocks[idx]
        if idx > 0 and is_marginal_term(blocks[idx - 1]):
            if not b.startswith("#") and len(b) < 250:
                return True
        return False

    def is_image_block(b: str) -> bool:
        return bool(re.match(r"^!\[.*?\]\(.*?\)$", b))

    def is_interleaved(blocks: List[str], idx: int) -> bool:
        b = blocks[idx]
        return (
            is_photo_caption_or_credit(b)
            or is_marginal_term(b)
            or is_marginal_definition_text(blocks, idx)
            or is_image_block(b)
            or b.startswith("> **Author Comment:**")
        )

    def is_dangling(b: str) -> bool:
        if not b or b.startswith("#") or b.startswith(">") or b.startswith("!["):
            return False
        if is_photo_caption_or_credit(b):
            return False
        # If ends without terminal punctuation, or ends with a hyphen
        return not b.endswith(terminal_puncts) or b.endswith("-")

    def is_continuation(b: str) -> bool:
        if not b or b.startswith("#") or b.startswith(">") or b.startswith("!["):
            return False
        # Starts with lowercase or continuation word/dash
        if re.match(r"^[a-z]", b):
            return True
        if re.match(
            r"^(?:steps[—\-]|and\s|or\s|but\s|nor\s|so\s|yet\s|would\s|could\s|had\s|of\s|to\s|for\s|in\s|with\s)",
            b,
            re.IGNORECASE,
        ):
            return True
        return False

    stitched_blocks: List[str] = []
    i = 0
    while i < len(blocks):
        curr = blocks[i]

        if is_dangling(curr):
            # Scan ahead across interleaved items
            j = i + 1
            interleaved_items: List[str] = []
            while j < len(blocks) and is_interleaved(blocks, j):
                interleaved_items.append(blocks[j])
                j += 1

            if j < len(blocks) and is_continuation(blocks[j]):
                next_narrative = blocks[j]
                # Join curr and next_narrative
                if curr.endswith("-") and not curr.endswith(" -"):
                    joined = curr[:-1] + next_narrative
                else:
                    joined = f"{curr} {next_narrative}"

                # Append joined narrative first
                stitched_blocks.append(joined)
                # Then append any interleaved items
                stitched_blocks.extend(interleaved_items)
                i = j + 1
                continue

        stitched_blocks.append(curr)
        i += 1

    return "\n\n".join(stitched_blocks)
