#!/usr/bin/env python3
"""Autonomous verification harness for zero-hallucination, extractive verbatim practice cards."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

# Root-relative path resolution
SKILL_DIR = Path(__file__).resolve().parent
ROOT_DIR = SKILL_DIR.parent.parent
VAULT_DIR = ROOT_DIR / "vault"
NOTES_DIR = VAULT_DIR / "notes"
BOOKS_DIR = VAULT_DIR / "books"


def normalize_ws(s: str) -> str:
    """Collapses consecutive whitespaces for comparison."""
    return re.sub(r"\s+", " ", s).strip()


def extract_cloze_targets(text: str) -> List[str]:
    """Extracts Cloze targets formatted as {{c1::...}} or ==...==."""
    targets: List[str] = []
    # {{c1::target}} pattern
    for match in re.finditer(r"\{\{c\d+::(.*?)\}\}", text):
        target = match.group(1).strip()
        if target:
            targets.append(target)
    # ==target== pattern
    for match in re.finditer(r"==([^=]+)==", text):
        target = match.group(1).strip()
        if target:
            targets.append(target)
    return targets


def extract_scramble_clauses(text: str) -> List[str]:
    """Extracts scrambled clause components separated by pipes or semicolons."""
    if "|" in text:
        return [c.strip() for c in text.split("|") if c.strip()]
    elif ";" in text:
        return [c.strip() for c in text.split(";") if c.strip()]
    return []


def audit_book_practice_deck(
    deck_path: Path, books_dir: Path
) -> Tuple[int, int, int, List[str]]:
    """Audits a single book's practice deck against its parent chapter markdown files.

    Returns:
        (total_cards, verbatim_matches, mismatches, error_messages)
    """
    book_id = deck_path.parent.name
    book_dir = books_dir / book_id
    deck_content = deck_path.read_text(encoding="utf-8")

    card_blocks = re.split(r"\n(?=###\s+card-)", deck_content)
    total_cards = 0
    verbatim_matches = 0
    mismatches = 0
    errors: List[str] = []

    for block in card_blocks:
        trimmed = block.strip()
        if not trimmed.startswith("### card-"):
            continue

        total_cards += 1

        card_id_m = re.search(r"###\s+(card-[a-zA-Z0-9_-]+)", trimmed)
        ch_m = re.search(r"-\s+\*\*Chapter:\*\*\s+([a-zA-Z0-9_-]+)", trimmed)
        anchor_m = re.search(r"-\s+\*\*Anchor:\*\*\s+(\^p-[a-zA-Z0-9_-]+)", trimmed)
        answer_m = re.search(r"-\s+\*\*Answer Key:\*\*\s+`([^`\n\r]+)`", trimmed)
        source_m = re.search(r"-\s+\*\*Exact Source:\*\*\s+(.+)", trimmed)
        cloze_m = re.search(r"-\s+\*\*Cloze:\*\*\s+(.+)", trimmed)
        prompt_m = re.search(r"-\s+\*\*Prompt:\*\*\s+(.+)", trimmed)
        type_m = re.search(r"-\s+\*\*Type:\*\*\s+([a-zA-Z0-9_-]+)", trimmed)
        scramble_m = re.search(r"-\s+\*\*Scramble:\*\*\s+(.+)", trimmed)

        card_id = card_id_m.group(1) if card_id_m else "unknown"
        ch_id = ch_m.group(1) if ch_m else ""
        anchor_id = anchor_m.group(1) if anchor_m else ""
        answer_key = answer_m.group(1).strip() if answer_m else ""
        exact_source = source_m.group(1).strip() if source_m else ""
        cloze_text = (
            cloze_m.group(1).strip()
            if cloze_m
            else (prompt_m.group(1).strip() if prompt_m else "")
        )
        item_type = (
            type_m.group(1).strip().lower()
            if type_m
            else ("scramble" if scramble_m else "cloze")
        )
        scramble_text = (
            scramble_m.group(1).strip()
            if scramble_m
            else (cloze_text if item_type == "scramble" else "")
        )

        ch_filename = f"{ch_id}.md" if not ch_id.endswith(".md") else ch_id
        ch_file = book_dir / ch_filename

        if not ch_file.exists():
            mismatches += 1
            errors.append(
                f"{card_id}: Source chapter file {ch_filename} not found in {book_dir.name}"
            )
            continue

        ch_content = ch_file.read_text(encoding="utf-8")
        clean_ch_content = re.sub(r"\^p-[a-zA-Z0-9_-]+", "", ch_content)
        norm_ch = normalize_ws(ch_content)
        norm_clean_ch = normalize_ws(clean_ch_content)

        card_valid = True

        # 1. Audit Cloze Deletion targets
        if item_type == "cloze" or not scramble_text:
            cloze_targets = extract_cloze_targets(cloze_text)
            if not cloze_targets and answer_key:
                cloze_targets = [answer_key]

            if not cloze_targets and not answer_key:
                card_valid = False
                errors.append(f"{card_id}: No cloze target or answer key specified")

            for target in cloze_targets:
                norm_target = normalize_ws(target)
                if norm_target not in norm_ch and target not in ch_content:
                    card_valid = False
                    errors.append(
                        f"{card_id}: Cloze target '{target}' is not an exact substring in {ch_filename}"
                    )

            if answer_key:
                norm_key = normalize_ws(answer_key)
                if norm_key not in norm_ch and answer_key not in ch_content:
                    card_valid = False
                    errors.append(
                        f"{card_id}: Answer key '{answer_key}' is not an exact substring in {ch_filename}"
                    )

        # 2. Audit Scrambled Clauses
        if item_type == "scramble" or scramble_text:
            clauses = extract_scramble_clauses(scramble_text)
            if not clauses and answer_key:
                clauses = extract_scramble_clauses(answer_key)

            for clause in clauses:
                norm_clause = normalize_ws(clause)
                if norm_clause not in norm_clean_ch and clause not in ch_content:
                    card_valid = False
                    errors.append(
                        f"{card_id}: Scramble clause '{clause}' is not an exact substring in {ch_filename}"
                    )

        # 3. Audit Exact Source Invariant
        if exact_source:
            norm_source = normalize_ws(exact_source)
            if norm_source not in norm_clean_ch and exact_source not in ch_content:
                card_valid = False
                errors.append(
                    f"{card_id}: Exact source '{exact_source[:40]}...' is not in {ch_filename}"
                )

        if card_valid:
            verbatim_matches += 1
        else:
            mismatches += 1

    return total_cards, verbatim_matches, mismatches, errors


def print_summary_table(rows: List[Dict[str, str]]) -> None:
    """Prints a clean ASCII summary table for verbatim audit results."""
    headers = [
        ("Book ID", "book_id", 30),
        ("Total Cards", "total", 13),
        ("Verbatim Matches", "matches", 18),
        ("Mismatches", "mismatches", 12),
        ("Status", "status", 10),
    ]

    col_widths = []
    for title, key, min_w in headers:
        max_len = max([len(str(r.get(key, ""))) for r in rows] + [len(title), min_w])
        col_widths.append(min(max_len, 45))

    sep = "+" + "+".join("-" * (w + 2) for w in col_widths) + "+"

    print("\n" + sep, flush=True)
    header_line = (
        "|"
        + "|".join(
            f" {headers[i][0].ljust(col_widths[i])} " for i in range(len(headers))
        )
        + "|"
    )
    print(header_line, flush=True)
    print(sep, flush=True)

    for row in rows:
        row_cells = []
        for i, (_, key, _) in enumerate(headers):
            val = str(row.get(key, "-"))
            if len(val) > col_widths[i]:
                val = val[: col_widths[i] - 3] + "..."
            row_cells.append(f" {val.ljust(col_widths[i])} ")
        print("|" + "|".join(row_cells) + "|", flush=True)

    print(sep + "\n", flush=True)


def main() -> int:
    target_notes = sorted(NOTES_DIR.glob("*/practice-deck.md"))
    if not target_notes:
        print("[-] No practice decks found in vault/notes/.", file=sys.stderr)
        return 0

    rows: List[Dict[str, str]] = []
    total_mismatches = 0
    all_errors: List[str] = []

    for deck_path in target_notes:
        book_id = deck_path.parent.name
        total, matches, mismatches, errors = audit_book_practice_deck(
            deck_path, BOOKS_DIR
        )
        total_mismatches += mismatches
        all_errors.extend(errors)

        status = "PASS" if mismatches == 0 else "FAIL"
        rows.append(
            {
                "book_id": book_id,
                "total": str(total),
                "matches": str(matches),
                "mismatches": str(mismatches),
                "status": status,
            }
        )

    print_summary_table(rows)

    if all_errors:
        print(f"[-] Detected {len(all_errors)} verbatim invariant violation(s):", file=sys.stderr)
        for err in all_errors[:20]:
            print(f"    [FAIL] {err}", file=sys.stderr)
        return 1

    print("[+] All practice cards passed zero-hallucination verbatim extractive audits.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
