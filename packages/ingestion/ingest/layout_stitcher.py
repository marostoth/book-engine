"""Textbook layout reconciliation and sentence stitching for PDF ingestion.

A sentence of a textbook can be cut in two by a page break, a picture, a photo credit or the title
of a story box that the designer laid over the column. A reader cannot highlight, quote or study
half a sentence, so the halves are joined again and the thing that stood between them is moved
after the whole sentence (CQ-03).

Three rules do the work:
- A paragraph is finished only when it ends a sentence. `SENTENCE_END` is the same rule the practice
  cards use, and a bold or italic marker at the very end does not make a half sentence whole.
- A photo credit that landed inside a paragraph is lifted out, so the paragraph stays a paragraph.
- Joining is repeated until nothing more joins, because one sentence can be cut into three parts.

No rule here names a book. A whole passage of one book was written out here, sentence by sentence, to
join one page of it, and a photo credit was known by the names of four real photographers of that book.
Neither fired even once on the owner's two PDF books, so both are gone: a credit is known by the agency
that owns the picture, and a cut sentence by the three rules above (IN-10).
"""

from __future__ import annotations

import re

# The same rule the practice cards use (`ingest/scenarios.py`): a sentence ends with . ! or ?, and a
# closing quote or bracket may follow.
SENTENCE_END = re.compile(r"[.!?][\"'”’)\]]*$")

FIRST_WORD = re.compile(r"^[^A-Za-z]*([A-Za-z][A-Za-z'’]*)")

# The label of a figure or a table is not a half sentence, even when it has no full stop, so a
# sentence is never joined on to one, and a sentence cut by one is joined across it. The label
# shouts its name in capitals, which is how it differs from a sentence that happens to begin
# "Figure 4.65 contains a simplified...".
FIGURE_LABEL = re.compile(r"^(?:\*+\s*)?(?:FIGURE|TABLE|EXHIBIT)\s+[\dA-Z]")

# A bold or italic marker, or a footnote number, at the very end of a paragraph is punctuation for
# the eye, not for a sentence, so it comes off before the sentence rule looks.
TRAILING_MARKS = re.compile(r"(?:[*_`]+|<sup>[^<>]*</sup>)$")

# One sentence can be cut into several parts, so joining runs again until nothing more joins.
MAX_ROUNDS = 8

# The end of a longer word, left on its own when the layout cut the word in two. None of these is
# an English word, so a sentence never carries on with one, and a paragraph that opens with one is
# a scrap of another line.
WORD_ENDINGS = frozenset(
    {
        "s",
        "es",
        "ed",
        "er",
        "ers",
        "ing",
        "ings",
        "ly",
        "ies",
        "ier",
        "iest",
        "est",
        "ive",
        "ity",
        "ties",
        "ment",
        "ments",
        "ness",
        "tion",
        "tions",
        "sion",
        "sions",
        "ance",
        "ence",
        "ous",
        "ful",
        "less",
        "ward",
        "wards",
    }
)


def is_figure_label(block: str) -> bool:
    """True for the shouted label of a figure or a table."""
    return bool(FIGURE_LABEL.match(block))


def finishes_a_sentence(block: str) -> bool:
    """True when the paragraph ends a sentence of its own."""
    trimmed = block.rstrip()
    while True:
        shorter = TRAILING_MARKS.sub("", trimmed).rstrip()
        if shorter == trimmed:
            return bool(SENTENCE_END.search(trimmed))
        trimmed = shorter


def the_words_prove_the_join(first_half: str, second_half: str) -> bool:
    """True when the second half really is the rest of the sentence, and not the tail of a word.

    A hyphen at the end of the first half is proof of its own: the layout cut a word there. Without
    one, the second half may not open with a bare word ending. "ers could sit for hours" opens with
    one, because it is the tail of "customers" from a line the layout put somewhere else, and
    joining it would put words in the book that the book never wrote. The halves then stay apart,
    which is honest, instead of wrong. No English sentence carries on with "ers" or "ing" as a word
    of its own, so nothing real is lost.
    """
    if first_half.endswith("-") and not first_half.endswith(" -"):
        return True
    match = FIRST_WORD.match(second_half)
    if not match:
        return True
    return match.group(1).lower() not in WORD_ENDINGS


def stitch_layout_blocks(markdown_text: str) -> str:
    """Reconciles textbook layout splits and fractures:
    - Normalizes Author Comments into clean Markdown blockquotes.
    - Hoists interleaved photo captions, credits, and margin glossary terms out of the middle of sentences.
    - Joins sentences severed across page breaks, figures, credits and story box titles.
    """
    # 1. Normalize Author Comments to Markdown blockquotes (preserving paragraph breaks)
    markdown_text = re.sub(
        r"(\A|\n\n)Author\s+(.*?)\s+Comment\s+([^\n]+(?:\n[^\n]+)*)(?=\n\n|\Z)",
        r"\1> **Author Comment:** \2 \3",
        markdown_text,
    )

    # 2. A photo credit is known by the agency that owns the picture, never by the name of one photographer.
    # The rule used to list four real people from one book. Not one credit line of either PDF book needed
    # them: the agency words found all 543 of Mind Over Markets and Principles of Marketing (IN-10).
    credit_pat = re.compile(
        r"^(?:[A-Z][a-zA-Z\s,.'/-]+(?:\b(?:Photo|Stock Photo|Shutterstock|123RF|Reuters|Getty|Alamy|Courtesy of)[^\n]*))$",
        re.MULTILINE,
    )

    blocks = [b.strip() for b in re.split(r"\n\s*\n", markdown_text) if b.strip()]

    credit_word = re.compile(r"(?i)\b(?:AP Photo|Stock Photo|123RF|Shutterstock|Alamy|Reuters|Getty|Courtesy of)\b")

    def is_photo_caption_or_credit(b: str) -> bool:
        if credit_pat.match(b):
            return True
        if credit_word.search(b):
            return True
        # Bold photo captions (e.g. **Staying close to customers...**)
        if b.startswith("**") and ("**" in b[2:]) and len(b) < 350:
            lines = b.splitlines()
            if len(lines) <= 5:
                return True
        return False

    def lift_credits(b: str) -> tuple[str, list[str]]:
        """Splits a paragraph into its own words and the photo credits that landed inside it.

        A credit is a line of its own, so a paragraph that merely mentions a photo agency in a
        sentence keeps every word. Without this, a paragraph that ends with a credit line reads as
        a caption, and the sentence it cut in two is never joined again.
        """
        lines = b.splitlines()
        if len(lines) < 2:
            return b, []
        kept: list[str] = []
        credits: list[str] = []
        for line in lines:
            one = line.strip()
            if one and len(one) < 120 and (credit_pat.match(one) or credit_word.search(one)):
                credits.append(one)
            else:
                kept.append(line)
        prose = "\n".join(kept).strip()
        if not prose or not credits:
            return b, []
        return prose, credits

    def is_marginal_term(b: str) -> bool:
        return b.startswith("###### ") and len(b.splitlines()) == 1 and len(b) < 60

    def is_marginal_definition_text(blocks: list[str], idx: int) -> bool:
        b = blocks[idx]
        return bool(idx > 0 and is_marginal_term(blocks[idx - 1]) and not b.startswith("#") and len(b) < 250)

    def is_image_block(b: str) -> bool:
        return bool(re.match(r"^!\[.*?\]\(.*?\)$", b))

    def is_interleaved(blocks: list[str], idx: int) -> bool:
        b = blocks[idx]
        return (
            is_photo_caption_or_credit(b)
            or is_marginal_term(b)
            or is_marginal_definition_text(blocks, idx)
            or is_image_block(b)
            or is_figure_label(b)
            or b.startswith("> **Author Comment:**")
        )

    def is_dangling(b: str) -> bool:
        if not b or b.startswith(("#", ">", "![")):
            return False
        if is_photo_caption_or_credit(b) or is_figure_label(b):
            return False
        # A half sentence, or a word that a hyphen cut at the end of a line
        return not finishes_a_sentence(b) or b.endswith("-")

    def is_continuation(b: str) -> bool:
        if not b or b.startswith(("#", ">", "![")):
            return False
        # A photo credit or a figure label needs no test here: the scan above steps over both, so
        # neither can ever be the block this looks at.
        # The rest of a sentence goes on in lower case. A capital letter starts something new, so
        # "For comparison, ..." is a new sentence and "for comparison, ..." is the rest of one.
        if re.match(r"^[a-z]", b):
            return True
        return bool(re.match(r"^steps[—\-]", b))

    def try_to_join(blocks: list[str], i: int, curr: str, lifted: list[str]) -> tuple[list[str], int] | None:
        """The blocks to write and the next index, when `curr` is a half sentence. Else None."""
        if not is_dangling(curr):
            return None
        # Scan ahead across interleaved items
        j = i + 1
        interleaved_items: list[str] = list(lifted)
        while j < len(blocks) and is_interleaved(blocks, j):
            interleaved_items.append(blocks[j])
            j += 1
        if j >= len(blocks) or not is_continuation(blocks[j]):
            return None
        if not the_words_prove_the_join(curr, blocks[j]):
            return None

        next_narrative = blocks[j]
        # Join curr and next_narrative
        if curr.endswith("-") and not curr.endswith(" -"):
            joined = curr[:-1] + next_narrative
        else:
            joined = f"{curr} {next_narrative}"
        # The whole sentence first, then whatever stood in the middle of it
        return [joined, *interleaved_items], j + 1

    def one_round(blocks: list[str]) -> list[str]:
        stitched_blocks: list[str] = []
        i = 0
        while i < len(blocks):
            curr = blocks[i]

            # A photo credit inside a paragraph hides the half sentence it cut, so the paragraph is
            # tried without its credits first. The credits move out only when that lets the sentence
            # join again; a paragraph that joins nothing keeps every line where the page had it.
            plans: list[tuple[str, list[str]]] = [(curr, [])]
            if not curr.startswith(("#", ">", "![", "|")):
                prose, credits = lift_credits(curr)
                if credits:
                    plans.insert(0, (prose, credits))

            for candidate, credits in plans:
                result = try_to_join(blocks, i, candidate, credits)
                if result:
                    written, i = result
                    stitched_blocks.extend(written)
                    break
            else:
                stitched_blocks.append(curr)
                i += 1

        return stitched_blocks

    # One sentence can be cut into three or more parts, so the round runs again until nothing joins.
    for _ in range(MAX_ROUNDS):
        joined_blocks = one_round(blocks)
        if joined_blocks == blocks:
            break
        blocks = joined_blocks

    return "\n\n".join(blocks)
