#!/usr/bin/env python3
"""Master System Health Audit Orchestrator for Book Engine.

Dynamically evaluates:
1. Dynamic Ledger & Vault Parity (vault/books, inbox/processed, vault/_ledger.json)
2. Anchor & Asset Integrity (^p-[0-9]{3,}, unique anchors, markdown images -> disk assets, footnote parity)
3. Zero-Hallucination Guardrail (extractive Cloze & Scramble verbatim matches against source chapters)
4. Backend Safety (Rust cargo check in apps/desktop/src-tauri)
5. Frontend Safety (TypeScript strict typecheck in apps/desktop)
6. FTS5 Search Latency (SQLite FTS5 query latency < 15.0 ms)

Exits code 0 on 100% pass; exits code 1 on any invariant failure.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Base paths relative to repository root
SKILLS_DIR = Path(__file__).resolve().parent
ROOT_DIR = SKILLS_DIR.parent.parent
VAULT_DIR = ROOT_DIR / "vault"
BOOKS_DIR = VAULT_DIR / "books"
NOTES_DIR = VAULT_DIR / "notes"
INBOX_PROCESSED_DIR = ROOT_DIR / "inbox" / "processed"
LEDGER_PATH = VAULT_DIR / "_ledger.json"
DESKTOP_DIR = ROOT_DIR / "apps" / "desktop"
CARGO_TOML = DESKTOP_DIR / "src-tauri" / "Cargo.toml"

# ANSI Color formatting
ANSI_GREEN = "\033[92m"
ANSI_RED = "\033[91m"
ANSI_YELLOW = "\033[93m"
ANSI_CYAN = "\033[96m"
ANSI_BOLD = "\033[1m"
ANSI_RESET = "\033[0m"


class DiagnosticResult:
    def __init__(
        self,
        name: str,
        target: str,
        metric: str,
        passed: bool,
        errors: Optional[List[str]] = None,
        duration_s: float = 0.0,
    ) -> None:
        self.name = name
        self.target = target
        self.metric = metric
        self.passed = passed
        self.errors = errors or []
        self.duration_s = duration_s


def compute_sha256(path: Path) -> str:
    """Computes SHA-256 hex digest of a file in 64KB chunks."""
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


# ----------------------------------------------------------------------
# 1. Dynamic Ledger & Vault Parity Check
# ----------------------------------------------------------------------
def check_ledger_and_vault_parity() -> DiagnosticResult:
    start_time = time.perf_counter()
    errors: List[str] = []

    if not LEDGER_PATH.exists():
        return DiagnosticResult(
            name="1. Ledger & Vault Parity",
            target="vault/_ledger.json",
            metric="Missing ledger file",
            passed=False,
            errors=[f"Ledger file not found at {LEDGER_PATH}"],
            duration_s=time.perf_counter() - start_time,
        )

    try:
        ledger = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        return DiagnosticResult(
            name="1. Ledger & Vault Parity",
            target="vault/_ledger.json",
            metric="Corrupted JSON",
            passed=False,
            errors=[f"Failed to parse ledger JSON: {e}"],
            duration_s=time.perf_counter() - start_time,
        )

    discovered_books = {
        d.name
        for d in BOOKS_DIR.iterdir()
        if d.is_dir() and not d.name.startswith(".")
    } if BOOKS_DIR.exists() else set()

    discovered_binaries = {
        f.name
        for f in INBOX_PROCESSED_DIR.iterdir()
        if f.is_file() and not f.name.startswith(".")
    } if INBOX_PROCESSED_DIR.exists() else set()

    ledger_book_ids = set()
    ledger_filenames = set()

    for entry in ledger:
        book_id = entry.get("book_id")
        filename = entry.get("filename")
        expected_sha = entry.get("sha256")

        if not book_id or not filename:
            errors.append(f"Invalid ledger record missing book_id/filename: {entry}")
            continue

        ledger_book_ids.add(book_id)
        ledger_filenames.add(filename)

        # Check vault directory and _meta.json
        b_dir = BOOKS_DIR / book_id
        if not b_dir.exists():
            errors.append(f"Ledger references book_id '{book_id}', but '{b_dir}' does not exist.")
        elif not (b_dir / "_meta.json").exists():
            errors.append(f"Book '{book_id}' missing '_meta.json' manifest.")

        # Check binary in inbox/processed and SHA-256 hash
        binary_path = INBOX_PROCESSED_DIR / filename
        if not binary_path.exists():
            errors.append(f"Ledger references binary '{filename}', but not found in inbox/processed/.")
        elif expected_sha:
            actual_sha = compute_sha256(binary_path)
            if actual_sha.lower() != expected_sha.lower():
                errors.append(
                    f"SHA-256 mismatch for '{filename}': expected {expected_sha[:12]}..., got {actual_sha[:12]}..."
                )

    # Orphaned folders in vault/books
    orphaned_books = discovered_books - ledger_book_ids
    for ob in orphaned_books:
        errors.append(f"Orphaned book folder '{ob}' in vault/books/ (not in _ledger.json).")

    # Untracked binaries in inbox/processed
    untracked_binaries = discovered_binaries - ledger_filenames
    for ub in untracked_binaries:
        errors.append(f"Untracked binary '{ub}' in inbox/processed/ (not in _ledger.json).")

    duration = time.perf_counter() - start_time
    passed = len(errors) == 0
    metric = f"{len(ledger_book_ids)} books, {len(ledger_filenames)} binaries synced"

    return DiagnosticResult(
        name="1. Ledger & Vault Parity",
        target="vault/books & inbox/processed",
        metric=metric,
        passed=passed,
        errors=errors,
        duration_s=duration,
    )


# ----------------------------------------------------------------------
# 2. Anchor & Asset Integrity Check
# ----------------------------------------------------------------------
def check_anchor_and_asset_integrity() -> DiagnosticResult:
    start_time = time.perf_counter()
    errors: List[str] = []
    total_chapters = 0
    total_anchors = 0
    total_assets = 0
    total_books = 0

    if not BOOKS_DIR.exists():
        return DiagnosticResult(
            name="2. Anchor & Asset Integrity",
            target="vault/books",
            metric="Missing vault/books directory",
            passed=False,
            errors=["vault/books directory does not exist"],
            duration_s=time.perf_counter() - start_time,
        )

    for book_dir in sorted(BOOKS_DIR.iterdir()):
        if not book_dir.is_dir() or book_dir.name.startswith("."):
            continue

        total_books += 1
        chapters = sorted(book_dir.glob("ch-*.md"))
        total_chapters += len(chapters)

        for ch_file in chapters:
            content = ch_file.read_text(encoding="utf-8")

            # Paragraph anchor format: ^p-[0-9]{3,}
            paragraphs = [
                p for p in content.split("\n\n")
                if p.strip() and not p.strip().startswith("#")
            ]
            seen_anchors = set()

            for p in paragraphs:
                p_clean = p.strip()
                match = re.search(r"\^p-([0-9]{3,})$", p_clean)
                if not match:
                    snippet = re.sub(r"\s+", " ", p_clean)[:70]
                    errors.append(f"{book_dir.name}/{ch_file.name}: Invalid or unanchored paragraph: '{snippet}...'")
                else:
                    anchor = match.group(0)
                    total_anchors += 1
                    if anchor in seen_anchors:
                        errors.append(f"{book_dir.name}/{ch_file.name}: Duplicate anchor '{anchor}' detected.")
                    seen_anchors.add(anchor)

            # Footnote link parity: [^id] callouts vs [^id]: definitions
            callouts = set(re.findall(r"\[\^([a-zA-Z0-9_-]+)\](?!:)", content))
            definitions = set(re.findall(r"\[\^([a-zA-Z0-9_-]+)\]:", content))
            orphans = callouts - definitions
            if orphans:
                errors.append(f"{book_dir.name}/{ch_file.name}: Broken footnote links without definition: {orphans}")

            # Markdown asset links: ![alt](assets/...)
            for img_match in re.finditer(r"!\[(.*?)\]\((.*?)\)", content):
                total_assets += 1
                src = img_match.group(2).strip()
                clean_src = src.split("?")[0].split("#")[0]
                img_path = book_dir / clean_src
                if not img_path.exists():
                    errors.append(
                        f"{book_dir.name}/{ch_file.name}: Missing referenced asset '{clean_src}' (expected at {img_path})."
                    )

    duration = time.perf_counter() - start_time
    passed = len(errors) == 0
    metric = f"{total_anchors:,} anchors, {total_assets} assets ({total_chapters} chs)"

    return DiagnosticResult(
        name="2. Anchor & Asset Integrity",
        target=f"{total_books} books, {total_chapters} chapters",
        metric=metric,
        passed=passed,
        errors=errors,
        duration_s=duration,
    )


# ----------------------------------------------------------------------
# 3. Zero-Hallucination Verbatim Practice Guardrail
# ----------------------------------------------------------------------
def check_zero_hallucination_practice() -> DiagnosticResult:
    start_time = time.perf_counter()
    errors: List[str] = []

    practice_skill_path = SKILLS_DIR / "audit-practice.py"
    if not practice_skill_path.exists():
        return DiagnosticResult(
            name="3. Zero-Hallucination Guardrail",
            target="vault/notes",
            metric="Missing audit-practice.py",
            passed=False,
            errors=[f"Skill script not found at {practice_skill_path}"],
            duration_s=time.perf_counter() - start_time,
        )

    try:
        spec = importlib.util.spec_from_file_location("audit_practice", str(practice_skill_path))
        if spec is None or spec.loader is None:
            raise ImportError(f"Cannot load spec from {practice_skill_path}")
        practice_mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(practice_mod)
    except Exception as e:
        return DiagnosticResult(
            name="3. Zero-Hallucination Guardrail",
            target="vault/notes",
            metric="Import error",
            passed=False,
            errors=[f"Failed to import audit-practice.py: {e}"],
            duration_s=time.perf_counter() - start_time,
        )

    target_decks = sorted(NOTES_DIR.glob("*/practice-deck.md")) if NOTES_DIR.exists() else []
    if not target_decks:
        return DiagnosticResult(
            name="3. Zero-Hallucination Guardrail",
            target="vault/notes",
            metric="0 decks found",
            passed=True,
            errors=[],
            duration_s=time.perf_counter() - start_time,
        )

    total_cards = 0
    total_matches = 0
    total_mismatches = 0

    for deck_path in target_decks:
        tot, mat, mis, deck_errors = practice_mod.audit_book_practice_deck(deck_path, BOOKS_DIR)
        total_cards += tot
        total_matches += mat
        total_mismatches += mis
        errors.extend(deck_errors)

    duration = time.perf_counter() - start_time
    passed = (total_mismatches == 0) and (len(errors) == 0)
    metric = f"{total_matches}/{total_cards} cards verbatim matched"

    return DiagnosticResult(
        name="3. Zero-Hallucination Guardrail",
        target=f"{len(target_decks)} practice decks",
        metric=metric,
        passed=passed,
        errors=errors,
        duration_s=duration,
    )


# ----------------------------------------------------------------------
# 4. Backend Safety (Rust Cargo Check)
# ----------------------------------------------------------------------
def check_backend_safety() -> DiagnosticResult:
    start_time = time.perf_counter()

    if not CARGO_TOML.exists():
        return DiagnosticResult(
            name="4. Backend Safety (Rust)",
            target="apps/desktop/src-tauri",
            metric="Cargo.toml missing",
            passed=False,
            errors=[f"Cargo.toml not found at {CARGO_TOML}"],
            duration_s=time.perf_counter() - start_time,
        )

    try:
        proc = subprocess.run(
            ["cargo", "check", "--manifest-path", str(CARGO_TOML)],
            capture_output=True,
            text=True,
            timeout=90,
        )
        passed = (proc.returncode == 0)
        errors = []
        if not passed:
            err_output = proc.stderr.strip() or proc.stdout.strip()
            errors.append(f"cargo check failed (exit {proc.returncode}):\n{err_output}")
        metric = "Cargo check clean (0 errors)" if passed else f"Cargo check failed (code {proc.returncode})"
    except Exception as e:
        passed = False
        errors = [f"Failed to execute cargo check: {e}"]
        metric = "Execution error"

    duration = time.perf_counter() - start_time
    return DiagnosticResult(
        name="4. Backend Safety (Rust)",
        target="apps/desktop/src-tauri",
        metric=metric,
        passed=passed,
        errors=errors,
        duration_s=duration,
    )


# ----------------------------------------------------------------------
# 5. Frontend Safety (TypeScript Strict Typecheck)
# ----------------------------------------------------------------------
def check_frontend_safety() -> DiagnosticResult:
    start_time = time.perf_counter()

    if not DESKTOP_DIR.exists():
        return DiagnosticResult(
            name="5. Frontend Safety (TypeScript)",
            target="apps/desktop",
            metric="Directory missing",
            passed=False,
            errors=[f"Frontend directory not found at {DESKTOP_DIR}"],
            duration_s=time.perf_counter() - start_time,
        )

    try:
        proc = subprocess.run(
            "npm run tsc",
            shell=True,
            cwd=str(DESKTOP_DIR),
            capture_output=True,
            text=True,
            timeout=90,
        )
        passed = (proc.returncode == 0)
        errors = []
        if not passed:
            err_output = proc.stderr.strip() or proc.stdout.strip()
            errors.append(f"TypeScript typecheck failed (exit {proc.returncode}):\n{err_output}")
        metric = "Strict typecheck clean (0 errors)" if passed else f"Typecheck failed (code {proc.returncode})"
    except Exception as e:
        passed = False
        errors = [f"Failed to execute TypeScript typecheck: {e}"]
        metric = "Execution error"

    duration = time.perf_counter() - start_time
    return DiagnosticResult(
        name="5. Frontend Safety (TypeScript)",
        target="apps/desktop",
        metric=metric,
        passed=passed,
        errors=errors,
        duration_s=duration,
    )


# ----------------------------------------------------------------------
# 6. FTS5 Search Latency Benchmark
# ----------------------------------------------------------------------
def check_fts_benchmark() -> DiagnosticResult:
    start_time = time.perf_counter()
    benchmark_script = SKILLS_DIR / "benchmark-fts.py"

    if not benchmark_script.exists():
        return DiagnosticResult(
            name="6. FTS5 Search Latency",
            target="SQLite FTS5 index.db",
            metric="Script missing",
            passed=False,
            errors=[f"benchmark-fts.py not found at {benchmark_script}"],
            duration_s=time.perf_counter() - start_time,
        )

    try:
        proc = subprocess.run(
            [sys.executable, str(benchmark_script)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        passed = (proc.returncode == 0)
        output = proc.stdout + proc.stderr

        avg_m = re.search(r"Average Latency:\s+([0-9.]+)\s+ms", output)
        if avg_m:
            latency_val = float(avg_m.group(1))
            metric = f"Avg: {latency_val:.3f} ms (< 15.0 ms target)"
        else:
            metric = "Benchmark completed" if passed else "Benchmark failed"

        errors = []
        if not passed:
            errors.append(f"FTS5 benchmark failed (exit {proc.returncode}):\n{output.strip()}")

    except Exception as e:
        passed = False
        metric = "Execution error"
        errors = [f"Failed to execute FTS5 benchmark: {e}"]

    duration = time.perf_counter() - start_time
    return DiagnosticResult(
        name="6. FTS5 Search Latency",
        target="SQLite FTS5 index.db",
        metric=metric,
        passed=passed,
        errors=errors,
        duration_s=duration,
    )


# ----------------------------------------------------------------------
# ASCII Summary Table Formatter
# ----------------------------------------------------------------------
def print_audit_table(results: List[DiagnosticResult], use_color: bool = True) -> None:
    headers = [
        ("Vector / Diagnostic Check", 34),
        ("Target / Scope", 30),
        ("Metric / Details", 34),
        ("Status", 8),
    ]

    col_widths = [h[1] for h in headers]
    sep = "+" + "+".join("-" * (w + 2) for w in col_widths) + "+"

    title = "BOOK ENGINE - SYSTEM HEALTH AUDIT REPORT"
    bar = "=" * len(sep)

    print("\n" + bar, flush=True)
    print(title.center(len(sep)), flush=True)
    print(bar, flush=True)
    print(sep, flush=True)
    header_line = (
        "|"
        + "|".join(f" {headers[i][0].ljust(col_widths[i])} " for i in range(len(headers)))
        + "|"
    )
    print(header_line, flush=True)
    print(sep, flush=True)

    for r in results:
        status_raw = "PASS" if r.passed else "FAIL"
        if use_color:
            status_str = f"{ANSI_GREEN} PASS {ANSI_RESET}" if r.passed else f"{ANSI_RED} FAIL {ANSI_RESET}"
        else:
            status_str = f" {status_raw} "

        def fit(s: str, width: int) -> str:
            return s if len(s) <= width else s[: width - 3] + "..."

        c0 = fit(r.name, col_widths[0]).ljust(col_widths[0])
        c1 = fit(r.target, col_widths[1]).ljust(col_widths[1])
        c2 = fit(r.metric, col_widths[2]).ljust(col_widths[2])

        print(f"| {c0} | {c1} | {c2} | {status_str} |", flush=True)

    print(sep, flush=True)


# ----------------------------------------------------------------------
# Main Entrypoint
# ----------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="Book Engine Dynamic System Health Audit")
    parser.add_argument("--no-color", action="store_true", help="Disable ANSI terminal colors")
    args = parser.parse_args()

    use_color = not args.no_color and sys.stdout.isatty() and "NO_COLOR" not in os.environ

    print("[*] Initializing Dynamic System Health Audit across workspace...", flush=True)

    results: List[DiagnosticResult] = []

    print("    -> Evaluating Dynamic Ledger & Vault Parity...", flush=True)
    results.append(check_ledger_and_vault_parity())

    print("    -> Evaluating Anchor & Asset Integrity...", flush=True)
    results.append(check_anchor_and_asset_integrity())

    print("    -> Evaluating Zero-Hallucination Practice Guardrail...", flush=True)
    results.append(check_zero_hallucination_practice())

    print("    -> Evaluating Backend Safety (Rust cargo check)...", flush=True)
    results.append(check_backend_safety())

    print("    -> Evaluating Frontend Safety (TypeScript strict check)...", flush=True)
    results.append(check_frontend_safety())

    print("    -> Evaluating FTS5 Search Latency Benchmark...", flush=True)
    results.append(check_fts_benchmark())

    print_audit_table(results, use_color=use_color)

    failed_results = [r for r in results if not r.passed]

    if failed_results:
        print(f"\n[-] Diagnostic Invariant Violations Detected ({len(failed_results)} vector(s) failed):", file=sys.stderr)
        for fr in failed_results:
            print(f"\n  [FAILED] {fr.name}:", file=sys.stderr)
            for err in fr.errors[:10]:
                print(f"    - {err}", file=sys.stderr)
            if len(fr.errors) > 10:
                print(f"    ... and {len(fr.errors) - 10} more error(s)", file=sys.stderr)

        status_msg = f"{ANSI_RED}[!] SYSTEM HEALTH: FAIL ({len(failed_results)} check(s) failed){ANSI_RESET}" if use_color else f"[!] SYSTEM HEALTH: FAIL ({len(failed_results)} check(s) failed)"
        print("\n" + status_msg + "\n", file=sys.stderr)
        return 1

    pass_msg = f"{ANSI_GREEN}[+] SYSTEM HEALTH: 100% PASS. All 6 diagnostic vectors passed.{ANSI_RESET}" if use_color else "[+] SYSTEM HEALTH: 100% PASS. All 6 diagnostic vectors passed."
    print("\n" + pass_msg + "\n", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
