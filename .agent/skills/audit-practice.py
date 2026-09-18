#!/usr/bin/env python3
"""Autonomous verification harness for zero-hallucination, extractive verbatim practice cards."""

from __future__ import annotations

import re
import sys
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List, Optional, Tuple

SKILL_DIR = Path(__file__).resolve().parent
ROOT_DIR = SKILL_DIR.parent.parent
sys.path.insert(0, str(ROOT_DIR / "packages" / "ingestion"))

from ingest.console import allow_any_letter  # noqa: E402

VAULT_DIR = ROOT_DIR / "vault"
NOTES_DIR = VAULT_DIR / "notes"
BOOKS_DIR = VAULT_DIR / "books"

# The question of every quiz card, as packages/ingestion/ingest/scenarios.py writes it (LE-06).
NEXT_SENTENCE_QUESTION = "Which sentence comes right after this passage in the book?"
# Two options at least this alike say much the same thing (NEAR_COPY_RATIO in ingest/scenarios.py).
NEAR_COPY_RATIO = 0.65
OPTION_LINE = re.compile(r"^- \[([ xX])\] \(([A-Za-z])\) (.*)$")

# The rules of a cloze card, as packages/ingestion/ingest/cloze.py makes it (LE-07). Small words: an answer needs
# another word, and it neither starts nor ends with one of these.
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
MIN_ANSWER_CHARS = 3
MAX_ANSWER_CHARS = 50
WORD = re.compile(r"[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*")
BLANK = re.compile(r"\{\{c\d+::(.*?)\}\}|==([^=]+)==")
PROMPT_MARKS = re.compile(r"[*_`|]|\[\^|</?[A-Za-z][^>]*>")


def book_text(text: str) -> str:
    """Text as a quiz card shows it: without the Markdown marks * ` _ # and with single spaces."""
    return re.sub(r"\s+", " ", re.sub(r"[*`_#]", "", text)).strip()


def is_near_copy(first: str, second: str) -> bool:
    """True when two options say much the same thing: one holds the other, or they are NEAR_COPY_RATIO alike."""
    a, b = first.lower(), second.lower()
    if a in b or b in a:
        return True
    ratio = max(
        SequenceMatcher(None, a, b, autojunk=False).ratio(),
        SequenceMatcher(None, b, a, autojunk=False).ratio(),
    )
    return ratio >= NEAR_COPY_RATIO


def scenario_stem(block: str) -> str:
    """The text of a quiz card after **Scenario:**, one line per line, up to its options. The app reads it the same way."""
    lines: List[str] = []
    in_stem = False
    for line in block.splitlines():
        stripped = line.strip()
        if stripped.startswith("**Scenario:**"):
            lines.append(stripped[len("**Scenario:**"):].strip())
            in_stem = True
        elif stripped.startswith(("- ", ">", "<!--")):
            in_stem = False
        elif in_stem and stripped and not stripped.startswith("#"):
            lines.append(stripped)
    return "\n".join(lines)


def normalize_ws(s: str) -> str:
    """Collapses consecutive whitespaces and punctuation for robust matching."""
    return re.sub(r"\s+", " ", s).strip()


def exact_chapter_text(text: str) -> str:
    """Chapter text for the byte-for-byte check of an exact source: "\\n" line endings, and a line break inside a
    paragraph as a space, as the reader shows it."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"(?<!\n)\n(?!\n)", " ", text)


def shown_text(text: str) -> str:
    """Text as a cloze card shows it: no footnote marks, no Markdown marks * _ `, the book's < and &, single spaces."""
    text = re.sub(r"[*_`]", "", re.sub(r"\[\^[^\]\s]+\]", "", text))
    return re.sub(r"\s+", " ", text.replace("&lt;", "<").replace("&amp;", "&"))


def answer_problem(answer: str) -> Optional[str]:
    """Why a text cannot be the answer of a cloze card, or None."""
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


def extract_scramble_clauses(text: str) -> List[str]:
    """Extracts scrambled clause components separated by pipes or semicolons."""
    delimiter = "|" if "|" in text else (";" if ";" in text else None)
    if delimiter:
        return [c.strip() for c in text.split(delimiter) if c.strip()]
    return []


class DeckAuditResult:
    """Audit result supporting 4-tuple unpacking for audit-system.py parity."""
    def __init__(
        self, total: int, matches: int, mismatches: int, errors: List[str],
        cloze_count: int = 0, scenario_count: int = 0
    ) -> None:
        self.total = total
        self.matches = matches
        self.mismatches = mismatches
        self.errors = errors
        self.cloze_count = cloze_count
        self.scenario_count = scenario_count

    def __iter__(self):
        return iter((self.total, self.matches, self.mismatches, self.errors))

    def __len__(self) -> int:
        return 4

    def __getitem__(self, index: int):
        return (self.total, self.matches, self.mismatches, self.errors)[index]


def audit_book_practice_deck(deck_path: Path, books_dir: Path) -> DeckAuditResult:
    """Audits a book's practice deck against chapter markdown files."""
    book_id = deck_path.parent.name
    book_dir = books_dir / book_id
    deck_content = deck_path.read_text(encoding="utf-8")

    card_blocks = re.split(r"\n(?=###\s+)", deck_content)
    total_cards = 0
    verbatim_matches = 0
    mismatches = 0
    cloze_count = 0
    scenario_count = 0
    errors: List[str] = []

    for block in card_blocks:
        trimmed = block.strip()
        is_cloze = trimmed.startswith("### card-") or trimmed.startswith("### Card:")
        is_scenario = (
            trimmed.startswith("### Scenario:")
            or trimmed.startswith("### scenario-")
            or trimmed.startswith("### sc-")
        )

        if not is_cloze and not is_scenario:
            continue

        total_cards += 1

        if is_cloze:
            cloze_count += 1
            card_id_m = re.search(r"###\s+(?:Card:\s*)?(card-[a-zA-Z0-9_-]+)", trimmed)
            ch_m = re.search(r"-\s+\*\*Chapter:\*\*\s+([a-zA-Z0-9_-]+)", trimmed)
            anc_m = re.search(r"-\s+\*\*Anchor:\*\*\s+(\^p-[a-zA-Z0-9_-]+)", trimmed)
            ans_m = re.search(r"-\s+\*\*Answer Key:\*\*\s+(`+)([^`\n\r]+)\1", trimmed)
            src_m = re.search(r"-\s+\*\*Exact Source:\*\*\s+(.+)", trimmed)
            cloze_m = re.search(r"-\s+\*\*Cloze:\*\*\s+(.+)", trimmed)
            prompt_m = re.search(r"-\s+\*\*Prompt:\*\*\s+(.+)", trimmed)
            type_m = re.search(r"-\s+\*\*Type:\*\*\s+([a-zA-Z0-9_-]+)", trimmed)
            scramble_m = re.search(r"-\s+\*\*Scramble:\*\*\s+(.+)", trimmed)

            card_id = card_id_m.group(1) if card_id_m else "unknown"
            ch_id = ch_m.group(1) if ch_m else ""
            answer_key = ans_m.group(2).strip() if ans_m else ""
            exact_source = src_m.group(1).strip() if src_m else ""
            cloze_text = cloze_m.group(1).strip() if cloze_m else (prompt_m.group(1).strip() if prompt_m else "")
            item_type = type_m.group(1).strip().lower() if type_m else ("scramble" if scramble_m else "cloze")
            scramble_text = scramble_m.group(1).strip() if scramble_m else (cloze_text if item_type == "scramble" else "")

            ch_filename = f"{ch_id}.md" if not ch_id.endswith(".md") else ch_id
            ch_file = book_dir / ch_filename
            if not ch_file.exists():
                mismatches += 1
                errors.append(f"{card_id}: Source chapter file {ch_filename} not found in {book_dir.name}")
                continue

            ch_content = ch_file.read_text(encoding="utf-8")
            clean_ch_content = re.sub(r"\^p-[a-zA-Z0-9_-]+", "", ch_content)
            norm_clean_ch = normalize_ws(clean_ch_content)
            card_valid = True

            is_scramble = item_type == "scramble" or bool(scramble_text)

            # The card says which paragraph it came from, so the check reads that paragraph and not the whole
            # chapter (TL-04). A card could name one paragraph and take its words from another one, and the audit
            # still called the card grounded. `ingest/salience.py` writes an `Anchor:` line on every cloze card.
            anchor_id = anc_m.group(1) if anc_m else ""
            cited = ch_content
            if not is_scramble:
                if not anchor_id:
                    mismatches += 1
                    errors.append(f"{card_id}: The card names no paragraph of {ch_filename}")
                    continue
                paragraphs = [p for p in ch_content.replace("\r\n", "\n").split("\n\n") if anchor_id in p]
                if not paragraphs:
                    mismatches += 1
                    errors.append(f"{card_id}: Anchor '{anchor_id}' not found in {ch_filename}")
                    continue
                cited = paragraphs[0]

            if item_type == "cloze" or not scramble_text:
                # One blank that holds the answer, an answer that is a term and text of the chapter byte for byte, and
                # a prompt that shows its exact source as the reader shows it, with no marks and no second answer (LE-07).
                blanks = BLANK.findall(cloze_text)
                answer = answer_key or (next((a or b for a, b in blanks), "").strip())
                if not answer:
                    card_valid = False
                    errors.append(f"{card_id}: No cloze target or answer key specified")
                else:
                    if [a or b for a, b in blanks] != [answer]:
                        card_valid = False
                        errors.append(f"{card_id}: The prompt must have one blank, and the blank must hold the answer key")
                    if answer not in cited:
                        card_valid = False
                        errors.append(
                            f"{card_id}: Answer key '{answer}' is not text of {ch_filename}#{anchor_id} byte for byte"
                        )
                    problem = answer_problem(answer)
                    if problem:
                        card_valid = False
                        errors.append(f"{card_id}: The answer '{answer}' is {problem}")
                    outside = BLANK.sub(" ", cloze_text)
                    if PROMPT_MARKS.search(outside):
                        card_valid = False
                        errors.append(f"{card_id}: The prompt shows Markdown, footnote, table or HTML marks")
                    if shows_answer(outside, answer):
                        card_valid = False
                        errors.append(f"{card_id}: The prompt shows the answer outside the blank")
                    filled = BLANK.sub(lambda m: m.group(1) if m.group(1) is not None else m.group(2), cloze_text)
                    if exact_source and not is_scramble and " ".join(filled.split()) != " ".join(shown_text(exact_source).split()):
                        card_valid = False
                        errors.append(f"{card_id}: The prompt does not show its exact source as the reader shows it")

            if is_scramble:
                clauses = extract_scramble_clauses(scramble_text) or extract_scramble_clauses(answer_key)
                for clause in clauses:
                    if normalize_ws(clause) not in norm_clean_ch and clause not in ch_content:
                        card_valid = False
                        errors.append(f"{card_id}: Scramble clause '{clause}' is not in {ch_filename}")
                if exact_source and normalize_ws(exact_source) not in norm_clean_ch and exact_source not in ch_content:
                    card_valid = False
                    errors.append(f"{card_id}: Exact source '{exact_source[:40]}...' is not in {ch_filename}")
            elif exact_source and exact_source not in exact_chapter_text(cited):
                card_valid = False
                errors.append(
                    f"{card_id}: Exact source '{exact_source[:40]}...' is not text of "
                    f"{ch_filename}#{anchor_id} byte for byte"
                )

            if card_valid:
                verbatim_matches += 1
            else:
                mismatches += 1

        else:
            scenario_count += 1
            card_id_m = re.search(r"###\s+(?:Scenario:?|scenario-?|sc-)\s*([a-zA-Z0-9_-]+)", trimmed)
            card_id = card_id_m.group(1) if card_id_m else "unknown-scenario"

            cit_m = re.search(r"<!--\s*citation:\s*([a-zA-Z0-9._-]+)#(\^p-[a-zA-Z0-9_-]+)\s*-->", trimmed)
            if cit_m:
                ch_id, anchor_id = cit_m.group(1), cit_m.group(2)
            else:
                ch_m = re.search(r"-\s+\*\*Chapter:\*\*\s+([a-zA-Z0-9._-]+)", trimmed)
                anc_m = re.search(r"-\s+\*\*Anchor:\*\*\s+(\^p-[a-zA-Z0-9_-]+)", trimmed)
                ch_id = ch_m.group(1) if ch_m else ""
                anchor_id = anc_m.group(1) if anc_m else ""

            if not ch_id or not anchor_id:
                mismatches += 1
                errors.append(f"{card_id}: Missing chapter file or anchor citation")
                continue

            ch_filename = f"{ch_id}.md" if not ch_id.endswith(".md") else ch_id
            ch_file = book_dir / ch_filename
            if not ch_file.exists():
                mismatches += 1
                errors.append(f"{card_id}: Source chapter file {ch_filename} not found in {book_dir.name}")
                continue

            ch_content = ch_file.read_text(encoding="utf-8")
            if anchor_id not in ch_content:
                mismatches += 1
                errors.append(f"{card_id}: Anchor '{anchor_id}' not found in {ch_filename}")
                continue

            card_valid = True
            opt_lines = [l.strip() for l in trimmed.splitlines() if l.strip().startswith(("- [ ]", "- [x]", "- [X]"))]
            correct_opts = [l for l in opt_lines if l.startswith(("- [x]", "- [X]"))]
            incorrect_opts = [l for l in opt_lines if l.startswith("- [ ]")]
            if len(correct_opts) != 1 or len(incorrect_opts) < 2:
                card_valid = False
                errors.append(f"{card_id}: Format validation failed: exactly 1 [x] and >= 2 [ ] required")

            # Rationale grounding verification
            rat_lines = []
            for line in trimmed.splitlines():
                l = line.strip()
                if l.startswith("> **Rationale:**"):
                    rat_lines.append(l.replace("> **Rationale:**", "").strip())
                elif l.startswith(">") and rat_lines:
                    rat_lines.append(l.lstrip(">").strip())
            rationale = " ".join(rat_lines).strip()

            paragraphs = [p for p in ch_content.split("\n\n") if anchor_id in p]
            if not rationale or not paragraphs:
                card_valid = False
                errors.append(f"{card_id}: Missing '> **Rationale:**' or cited paragraph not found")
            else:
                clean_p = re.sub(r"\^p-[a-zA-Z0-9_-]+", "", paragraphs[0])
                norm_para = normalize_ws(re.sub(r"[*`]", "", clean_p))
                quotes = re.findall(r'["“]([^"”]{5,})["”]', rationale)
                quote_matched = any(normalize_ws(re.sub(r"[*`]", "", q)) in norm_para for q in quotes if q.strip())
                if not quote_matched:
                    words = normalize_ws(re.sub(r"[*`]", "", rationale)).split()
                    for w_len in range(min(12, len(words)), 3, -1):
                        for i in range(len(words) - w_len + 1):
                            phrase = " ".join(words[i : i + w_len])
                            if len(phrase) >= 20 and phrase in norm_para:
                                quote_matched = True
                                break
                        if quote_matched:
                            break
                if not quote_matched:
                    card_valid = False
                    errors.append(f"{card_id}: Rationale does not contain a verbatim quote matching cited anchor {anchor_id}")

            # The card asks which sentence comes right after its quoted passage. Every option is text of the chapter,
            # the right option comes right after the passage, and no two options say much the same thing (LE-06).
            question, _, passage = scenario_stem(trimmed).partition("\n")
            passage = passage.strip()
            if question.strip() != NEXT_SENTENCE_QUESTION:
                card_valid = False
                errors.append(f"{card_id}: The question must be '{NEXT_SENTENCE_QUESTION}'")
            has_passage = len(passage) > 2 and passage.startswith('"') and passage.endswith('"')
            if not has_passage:
                card_valid = False
                errors.append(f"{card_id}: The card quotes no passage after its question")
            options = [match.groups() for match in (OPTION_LINE.match(line) for line in opt_lines) if match]
            chapter_text = book_text(ch_content)
            for _, key, text in options:
                if book_text(text) not in chapter_text:
                    card_valid = False
                    errors.append(f"{card_id}: Option ({key}) is not text of {ch_filename}")
            rights = [text for mark, _, text in options if mark in "xX"]
            if has_passage and len(rights) == 1 and paragraphs:
                if f"{book_text(passage[1:-1])} {book_text(rights[0])}" not in book_text(paragraphs[0]):
                    card_valid = False
                    errors.append(f"{card_id}: The right option does not come right after the passage in {anchor_id}")
            for index, (_, key, text) in enumerate(options):
                for _, other_key, other_text in options[index + 1:]:
                    if is_near_copy(book_text(text), book_text(other_text)):
                        card_valid = False
                        errors.append(f"{card_id}: Options ({key}) and ({other_key}) say much the same thing")

            if card_valid:
                verbatim_matches += 1
            else:
                mismatches += 1

    return DeckAuditResult(total_cards, verbatim_matches, mismatches, errors, cloze_count, scenario_count)


def print_summary_table(rows: List[Dict[str, str]]) -> None:
    """Prints a clean ASCII summary table for verbatim audit results."""
    headers = [("Book ID", "book_id", 30), ("Total Cards", "total", 13), ("Matches", "matches", 10), ("Mismatches", "mismatches", 12), ("Status", "status", 10)]
    widths = [max(len(str(r.get(k, ""))) for r in rows + [{k: t}]) for t, k, _ in headers]
    sep = "+" + "+".join("-" * (w + 2) for w in widths) + "+"
    print("\n" + sep)
    print("|" + "|".join(f" {headers[i][0].ljust(widths[i])} " for i in range(len(headers))) + "|")
    print(sep)
    for r in rows:
        print("|" + "|".join(f" {str(r.get(headers[i][1], '-')).ljust(widths[i])} " for i in range(len(headers))) + "|")
    print(sep + "\n")


def main() -> int:
    # A command of this repository may print any letter of any book (IN-09)
    allow_any_letter()
    target_notes = sorted(NOTES_DIR.glob("*/practice-deck.md"))
    if not target_notes:
        # A check that read no deck stopped with 0, so it said "pass" for a vault with no book at all (TL-04).
        print("[-] No practice decks found in vault/notes/. Nothing was checked.", file=sys.stderr)
        return 1

    rows: List[Dict[str, str]] = []
    total_mismatches = 0
    all_errors: List[str] = []
    total_cloze = 0
    total_scenario = 0

    for deck_path in target_notes:
        res = audit_book_practice_deck(deck_path, BOOKS_DIR)
        total, matches, mismatches, errors = res
        total_cloze += res.cloze_count
        total_scenario += res.scenario_count
        total_mismatches += mismatches
        all_errors.extend(errors)
        rows.append({"book_id": deck_path.parent.name, "total": str(total), "matches": str(matches), "mismatches": str(mismatches), "status": "PASS" if mismatches == 0 else "FAIL"})

    print_summary_table(rows)
    if all_errors:
        print(f"[-] Detected {len(all_errors)} verbatim invariant violation(s):", file=sys.stderr)
        for err in all_errors[:20]:
            print(f"    [FAIL] {err}", file=sys.stderr)
        return 1

    print(f"[+] {total_cloze} cloze cards, {total_scenario} scenario cards verified across {len(target_notes)} books.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
