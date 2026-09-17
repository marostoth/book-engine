"""Cloze (fill-in) cards: a sentence of the book with one term left out (LE-07).

The old rules also left out small words ("It is by", from "by means of"), bare numbers ("9-1") and terms that the
rest of the sentence still showed. They made cards from tables, showed Markdown and HTML marks in the prompt, and
left most chapters of some books without a card. Now:

- A card comes from a sentence of plain text: a paragraph, a list item or a quote line. A table gives no card, and
  neither does a sentence with an HTML tag, a link, an image, a brace, a broken character, no small letter (a
  heading) or no sentence end.
- The answer is a marked term: bold, "X is defined as", a quoted term, or "the role of X is". A leading "the", "a"
  or "an" stays outside the blank. The answer has 3 to 50 characters, holds a letter and no marks, does not end
  with a digit (a label such as "Table 13.2"), and neither starts nor ends with a small word (STOPWORDS).
- The prompt is the sentence as the reader shows it: no Markdown marks, no footnote marks, single spaces. The answer
  shows in it only as the blank.
- A chapter that has such sentences but no marked term gets one card for a term of 2 or 3 words that it repeats.
- Nothing is invented. The answer is text of the chapter, byte for byte, after Windows line endings become "\\n".
  The exact source is too, where a line break inside a paragraph counts as a space, as the reader shows it.

`.agent/skills/audit-practice.py` checks every cloze card of a deck with the same rules.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Dict, List, Optional, Set, Tuple

from ingest.anchors import extract_anchors
from ingest.markdown_text import unescape_markdown_text
from ingest.models import PracticeCard
from ingest.salience import ABBREVIATIONS, SENTENCE_SPLIT_REGEX, score_sentence

# Small words. An answer needs another word, and it neither starts nor ends with one of these.
STOPWORDS = frozenset(
    """
    a about above across after again against all along also although am among an and any are around as at be because
    been before behind being below beside besides between beyond both but by can could did do does doing down during
    each either else even ever every few for from further had has have having he hence her here hers herself him
    himself his how however i if in inside into is it its itself just may me might more most much must my myself
    near neither no nor not now of off on once only onto or other otherwise our ours ourselves out outside over own
    per rather same shall she should since so some such than that the their theirs them themselves then there
    therefore these they this those though through thus to too toward towards under unless until up upon us very via
    was we were what whatever when where whether which while who whom whose why will with within without would yet
    you your yours yourself yourselves
    """.split()
)
# Words that are common in every book, so a repeated run of words that holds one is no key term of a chapter.
COMMON_WORDS = frozenset(
    """
    ago another based book chapter different eight eighteen eighty eleven fifteen fifty figure first five forty four
    fourteen get gets give given gives go goes going gone got great greater hundred last made make makes many million
    nine nineteen ninety one page part parts second section seven seventeen seventy several six sixteen sixty still
    table take taken takes ten third thirteen thirty thousand three thing things time times twelve twenty two way
    ways whole year years
    """.split()
)
MIN_ANSWER_CHARS = 3
MAX_ANSWER_CHARS = 50

WORD = re.compile(r"[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*")
LEADING_ARTICLE = re.compile(r"(?:the|a|an)\s+(?=\S)", re.IGNORECASE)
FOOTNOTE_MARK = re.compile(r"\[\^[^\]\s]+\]")
MARKDOWN_MARK = re.compile(r"[*_`]")
HTML_TAG = re.compile(r"</?[A-Za-z][^>]*>")
LINK_OR_IMAGE = re.compile(r"\[[^\]]*\]\([^)]*\)")
# A sentence ends with . ! or ?, maybe followed by a closing quote or bracket.
SENTENCE_END = re.compile(r"[.!?][\"'”’)\]]*$")
LIST_MARKER = re.compile(r"\s*(?:[-*+]|\d+[.)])\s+")
QUOTE_MARKER = re.compile(r"\s*>\s?")

# The marked terms, in the order in which a sentence is searched. Each gives the span of a possible answer.
BOLD_TERM = re.compile(r"(?<!\*)\*\*(?=[^\s*])([^*]+?)(?<=[^\s*])\*\*(?!\*)")
DEFINED_TERM = re.compile(
    r"^([A-Z][a-zA-Z0-9_\s'-]{2,40}?)\s+(?:is defined as|refers to|means|denotes|is characterized by|is considered)\b"
)
QUOTED_TERM = re.compile(r'"([a-zA-Z0-9_\s\'-]{3,40})"')
ROLE_TERM = re.compile(
    r"\b(?:purpose of|principle of|concept of|role of)\s+([a-zA-Z0-9_\s'-]{3,35})\s+(?:is|are)\b", re.IGNORECASE
)


def exact_text(markdown: str) -> str:
    """Chapter text for the byte-for-byte check: "\\n" line endings, and a line break inside a paragraph as a space."""
    text = markdown.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"(?<!\n)\n(?!\n)", " ", text)


def shown_text(text: str) -> str:
    """Text as a card shows it: no footnote marks, no Markdown marks * _ `, the book's < and &, single spaces."""
    text = MARKDOWN_MARK.sub("", FOOTNOTE_MARK.sub("", text))
    return re.sub(r"\s+", " ", unescape_markdown_text(text))


def text_units(block: str) -> List[str]:
    """The plain text of a paragraph block, with line breaks as spaces: the paragraph, or each list item or quote line.

    Tables, code, HTML, images and footnote texts give none.
    """
    if block.lstrip().startswith(("|", "```", "~~~", "<", "![")) or re.match(r"\s*\[\^[^\]]+\]:", block):
        return []
    lines = block.split("\n")
    if not (LIST_MARKER.match(lines[0]) or QUOTE_MARKER.match(lines[0])):
        return [" ".join(lines)]
    units: List[List[str]] = []
    for line in lines:
        marker = LIST_MARKER.match(line) or QUOTE_MARKER.match(line)
        if marker or not units:
            units.append([line[marker.end():] if marker else line])
        else:
            units[-1].append(line)
    return [" ".join(unit) for unit in units]


def exact_sentences(text: str) -> List[str]:
    """The sentences of a text, split as `split_sentences` splits them, but each one exactly as the text has it."""
    spans: List[Tuple[int, int]] = []
    start = 0
    for match in [*SENTENCE_SPLIT_REGEX.finditer(text), None]:
        end = match.start() if match else len(text)
        piece = text[start:end]
        if piece.strip():
            left, right = start + len(piece) - len(piece.lstrip()), start + len(piece.rstrip())
            if spans and text[spans[-1][0]:spans[-1][1]].lower().endswith(ABBREVIATIONS):
                spans[-1] = (spans[-1][0], right)
            else:
                spans.append((left, right))
        if match:
            start = match.end()
    return [text[left:right] for left, right in spans]


def sentence_problem(sentence: str) -> Optional[str]:
    """Why a sentence cannot be a card, or None."""
    if HTML_TAG.search(sentence):
        return "it holds an HTML tag"
    if LINK_OR_IMAGE.search(sentence):
        return "it holds a link or an image"
    if re.search(r"[\ufffd|{}]|\^p-", sentence):
        return "it holds a broken character, a table mark, a brace or an anchor"
    if re.search(r"[A-Z]", sentence) and not re.search(r"[a-z]", sentence):
        return "it is in capital letters, like a heading"
    if not SENTENCE_END.search(shown_text(sentence).strip()):
        return "it has no sentence end"
    return None


def answer_problem(answer: str) -> Optional[str]:
    """Why a text cannot be the answer of a card, or None."""
    words = WORD.findall(answer)
    if not MIN_ANSWER_CHARS <= len(answer) <= MAX_ANSWER_CHARS:
        return f"not {MIN_ANSWER_CHARS} to {MAX_ANSWER_CHARS} characters long"
    if not re.search(r"[A-Za-z]", answer) or re.search(r"\d$", answer):
        return "a number or a label such as Table 13.2, not a term"
    if answer != " ".join(answer.split()) or re.search(r"[*_`\[\]{}<>|^#:;]|&(?:lt|amp);", answer):
        return "text with marks or extra spaces"
    if re.match(r"\W", answer) or re.search(r"[.,!?]$", answer):
        return "text that starts or ends with a punctuation mark"
    if not words or all(word.lower() in STOPWORDS for word in words):
        return "only small words"
    if words[0].lower() in STOPWORDS or words[-1].lower() in STOPWORDS:
        return "text that starts or ends with a small word"
    return None


def shows_answer(text: str, answer: str) -> bool:
    """True when the answer stands in the text as a whole term, in any case."""
    return re.search(r"(?<!\w)" + re.escape(answer) + r"(?!\w)", text, re.IGNORECASE) is not None


def cloze_prompt(
    sentence: str, start: int, end: int, chapter_lines: Optional[str] = None
) -> Optional[Tuple[str, str]]:
    """(prompt, answer) for the term at sentence[start:end], or None when the answer or the prompt breaks a rule.

    With `chapter_lines` (the chapter with "\\n" line endings), the answer must also be text of it byte for byte. A term
    that a line break splits in the chapter file is then no answer, and the next term is tried.
    """
    article = LEADING_ARTICLE.match(sentence, start, end)
    if article:
        start = article.end()
    answer = sentence[start:end]
    before, after = shown_text(sentence[:start]), shown_text(sentence[end:])
    if answer_problem(answer) or shows_answer(f"{before} {after}", answer):
        return None
    if chapter_lines is not None and answer not in chapter_lines:
        return None
    return f"{before}{{{{c1::{answer}}}}}{after}".strip(), answer


def marked_term_spans(sentence: str) -> List[Tuple[int, int]]:
    """The spans of the marked terms of a sentence: bold terms, then a defined term, a quoted term and a role term."""
    spans: List[Tuple[int, int]] = []
    for match in BOLD_TERM.finditer(sentence):
        inner = match.group(1)
        left = match.start(1) + len(inner) - len(inner.lstrip("_ "))
        spans.append((left, max(left, match.start(1) + len(inner.rstrip("_ ")))))
    for rule in (DEFINED_TERM, QUOTED_TERM, ROLE_TERM):
        found = rule.search(sentence)
        if found:
            inner = found.group(1)
            left = found.start(1) + len(inner) - len(inner.lstrip())
            spans.append((left, found.start(1) + len(inner.rstrip())))
    return spans


def extract_cloze_target(sentence: str, chapter_lines: Optional[str] = None) -> Optional[Tuple[str, str]]:
    """(prompt, answer) for the first marked term of a sentence that makes a card, or None."""
    if sentence_problem(sentence):
        return None
    for start, end in marked_term_spans(sentence):
        target = cloze_prompt(sentence, start, end, chapter_lines)
        if target:
            return target
    return None


def chapter_sentences(chapter_markdown: str) -> List[Tuple[str, str, float]]:
    """(anchor, sentence, salience score) for every sentence of the chapter that can be a card, in chapter order."""
    found: List[Tuple[str, str, float]] = []
    for anchor_id, block in extract_anchors(chapter_markdown.replace("\r\n", "\n").replace("\r", "\n")):
        for unit in text_units(block):
            sentences = exact_sentences(unit)
            for index, sentence in enumerate(sentences):
                if not sentence_problem(sentence):
                    found.append((anchor_id, sentence, score_sentence(sentence, index == 0, index == len(sentences) - 1)))
    return found


def repeated_term_card(
    sentences: List[Tuple[str, str, float]], chapter_lines: Optional[str] = None
) -> Optional[Tuple[str, str, str, str, float]]:
    """(anchor, prompt, answer, sentence, score) for the most repeated term of a chapter, or None.

    A term is 2 or 3 words in a row, with no small word, no common word and no mark between them. One word alone is
    too plain to be a key term. A term of more words counts more. The card comes from the sentence with the best
    salience score that holds the term once.
    """
    counts: Counter[str] = Counter()
    first_seen: Dict[str, int] = {}
    for _, sentence, _ in sentences:
        for run in re.split(r"[^\w'’ -]+|(?<!\w)-|-(?!\w)", shown_text(sentence)):
            words = run.split()
            for size in (2, 3):
                for index in range(len(words) - size + 1):
                    if any(word.lower() in STOPWORDS or word.lower() in COMMON_WORDS for word in words[index:index + size]):
                        continue
                    term = " ".join(words[index:index + size]).lower()
                    counts[term] += 1
                    first_seen.setdefault(term, len(first_seen))
    ranked = sorted(
        (term for term, count in counts.items() if count >= 2 and not answer_problem(term)),
        key=lambda term: (-counts[term] * len(term.split()) ** 2, first_seen[term]),
    )
    best_first = sorted(range(len(sentences)), key=lambda index: (-sentences[index][2], index))
    for term in ranked[:20]:
        whole_term = re.compile(r"(?<![\w'’-])" + re.escape(term) + r"(?![\w'’-])", re.IGNORECASE)
        for index in best_first:
            anchor_id, sentence, score = sentences[index]
            matches = list(whole_term.finditer(sentence))
            target = cloze_prompt(sentence, matches[0].start(), matches[0].end(), chapter_lines) if len(matches) == 1 else None
            if target:
                return anchor_id, target[0], target[1], sentence, score
    return None


def generate_chapter_practice_cards(
    chapter_id: str,
    chapter_markdown: str,
    min_items: int = 5,
    max_items: int = 8,
) -> List[PracticeCard]:
    """Up to `max_items` cloze cards for a chapter, and one card for a chapter that has sentences but no marked term.

    Every answer and exact source is checked against the chapter text before it is used.
    """
    line_text = chapter_markdown.replace("\r\n", "\n").replace("\r", "\n")
    joined_text = exact_text(chapter_markdown)
    sentences = chapter_sentences(chapter_markdown)
    candidates: List[Tuple[float, str, str, str, str]] = []  # (score, prompt, answer, sentence, anchor)
    seen_answers: Set[str] = set()

    for anchor_id, sentence, score in sentences:
        target = extract_cloze_target(sentence, line_text)
        if not target or target[1].lower() in seen_answers:
            continue
        prompt, answer = target
        if answer not in line_text or sentence not in joined_text:
            continue
        candidates.append((score, prompt, answer, sentence, anchor_id))
        seen_answers.add(answer.lower())

    candidates.sort(key=lambda candidate: candidate[0], reverse=True)
    selected = candidates[:max_items]
    if not selected:
        repeated = repeated_term_card(sentences, line_text)
        if repeated and repeated[2] in line_text and repeated[3] in joined_text:
            anchor_id, prompt, answer, sentence, score = repeated
            selected = [(score, prompt, answer, sentence, anchor_id)]

    return [
        PracticeCard(
            card_id=f"card-{chapter_id}-{index:03d}",
            chapter_id=chapter_id,
            anchor_id=anchor_id,
            cloze_text=prompt,
            answer_key=answer,
            exact_source=sentence,
            score=round(score, 2),
        )
        for index, (score, prompt, answer, sentence, anchor_id) in enumerate(selected, start=1)
    ]
