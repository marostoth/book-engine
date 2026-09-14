"""Deterministic readability calculator for Level 1 Elementary Reading."""

from __future__ import annotations
import math
import re
from typing import List

from ingest.models import ElementaryMetrics

SENTENCE_SPLIT_REGEX = re.compile(r"(?<=[.!?])\s+")
WORD_REGEX = re.compile(r"\b[a-zA-Z0-9'-]+\b")
VOWELS_REGEX = re.compile(r"[aeiouy]+")


def count_syllables(word: str) -> int:
    """Deterministically count syllables in an English word without external dependencies."""
    w = word.lower().strip()
    w = re.sub(r"[^a-z]", "", w)
    if not w:
        return 0
    if len(w) <= 3:
        return 1

    # Count vowel clusters
    matches = VOWELS_REGEX.findall(w)
    count = len(matches)

    # Adjust for silent endings
    if w.endswith("e") and not w.endswith("ee"):
        # words ending in -le preceded by a consonant keep the syllable (e.g. 'table')
        if len(w) >= 3 and w[-2] == "l" and w[-3] not in "aeiouy":
            pass
        else:
            count -= 1
    elif w.endswith("ed") and not w.endswith("ded") and not w.endswith("ted"):
        count -= 1
    elif w.endswith("es") and not any(w.endswith(s) for s in ("ses", "zes", "shes", "ches", "xes")):
        count -= 1

    return max(1, count)


def tokenize_sentences(text: str) -> List[str]:
    """Split text into sentence candidates based on standard punctuation terminators."""
    raw_sentences = SENTENCE_SPLIT_REGEX.split(text.strip())
    return [s.strip() for s in raw_sentences if s.strip()]


def compute_elementary_metrics(text: str, wpm: int = 200) -> ElementaryMetrics:
    """Compute Flesch-Kincaid Grade Level, average sentence length, and reading time.

    Formula:
        FKGL = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
    """
    cleaned_text = text.strip()
    if not cleaned_text:
        return ElementaryMetrics(
            flesch_kincaid_grade=0.0,
            avg_sentence_length_words=0.0,
            estimated_reading_minutes=0,
        )

    words = WORD_REGEX.findall(cleaned_text)
    total_words = len(words)
    if total_words == 0:
        return ElementaryMetrics(
            flesch_kincaid_grade=0.0,
            avg_sentence_length_words=0.0,
            estimated_reading_minutes=0,
        )

    sentences = tokenize_sentences(cleaned_text)
    total_sentences = max(1, len(sentences))

    total_syllables = sum(count_syllables(w) for w in words)

    asl = total_words / total_sentences
    asw = total_syllables / total_words

    fkgl = (0.39 * asl) + (11.8 * asw) - 15.59
    bounded_fkgl = round(max(0.0, fkgl), 2)

    reading_minutes = max(1, math.ceil(total_words / wpm))

    return ElementaryMetrics(
        flesch_kincaid_grade=bounded_fkgl,
        avg_sentence_length_words=round(asl, 2),
        estimated_reading_minutes=reading_minutes,
    )
