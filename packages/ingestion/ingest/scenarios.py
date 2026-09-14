"""Autonomous deductive Scenario (MCQ) extraction engine.

Extracts authentic multi-sentence scenario premises, pairs them with plausible
thematic co-domain distractors and verbatim anchor rationales. Strictly
zero-hallucination and extractive.
"""

from __future__ import annotations

import re
from typing import List, Set, Tuple
from ingest.models import ScenarioCard, ScenarioOptionModel
from ingest.anchors import extract_anchors
from ingest.salience import split_sentences, score_sentence

NARRATIVE_STORY_REGEX = re.compile(
    r"\b(?:got up at|woke up|drank|chewed on|stared at|glanced over|picked up|put his hand|"
    r"retired cattle rancher|went to his study|chewed on the end of a pencil|"
    r"said to himself|thought to himself|he wondered|she wondered|yesterday morning|"
    r"one morning|last night|last week|on his quote equipment|turned on his|sat and watched|"
    r"sank deeper into his chair|in less than five minutes|called and commented|"
    r"auction off his livestock|ranching days)\b",
    re.IGNORECASE,
)

STOPWORDS = {
    "this", "that", "these", "those", "with", "from", "have", "were", "been",
    "their", "which", "about", "would", "could", "should", "there", "where",
    "when", "what", "some", "other", "more", "most", "only", "also", "into",
    "than", "then", "they", "them", "will", "just", "like", "such", "each",
    "very", "much", "does", "did", "doing", "done", "your", "ours", "our",
}


def _extract_keywords(text: str) -> Set[str]:
    """Extracts non-stopword tokens of length >= 4 for thematic overlap scoring."""
    words = re.findall(r"[a-zA-Z]{4,}", text.lower())
    return {w for w in words if w not in STOPWORDS}


def generate_chapter_scenario_cards(
    chapter_markdown: str,
    chapter_id: str,
    max_items: int = 3,
) -> List[ScenarioCard]:
    """Deterministically extracts contextual deductive multiple-choice Scenario items from chapter text."""
    anchored_paras = extract_anchors(chapter_markdown)
    if not anchored_paras:
        return []

    # 1. Build distractor candidate pool from non-narrative sentences
    distractor_pool: List[Tuple[str, str, str, Set[str]]] = []
    seen_pool_texts: Set[str] = set()

    for anchor_id, para_text in anchored_paras:
        if NARRATIVE_STORY_REGEX.search(para_text):
            continue
        sentences = split_sentences(para_text)
        for s in sentences:
            clean = re.sub(r"[*`_#]", "", s).strip()
            if len(clean) < 35 or len(clean) > 240 or "|" in clean or "```" in clean:
                continue
            if clean.endswith("?") or clean.lower() in seen_pool_texts:
                continue
            distractor_pool.append((clean, s, anchor_id, _extract_keywords(clean)))
            seen_pool_texts.add(clean.lower())

    # 2. Extract candidate target paragraphs (prioritizing multi-sentence analytical paragraphs)
    target_candidates: List[Tuple[float, str, str, str, str, Set[str]]] = []
    single_sentence_fallbacks: List[Tuple[float, str, str, str, str, Set[str]]] = []

    for anchor_id, para_text in anchored_paras:
        if NARRATIVE_STORY_REGEX.search(para_text):
            continue
        sentences = split_sentences(para_text)
        if not sentences:
            continue

        if len(sentences) >= 2:
            target_s = sentences[-1]
            target_clean = re.sub(r"[*`_#]", "", target_s).strip()
            if len(target_clean) < 35 or len(target_clean) > 240 or target_clean.endswith("?"):
                continue
            premise = " ".join(s.strip() for s in sentences[:-1])
            premise_clean = re.sub(r"[*`_#]", "", premise).strip()
            if len(premise_clean) < 40 or len(premise_clean) > 550:
                continue
            base_score = score_sentence(target_s, False, True)
            if re.search(r"\b(therefore|thus|however|consequently|because|requires|means|process|market|level|skill)\b", target_clean, re.I):
                base_score += 2.0
            kw = _extract_keywords(target_clean) | _extract_keywords(premise_clean)
            target_candidates.append((base_score, premise_clean, target_clean, target_s, anchor_id, kw))
        else:
            # Single-sentence paragraph fallback
            s = sentences[0]
            clean = re.sub(r"[*`_#]", "", s).strip()
            if len(clean) < 35 or len(clean) > 240 or clean.endswith("?"):
                continue
            base_score = score_sentence(s, True, True)
            single_sentence_fallbacks.append((base_score, "", clean, s, anchor_id, _extract_keywords(clean)))

    # If we have fewer multi-sentence candidates than requested, backfill from single-sentence fallbacks
    if len(target_candidates) < max_items:
        single_sentence_fallbacks.sort(key=lambda x: x[0], reverse=True)
        target_candidates.extend(single_sentence_fallbacks)

    if not target_candidates:
        return []

    # Sort descending by analytical salience
    target_candidates.sort(key=lambda x: x[0], reverse=True)

    scenarios: List[ScenarioCard] = []
    used_anchors: Set[str] = set()
    used_distractors: Set[str] = set()

    for score, premise, target_clean, target_s, anchor_id, target_kw in target_candidates:
        if len(scenarios) >= max_items:
            break
        if anchor_id in used_anchors:
            continue

        # Score candidate distractors by thematic keyword overlap and length ratio
        scored_distractors: List[Tuple[int, float, str, str]] = []
        target_len = len(target_clean)

        for d_clean, d_s, d_anc, d_kw in distractor_pool:
            if d_anc == anchor_id or d_clean == target_clean or d_clean in used_distractors:
                continue
            d_len = len(d_clean)
            if d_len < 0.4 * target_len or d_len > 2.5 * target_len:
                continue
            overlap = len(target_kw & d_kw)
            sal = score_sentence(d_s, False, False)
            scored_distractors.append((overlap, sal, d_clean, d_anc))

        scored_distractors.sort(key=lambda x: (x[0], x[1]), reverse=True)
        if len(scored_distractors) < 3:
            continue

        # Pick top 3 distractors from distinct anchors
        picked_distractors: List[str] = []
        picked_ancs: Set[str] = set()
        for ov, sal, d_clean, d_anc in scored_distractors:
            if d_anc not in picked_ancs:
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
        if premise:
            used_distractors.add(premise)

        correct_idx = len(scenarios) % 4
        all_opts = list(picked_distractors)
        all_opts.insert(correct_idx, target_clean)

        options = [
            ScenarioOptionModel(key=chr(ord("A") + i), text=t, is_correct=(i == correct_idx))
            for i, t in enumerate(all_opts)
        ]

        if premise:
            scenario_text = (
                f"Consider the following excerpt from this section:\n"
                f'"{premise}"\n\n'
                f"Which of the following statements represents the analytically valid conclusion?"
            )
        else:
            scenario_text = (
                "In the context of the author's analysis in this section, "
                "which of the following statements represents the analytically valid conclusion?"
            )

        sc = ScenarioCard(
            card_id=f"sc-{chapter_id}-{len(scenarios) + 1:03d}",
            chapter_id=chapter_id,
            anchor_id=anchor_id,
            scenario=scenario_text,
            options=options,
            rationale=f'In this section, the text states: "{target_s.strip()}"',
        )
        scenarios.append(sc)

    return scenarios
