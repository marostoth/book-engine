"""Quiz (scenario) cards that ask which sentence comes next.

A card quotes a passage: every sentence of a paragraph but the last. It asks which sentence comes right after that
passage in the book. The right option is the last sentence of the paragraph. The wrong options are sentences of
other paragraphs of the same chapter, so they are about the same subject. They can be true, but they do not come
right after the passage, and that is what the card asks. The old cards asked for "the analytically valid
conclusion", so a true sentence counted as wrong (LE-06).

Every option is a sentence of the chapter without its Markdown marks, and the generator checks this against the
chapter before it uses a sentence. Nothing is invented.
"""

from __future__ import annotations

import hashlib
import re
from difflib import SequenceMatcher

from ingest.anchors import extract_anchors
from ingest.models import ScenarioCard, ScenarioOptionModel
from ingest.salience import score_sentence, split_sentences

# The question of every quiz card. `.agent/skills/audit-practice.py` checks it.
NEXT_SENTENCE_QUESTION = "Which sentence comes right after this passage in the book?"

# Two sentences at least this alike (difflib ratio) say much the same thing, so one is no fair wrong option next to
# the other. In the Kotler deck, a margin definition repeats its sentence of the main text at 0.65 to 0.97.
NEAR_COPY_RATIO = 0.65

# A sentence ends with . ! or ?, maybe followed by a closing quote or bracket. Text that an import cut off, or that ends
# with an image link or a footnote mark, is no sentence, so it is no option.
SENTENCE_END = re.compile(r"[.!?][\"'”’)\]]*$")

# A story of a book tells what one person did. Its next sentence is the next thing that happened, which no
# reader can work out from the passage, so a paragraph that tells a story makes no quiz card.
#
# Two things must both be true, and neither is enough on its own. The phrases alone called 13 paragraphs of
# Principles of Marketing and The Wealth of Nations a story, where a story a newspaper "picked up" and wine
# "drank in Great Britain" are not stories at all. Being about one person alone called 190 paragraphs of The
# Wealth of Nations a story. Six of the phrases also named the trade, the animals and the tools of the one
# person in one book, so no other book could ever hold them (IN-10).
NARRATIVE_PHRASE = re.compile(
    r"\b(?:got up at|woke up|drank|chewed on|stared at|glanced over|picked up|put his hand|"
    r"went to his study|said to himself|thought to himself|he wondered|she wondered|yesterday morning|"
    r"one morning|last night|last week|turned on his|sat and watched|in less than five minutes|"
    r"called and commented)\b",
    re.IGNORECASE,
)

# One person doing something. "they" is left out, because a book uses it for a company and for people in
# general as well as for a person.
ONE_PERSON = re.compile(r"\b(?:he|his|him|himself|she|her|hers|herself)\b", re.IGNORECASE)

# How thick with one person a story is. Every story paragraph of Mind Over Markets holds at least 3 such words
# in every 100; the most any wrongly named paragraph of the other books holds is under 3.
PEOPLE_IN_A_HUNDRED_WORDS = 3

STOPWORDS = {
    "this",
    "that",
    "these",
    "those",
    "with",
    "from",
    "have",
    "were",
    "been",
    "their",
    "which",
    "about",
    "would",
    "could",
    "should",
    "there",
    "where",
    "when",
    "what",
    "some",
    "other",
    "more",
    "most",
    "only",
    "also",
    "into",
    "than",
    "then",
    "they",
    "them",
    "will",
    "just",
    "like",
    "such",
    "each",
    "very",
    "much",
    "does",
    "did",
    "doing",
    "done",
    "your",
    "ours",
    "our",
}


def tells_a_story(block: str) -> bool:
    """True when the paragraph tells what one person did, so it makes no quiz card (IN-10).

    It must both say something only a story says and be about one person all through. A textbook that says
    a campaign was "picked up by the media" says one of those things and not the other, so it keeps its card.
    """
    if not NARRATIVE_PHRASE.search(block):
        return False
    words = len(block.split())
    return bool(words) and len(ONE_PERSON.findall(block)) * 100 >= words * PEOPLE_IN_A_HUNDRED_WORDS


def book_text(text: str) -> str:
    """Text as a quiz card shows it: without the Markdown marks * ` _ # and with single spaces."""
    return re.sub(r"\s+", " ", re.sub(r"[*`_#]", "", text)).strip()


def is_near_copy(first: str, second: str) -> bool:
    """True when two sentences say much the same thing: one holds the other, or they are NEAR_COPY_RATIO alike."""
    a, b = first.lower(), second.lower()
    if a in b or b in a:
        return True
    ratio = max(
        SequenceMatcher(None, a, b, autojunk=False).ratio(),
        SequenceMatcher(None, b, a, autojunk=False).ratio(),
    )
    return ratio >= NEAR_COPY_RATIO


def answer_place(card_id: str, answer: str) -> int:
    """The place of the right option, 0 to 3 for A to D. A hash gives it, so every import puts the right option of a
    card in the same place, and the places of a deck spread over A to D."""
    digest = hashlib.sha256(f"{card_id}\x1f{answer}".encode()).digest()
    return int.from_bytes(digest[:8], "big") % 4


def _extract_keywords(text: str) -> set[str]:
    """Extracts non-stopword tokens of length >= 4 for thematic overlap scoring."""
    words = re.findall(r"[a-zA-Z]{4,}", text.lower())
    return {w for w in words if w not in STOPWORDS}


def generate_chapter_scenario_cards(
    chapter_markdown: str,
    chapter_id: str,
    max_items: int = 3,
) -> list[ScenarioCard]:
    """Makes up to `max_items` quiz cards for a chapter. Each asks which sentence comes right after its passage."""
    anchored_paras = extract_anchors(chapter_markdown)
    if not anchored_paras:
        return []

    chapter_text = book_text(chapter_markdown)
    # The anchor of the paragraph right after each paragraph. Its sentences come soon after a passage, so none of
    # them is a wrong option for that passage.
    next_anchor: dict[str, str] = {
        anchor_id: anchored_paras[index + 1][0] for index, (anchor_id, _) in enumerate(anchored_paras[:-1])
    }

    # 1. Wrong options: sentences of the chapter that are not part of a story
    distractor_pool: list[tuple[str, str, str, set[str]]] = []
    seen_pool_texts: set[str] = set()

    for anchor_id, para_text in anchored_paras:
        if tells_a_story(para_text):
            continue
        sentences = split_sentences(para_text)
        for s in sentences:
            clean = book_text(s)
            if len(clean) < 35 or len(clean) > 240 or "|" in clean or "```" in clean:
                continue
            if clean.endswith("?") or clean.lower() in seen_pool_texts:
                continue
            if not SENTENCE_END.search(clean) or clean not in chapter_text:
                continue
            distractor_pool.append((clean, s, anchor_id, _extract_keywords(clean)))
            seen_pool_texts.add(clean.lower())

    # 2. Passages: paragraphs of two or more sentences. A paragraph of one sentence has no passage, so it makes no card.
    target_candidates: list[tuple[float, str, str, str, str, set[str]]] = []

    for anchor_id, para_text in anchored_paras:
        if tells_a_story(para_text):
            continue
        sentences = split_sentences(para_text)
        if len(sentences) < 2:
            continue

        target_s = sentences[-1]
        target_clean = book_text(target_s)
        if len(target_clean) < 35 or len(target_clean) > 240 or target_clean.endswith("?"):
            continue
        if not SENTENCE_END.search(target_clean):
            continue
        premise_clean = book_text(" ".join(s.strip() for s in sentences[:-1]))
        if len(premise_clean) < 40 or len(premise_clean) > 550:
            continue
        # The passage and its next sentence must stand in the chapter as the card shows them.
        if f"{premise_clean} {target_clean}" not in chapter_text:
            continue
        base_score = score_sentence(target_s, False, True)
        if re.search(
            r"\b(therefore|thus|however|consequently|because|requires|means|process|market|level|skill)\b",
            target_clean,
            re.I,
        ):
            base_score += 2.0
        kw = _extract_keywords(target_clean) | _extract_keywords(premise_clean)
        target_candidates.append((base_score, premise_clean, target_clean, target_s, anchor_id, kw))

    if not target_candidates:
        return []

    # Sort descending by analytical salience
    target_candidates.sort(key=lambda x: x[0], reverse=True)

    scenarios: list[ScenarioCard] = []
    used_anchors: set[str] = set()
    used_distractors: set[str] = set()

    for _score, premise, target_clean, target_s, anchor_id, target_kw in target_candidates:
        if len(scenarios) >= max_items:
            break
        if anchor_id in used_anchors:
            continue

        # Score candidate distractors by thematic keyword overlap and length ratio
        scored_distractors: list[tuple[int, float, str, str]] = []
        target_len = len(target_clean)

        for d_clean, d_s, d_anc, d_kw in distractor_pool:
            if d_anc in (anchor_id, next_anchor.get(anchor_id)) or d_clean in used_distractors:
                continue
            d_len = len(d_clean)
            if d_len < 0.4 * target_len or d_len > 2.5 * target_len:
                continue
            overlap = len(target_kw & d_kw)
            sal = score_sentence(d_s, False, False)
            scored_distractors.append((overlap, sal, d_clean, d_anc))

        scored_distractors.sort(key=lambda x: (x[0], x[1]), reverse=True)

        # The 3 best wrong options from different paragraphs. None is a near-copy of the right option or of another
        # wrong option, because a near-copy says the same thing.
        picked_distractors: list[str] = []
        picked_ancs: set[str] = set()
        for _ov, _sal, d_clean, d_anc in scored_distractors:
            if d_anc in picked_ancs:
                continue
            if any(is_near_copy(d_clean, other) for other in [target_clean, *picked_distractors]):
                continue
            picked_distractors.append(d_clean)
            picked_ancs.add(d_anc)
            if len(picked_distractors) == 3:
                break

        if len(picked_distractors) < 3:
            continue

        used_anchors.add(anchor_id)
        for p_d in picked_distractors:
            used_distractors.add(p_d)
        used_distractors.add(target_clean)
        used_distractors.add(premise)

        card_id = f"sc-{chapter_id}-{len(scenarios) + 1:03d}"
        correct_idx = answer_place(card_id, target_clean)
        all_opts = list(picked_distractors)
        all_opts.insert(correct_idx, target_clean)

        options = [
            ScenarioOptionModel(key=chr(ord("A") + i), text=t, is_correct=(i == correct_idx))
            for i, t in enumerate(all_opts)
        ]

        sc = ScenarioCard(
            card_id=card_id,
            chapter_id=chapter_id,
            anchor_id=anchor_id,
            scenario=f'{NEXT_SENTENCE_QUESTION}\n"{premise}"',
            options=options,
            rationale=f'Right after this passage, the book says: "{target_s.strip()}"',
        )
        scenarios.append(sc)

    return scenarios
