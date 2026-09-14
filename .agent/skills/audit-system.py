#!/usr/bin/env python3
"""Master System Health Audit Orchestrator for Book Engine.

Dynamically evaluates:
1. Dynamic Ledger & Vault Parity (vault/books, inbox/processed, vault/_ledger.json)
2. Anchor & Asset Integrity (^p-[0-9]{3,}, unique anchors, markdown images -> disk assets, footnote parity)
3. Zero-Hallucination Guardrail (extractive Cloze & Scramble verbatim matches against source chapters)
4. Backend Safety (Rust cargo check in apps/desktop/src-tauri)
5. Frontend Safety (TypeScript strict typecheck in apps/desktop)
6. FTS5 Search Latency (SQLite FTS5 query latency < 15.0 ms)
7. Desktop Runtime Launch Smoke Test (native executable stability)
8. Inspectional Parity (Level 2 blueprint, sampling resolution & snippet preview hygiene)
9. Analytical Parity (Level 3 terms, argument graphs, citations & Adler Rules 9-12 critiques)
10. Syntopical Parity (Level 4 cross-vault registry, neutral terms, controversies & multi-book referential integrity)
11. Elementary Parity (Level 1 elementary metrics, readability bounds, reading time & word count parity)
12. Modularity & Vault Isolation (Codebase <=300 lines soft ceiling & zero ephemeral DB leaks in vault)

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
    total_clozes = 0
    total_scenarios = 0

    for deck_path in target_decks:
        res = practice_mod.audit_book_practice_deck(deck_path, BOOKS_DIR)
        tot, mat, mis, deck_errors = res
        total_cards += tot
        total_matches += mat
        total_mismatches += mis
        total_clozes += getattr(res, "cloze_count", 0)
        total_scenarios += getattr(res, "scenario_count", 0)
        errors.extend(deck_errors)

    if total_clozes == 0:
        errors.append("Dual-modality guardrail: Zero Cloze cards found across library decks.")
    if total_scenarios == 0:
        errors.append("Dual-modality guardrail: Zero Scenario cards found across library decks.")

    duration = time.perf_counter() - start_time
    passed = (total_mismatches == 0) and (len(errors) == 0)
    metric = f"{total_clozes} clozes, {total_scenarios} scenarios ({total_matches}/{total_cards} matched)"

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
# 7. Desktop Runtime Launch Smoke Test
# ----------------------------------------------------------------------
def check_desktop_runtime_launch() -> DiagnosticResult:
    start_time = time.perf_counter()
    errors: List[str] = []

    # Executable discovery: prefer release, fall back to debug
    release_exe = DESKTOP_DIR / "src-tauri" / "target" / "release" / "book-engine-desktop.exe"
    debug_exe = DESKTOP_DIR / "src-tauri" / "target" / "debug" / "book-engine-desktop.exe"

    target_exe: Optional[Path] = None
    if release_exe.exists():
        target_exe = release_exe
    elif debug_exe.exists():
        target_exe = debug_exe

    if not target_exe:
        return DiagnosticResult(
            name="7. Desktop Runtime Launch",
            target="target/release or debug",
            metric="Binary not found",
            passed=False,
            errors=["Desktop binary not found at target/release or debug. Run 'cargo build' first."],
            duration_s=time.perf_counter() - start_time,
        )

    rel_target = str(target_exe.relative_to(ROOT_DIR)).replace("\\", "/")

    # Subprocess smoke run
    try:
        proc = subprocess.Popen(
            [str(target_exe)],
            cwd=str(DESKTOP_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        smoke_duration = 5.0
        poll_interval = 0.5
        elapsed = 0.0
        exited_early = False
        exit_code = None

        while elapsed < smoke_duration:
            ret = proc.poll()
            if ret is not None:
                exited_early = True
                exit_code = ret
                break
            time.sleep(poll_interval)
            elapsed += poll_interval

        if exited_early:
            _, stderr_bytes = proc.communicate(timeout=2)
            stderr_text = stderr_bytes.decode("utf-8", errors="replace").strip()
            errors.append(
                f"Desktop binary exited prematurely after {elapsed:.1f}s with code {exit_code}. Stderr: {stderr_text}"
            )
            passed = False
            metric = f"Early exit ({exit_code}) at {elapsed:.1f}s"
        else:
            passed = True
            metric = f"Stable for 5.0s ({target_exe.parent.name} binary)"

        # Clean termination of process tree
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            try:
                proc.terminate()
                proc.wait(timeout=3)
            except Exception:
                proc.kill()

    except Exception as e:
        passed = False
        metric = "Spawn execution error"
        errors.append(f"Failed to launch desktop binary: {e}")

    duration = time.perf_counter() - start_time
    return DiagnosticResult(
        name="7. Desktop Runtime Launch",
        target=rel_target,
        metric=metric,
        passed=passed,
        errors=errors,
        duration_s=duration,
    )


# ----------------------------------------------------------------------
# 8. Inspectional Blueprint & Sampling Parity Check
# ----------------------------------------------------------------------
def flatten_spine(spine_items: list) -> list[dict]:
    """Recursively extracts all chapter nodes from spine whether flat or nested."""
    flattened: list[dict] = []
    if not isinstance(spine_items, list):
        return flattened
    for item in spine_items:
        if not isinstance(item, dict):
            continue
        if "file_path" in item:
            flattened.append(item)
        for child_key in ("children", "items", "subitems", "spine", "chapters"):
            if child_key in item and isinstance(item[child_key], list):
                flattened.extend(flatten_spine(item[child_key]))
    return flattened


def audit_inspectional_parity(vault_dir: Path) -> tuple[bool, str]:
    """Audits Level 2 inspectional sampling and blueprint parity across vault books.

    Returns (passed, metric_or_error_summary).
    """
    res = check_inspectional_parity(vault_dir)
    if res.passed:
        return True, res.metric
    return False, "; ".join(res.errors[:3]) if res.errors else "Inspectional parity audit failed"


def check_inspectional_parity(vault_dir: Path = VAULT_DIR) -> DiagnosticResult:
    start_time = time.perf_counter()
    errors: list[str] = []
    books_dir = vault_dir / "books"

    if not books_dir.exists():
        return DiagnosticResult(
            name="8. Inspectional Parity",
            target="vault/books/*/_meta.json",
            metric="Missing vault/books directory",
            passed=False,
            errors=["vault/books directory does not exist"],
            duration_s=time.perf_counter() - start_time,
        )

    total_sampling_pairs = 0
    total_sampled_chapters = 0
    sampled_books: set[str] = set()

    for book_dir in sorted(books_dir.iterdir()):
        if not book_dir.is_dir() or book_dir.name.startswith("."):
            continue

        meta_path = book_dir / "_meta.json"
        if not meta_path.exists():
            continue

        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception as e:
            errors.append(f"{book_dir.name}: Corrupt _meta.json: {e}")
            continue

        spine = meta.get("spine", [])
        chapters = flatten_spine(spine)

        # Build set of valid chapter identifiers for pivotal chapters resolution
        valid_chapter_identifiers: set[str] = set()
        for ch in chapters:
            if ch.get("id"):
                valid_chapter_identifiers.add(str(ch["id"]))
            if ch.get("file_path"):
                fp = str(ch["file_path"])
                valid_chapter_identifiers.add(fp)
                valid_chapter_identifiers.add(Path(fp).name)
                valid_chapter_identifiers.add(Path(fp).stem)
        for ch_file in book_dir.glob("ch-*.md"):
            valid_chapter_identifiers.add(ch_file.name)
            valid_chapter_identifiers.add(ch_file.stem)

        book_has_sampling = False

        for ch in chapters:
            sampling = ch.get("inspectional_sampling")
            if not sampling or not isinstance(sampling, dict):
                continue

            # Verify required fields exist
            for req_field in ("head_anchors", "tail_anchors", "head_text_preview", "tail_text_preview"):
                if req_field not in sampling or sampling[req_field] is None:
                    errors.append(f"{book_dir.name}/{ch.get('id', 'unknown')}: Missing required sampling field '{req_field}'.")

            head_anchors = sampling.get("head_anchors", [])
            tail_anchors = sampling.get("tail_anchors", [])
            head_preview = str(sampling.get("head_text_preview", ""))
            tail_preview = str(sampling.get("tail_text_preview", ""))

            if not isinstance(head_anchors, list) or not head_anchors:
                errors.append(f"{book_dir.name}/{ch.get('id', 'unknown')}: head_anchors must be a non-empty list.")
            if not isinstance(tail_anchors, list) or not tail_anchors:
                errors.append(f"{book_dir.name}/{ch.get('id', 'unknown')}: tail_anchors must be a non-empty list.")

            ch_file_rel = ch.get("file_path")
            if not ch_file_rel:
                errors.append(f"{book_dir.name}: Chapter missing file_path for sampling verification.")
                continue

            ch_path = book_dir / ch_file_rel
            if not ch_path.exists():
                errors.append(f"{book_dir.name}: Target chapter file '{ch_file_rel}' not found on disk.")
                continue

            try:
                ch_content = ch_path.read_text(encoding="utf-8")
            except Exception as e:
                errors.append(f"{book_dir.name}/{ch_file_rel}: Failed to read markdown: {e}")
                continue

            # Confirm 100% of anchors listed in head_anchors and tail_anchors exist verbatim in markdown
            for anc in head_anchors:
                if anc not in ch_content:
                    errors.append(f"{book_dir.name}/{ch_file_rel}: Head anchor '{anc}' not found verbatim in markdown.")

            for anc in tail_anchors:
                if anc not in ch_content:
                    errors.append(f"{book_dir.name}/{ch_file_rel}: Tail anchor '{anc}' not found verbatim in markdown.")

            # Allow identical head/tail anchors only if chapter contains < 2 total paragraphs
            paragraphs = [
                p.strip() for p in ch_content.split("\n\n")
                if p.strip() and not p.strip().startswith("#") and not re.match(r"^\[\^.+\]:", p.strip())
            ]
            overlap = set(head_anchors) & set(tail_anchors)
            if overlap and len(paragraphs) >= 2:
                errors.append(
                    f"{book_dir.name}/{ch_file_rel}: Overlapping head/tail anchors {sorted(overlap)} in chapter with {len(paragraphs)} paragraphs (allowed only if < 2 paragraphs)."
                )

            # Snippet Preview Hygiene: no unparsed paragraph anchor tags, unstripped footnote references, or markdown heading prefixes
            for label, preview in (("head_text_preview", head_preview), ("tail_text_preview", tail_preview)):
                if re.search(r"\^p-\d+", preview):
                    errors.append(f"{book_dir.name}/{ch_file_rel}: {label} contains unparsed anchor tag ('^p-xxx').")
                if re.search(r"\[\^\w+\]", preview):
                    errors.append(f"{book_dir.name}/{ch_file_rel}: {label} contains unstripped footnote reference ('[^x]').")
                if re.search(r"(^|\n)#+\s", preview):
                    errors.append(f"{book_dir.name}/{ch_file_rel}: {label} contains markdown heading prefix ('#').")

            total_sampling_pairs += 1
            total_sampled_chapters += 1
            book_has_sampling = True

        if book_has_sampling:
            sampled_books.add(book_dir.name)

        # Blueprint & Exit Assessment Structure
        blueprint = meta.get("inspectional_blueprint")
        if blueprint and isinstance(blueprint, dict):
            pivotal = blueprint.get("pivotal_chapters", [])
            if isinstance(pivotal, list):
                for piv in pivotal:
                    if str(piv) not in valid_chapter_identifiers:
                        errors.append(
                            f"{book_dir.name}: Pivotal chapter '{piv}' in blueprint does not point to an existing chapter."
                        )

            exit_assessment = blueprint.get("exit_assessment")
            if exit_assessment and isinstance(exit_assessment, dict):
                for req_key in ("classification", "unityStatement", "partsStructure", "completedAt"):
                    if req_key not in exit_assessment or exit_assessment[req_key] is None or (isinstance(exit_assessment[req_key], str) and not exit_assessment[req_key].strip()):
                        errors.append(
                            f"{book_dir.name}: Exit assessment populated but missing or empty required field '{req_key}'."
                        )
                if "partsStructure" in exit_assessment and not isinstance(exit_assessment["partsStructure"], list):
                    errors.append(f"{book_dir.name}: Exit assessment 'partsStructure' must be a list.")

    # No-Op Guardrail & Legacy Tolerance: require at least one book to contain verified inspectional sampling
    if total_sampling_pairs == 0:
        errors.append(
            "Zero inspectional sampling items detected across entire vault. At least one book must contain verified inspectional sampling."
        )

    passed = len(errors) == 0
    metric = f"{total_sampling_pairs} head/tail pairs across {total_sampled_chapters} chapters ({len(sampled_books)} books)"

    return DiagnosticResult(
        name="8. Inspectional Parity",
        target="vault/books/*/_meta.json",
        metric=metric,
        passed=passed,
        errors=errors,
        duration_s=time.perf_counter() - start_time,
    )


# ----------------------------------------------------------------------
# Vector 9: Analytical Logic & Citation Parity
# ----------------------------------------------------------------------
def audit_analytical_parity(vault_dir: Path) -> tuple[bool, str]:
    """Validates Stage II and III analytical reading integrity (Rules 5-12)."""
    notes_dir = vault_dir / "notes"
    books_dir = vault_dir / "books"

    errors: List[str] = []
    total_terms = 0
    total_args = 0
    total_critiques = 0
    total_inquiries = 0
    books_verified: set[str] = set()

    if not notes_dir.exists():
        return False, "Notes directory does not exist in vault."

    for book_notes_dir in sorted(notes_dir.iterdir()):
        if not book_notes_dir.is_dir():
            continue
        analytical_path = book_notes_dir / "analytical.json"
        if not analytical_path.exists():
            continue

        book_id = book_notes_dir.name
        book_source_dir = books_dir / book_id
        if not book_source_dir.exists():
            errors.append(f"{book_id}: Note folder exists but source book folder 'vault/books/{book_id}' missing.")
            continue

        try:
            data = json.loads(analytical_path.read_text(encoding="utf-8"))
        except Exception as e:
            errors.append(f"{book_id}/analytical.json: Malformed JSON: {e}")
            continue

        terms = data.get("terms", [])
        args = data.get("arguments", [])
        critiques = data.get("critiques", [])
        inquiries = data.get("inquiries", [])

        # Cache chapter markdown contents
        chapter_cache: Dict[str, str] = {}
        def get_chapter_content(chap_file: str) -> Optional[str]:
            if chap_file in chapter_cache:
                return chapter_cache[chap_file]
            target_path = book_source_dir / chap_file
            if not target_path.exists():
                return None
            try:
                content = target_path.read_text(encoding="utf-8")
                chapter_cache[chap_file] = content
                return content
            except Exception:
                return None

        # Helper to validate an AnchoredCitation
        def validate_citation(cite: dict, context_label: str):
            if not isinstance(cite, dict):
                errors.append(f"{book_id}: {context_label} citation must be an object.")
                return
            chap_file = cite.get("chapterFile") or cite.get("chapter_file")
            anchor = cite.get("anchor")

            if not chap_file:
                errors.append(f"{book_id}: {context_label} citation missing chapterFile.")
                return
            if not anchor:
                errors.append(f"{book_id}: {context_label} citation missing anchor.")
                return

            content = get_chapter_content(chap_file)
            if content is None:
                errors.append(f"{book_id}: {context_label} cites non-existent chapter '{chap_file}'.")
                return

            if anchor not in content:
                errors.append(f"{book_id}: {context_label} anchor '{anchor}' not found in '{chap_file}'.")

        # 1. Terms validation
        for t in terms:
            t_id = t.get("id", "unknown")
            cite = t.get("citation")
            if not cite:
                errors.append(f"{book_id}/term-{t_id}: Missing required citation.")
            else:
                validate_citation(cite, f"Term '{t.get('term', t_id)}'")
            total_terms += 1

        # 2. Arguments validation
        argument_ids: set[str] = set()
        for a in args:
            a_id = a.get("id", "unknown")
            argument_ids.add(a_id)
            conc = a.get("conclusion")
            if not conc:
                errors.append(f"{book_id}/arg-{a_id}: Missing required conclusion citation.")
            else:
                validate_citation(conc, f"Argument '{a.get('title', a_id)}' conclusion")

            premises = a.get("premises", [])
            for idx, p in enumerate(premises):
                validate_citation(p, f"Argument '{a.get('title', a_id)}' premise {idx+1}")
            total_args += 1

        # 3. Critiques validation
        for c in critiques:
            c_id = c.get("id", "unknown")
            target_arg = c.get("targetArgumentId") or c.get("target_argument_id")
            cite = c.get("citation")

            # Grounding constraint: at least one non-null
            if not target_arg and not cite:
                errors.append(f"{book_id}/critique-{c_id}: Grounding constraint violated. Must link targetArgumentId or citation.")

            # Validate target argument ID
            if target_arg and target_arg not in argument_ids:
                errors.append(f"{book_id}/critique-{c_id}: targetArgumentId '{target_arg}' does not match any argument in analytical.json.")

            # Validate citation if present
            if cite:
                validate_citation(cite, f"Critique '{c_id}'")

            # Rule 9 comprehension precondition
            understands = c.get("understandingDeclared") if "understandingDeclared" in c else c.get("understanding_declared")
            if not understands:
                errors.append(f"{book_id}/critique-{c_id}: Rule 9 comprehension not declared (understandingDeclared must be true).")

            # Rule 12 defect vectors on disagreement
            judgment = c.get("judgment")
            if judgment == "disagree":
                defects = c.get("defects", [])
                if not defects:
                    errors.append(f"{book_id}/critique-{c_id}: Disagreement requires at least one defect vector (Rule 12).")

            total_critiques += 1

        # 4. Inquiries validation
        for inq in inquiries:
            inq_id = inq.get("id", "unknown")
            cite = inq.get("citation")
            if cite:
                validate_citation(cite, f"Inquiry '{inq_id}' question")

            sol_cite = inq.get("solutionCitation") or inq.get("solution_citation")
            if sol_cite:
                validate_citation(sol_cite, f"Inquiry '{inq_id}' solution")

            sol_args = inq.get("solutionArgumentIds") or inq.get("solution_argument_ids") or []
            for s_id in sol_args:
                if s_id not in argument_ids:
                    errors.append(f"{book_id}/inquiry-{inq_id}: solutionArgumentId '{s_id}' does not match any argument in analytical.json.")

            total_inquiries += 1

        if terms and args and critiques and inquiries:
            books_verified.add(book_id)

    # No-op guardrail: At least one book must contain verified terms, arguments, critiques, and inquiries
    if total_terms == 0 or total_args == 0 or total_critiques == 0 or total_inquiries == 0 or len(books_verified) == 0:
        errors.append(
            "Zero analytical items verified across vault. At least one book must contain verified terms, arguments, critiques, and inquiries."
        )

    passed = len(errors) == 0
    if passed:
        metric = f"{total_terms} terms, {total_args} args, {total_critiques} critiques, {total_inquiries} inquiries verified across {len(books_verified)} book(s)"
        return True, metric
    else:
        return False, "; ".join(errors[:5])


def check_analytical_parity(vault_dir: Path) -> DiagnosticResult:
    start_time = time.perf_counter()
    passed, msg = audit_analytical_parity(vault_dir)
    errors = [msg] if not passed else []
    metric = msg if passed else "Analytical parity check failed"

    return DiagnosticResult(
        name="9. Analytical Parity",
        target="vault/notes/*/analytical.json",
        metric=metric,
        passed=passed,
        errors=errors,
        duration_s=time.perf_counter() - start_time,
    )


def audit_syntopicon_parity(vault_dir: Path) -> Tuple[bool, str]:
    """Audits Level 4 Syntopicon registry, cross-vault citation anchors, and controversy referential parity."""
    topics_dir = vault_dir / "syntopicon" / "topics"
    books_dir = vault_dir / "books"

    if not topics_dir.exists():
        return False, f"Topics directory '{topics_dir}' does not exist."

    topic_files = sorted(list(topics_dir.glob("*.json")))
    if not topic_files:
        return False, f"Zero syntopical topics found in '{topics_dir}'. At least 1 verified topic required."

    errors: List[str] = []
    total_topics = 0
    total_terms = 0
    total_questions = 0
    total_controversies = 0
    total_books_involved: set[str] = set()

    chapter_cache: Dict[Tuple[str, str], Optional[str]] = {}

    def get_chapter_content(b_id: str, c_file: str) -> Optional[str]:
        key = (b_id, c_file)
        if key in chapter_cache:
            return chapter_cache[key]
        chap_path = books_dir / b_id / c_file
        if not chap_path.exists():
            chapter_cache[key] = None
            return None
        try:
            content = chap_path.read_text(encoding="utf-8")
            chapter_cache[key] = content
            return content
        except Exception:
            chapter_cache[key] = None
            return None

    def validate_cross_citation(cite: dict, context_label: str) -> Optional[str]:
        if not isinstance(cite, dict):
            errors.append(f"{context_label}: Citation must be a JSON object.")
            return None
        b_id = cite.get("bookId") or cite.get("book_id")
        c_file = cite.get("chapterFile") or cite.get("chapter_file")
        anchor = cite.get("anchor")

        if not b_id:
            errors.append(f"{context_label}: Citation missing bookId.")
            return None
        if not c_file:
            errors.append(f"{context_label}: Citation missing chapterFile.")
            return None
        if not anchor:
            errors.append(f"{context_label}: Citation missing anchor.")
            return None

        if not (books_dir / b_id).exists():
            errors.append(f"{context_label}: Referenced book '{b_id}' does not exist in vault/books/.")
            return None

        content = get_chapter_content(b_id, c_file)
        if content is None:
            errors.append(f"{context_label}: Chapter '{c_file}' not found in book '{b_id}'.")
            return None

        if anchor not in content:
            errors.append(f"{context_label}: Anchor '{anchor}' not found in '{b_id}/{c_file}'.")
            return None

        return b_id

    for tf in topic_files:
        try:
            data = json.loads(tf.read_text(encoding="utf-8"))
        except Exception as e:
            errors.append(f"{tf.name}: Malformed JSON: {e}")
            continue

        total_topics += 1
        t_id = data.get("id") or tf.stem
        terms = data.get("neutralTerms") or data.get("neutral_terms") or []
        questions = data.get("questions") or []
        controversies = data.get("controversies") or []

        topic_books: set[str] = set()
        question_ids: set[str] = set()

        for q in questions:
            q_id = q.get("id")
            if not q_id:
                errors.append(f"Topic '{t_id}': Question missing id.")
            else:
                question_ids.add(q_id)
            total_questions += 1

        for term in terms:
            term_id = term.get("id", "unknown")
            term_name = term.get("term", term_id)
            mappings = term.get("mappings", [])
            if not mappings:
                errors.append(f"Topic '{t_id}' / Term '{term_name}': Requires at least one author mapping.")

            for m in mappings:
                m_book = m.get("bookId") or m.get("book_id")
                cite = m.get("citation")
                if not cite:
                    errors.append(f"Topic '{t_id}' / Term '{term_name}': Mapping missing citation.")
                else:
                    valid_bid = validate_cross_citation(cite, f"Topic '{t_id}' / Term '{term_name}' mapping")
                    if valid_bid:
                        topic_books.add(valid_bid)
                        total_books_involved.add(valid_bid)
                if m_book:
                    topic_books.add(m_book)
                    total_books_involved.add(m_book)

            total_terms += 1

        for c in controversies:
            c_id = c.get("id", "unknown")
            c_title = c.get("title", c_id)
            q_ref = c.get("questionId") or c.get("question_id")

            if not q_ref or q_ref not in question_ids:
                errors.append(f"Topic '{t_id}' / Controversy '{c_title}': questionId '{q_ref}' does not match any framed question in topic.")

            perspectives = c.get("perspectives", [])
            if not perspectives:
                errors.append(f"Topic '{t_id}' / Controversy '{c_title}': Requires at least one author perspective.")

            for p in perspectives:
                p_book = p.get("bookId") or p.get("book_id")
                if p_book:
                    topic_books.add(p_book)
                    total_books_involved.add(p_book)
                p_cites = p.get("citations", [])
                for cit in p_cites:
                    valid_bid = validate_cross_citation(cit, f"Topic '{t_id}' / Controversy '{c_title}'")
                    if valid_bid:
                        topic_books.add(valid_bid)
                        total_books_involved.add(valid_bid)

            total_controversies += 1

        if len(topic_books) < 2:
            errors.append(f"Topic '{t_id}': Multi-book invariant violated. Cites {len(topic_books)} book(s) ({topic_books}), but requires >= 2 distinct books.")

    # Audit Syntopicon Dossier Reports (Rule 5)
    reports_dir = vault_dir / "syntopicon" / "reports"
    report_files = sorted(list(reports_dir.glob("*.md"))) if reports_dir.exists() else []
    total_reports = 0

    known_topic_ids = set()
    for tf in topic_files:
        try:
            d = json.loads(tf.read_text(encoding="utf-8"))
            known_topic_ids.add(d.get("id") or tf.stem)
        except Exception:
            pass

    for rf in report_files:
        try:
            content = rf.read_text(encoding="utf-8")
        except Exception as e:
            errors.append(f"{rf.name}: Could not read dossier markdown: {e}")
            continue

        fm_match = re.search(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
        topic_id_in_report = None
        if fm_match:
            fm_text = fm_match.group(1)
            t_match = re.search(r"^topic_id:\s*([^\n\r]+)", fm_text, re.MULTILINE)
            if t_match:
                topic_id_in_report = t_match.group(1).strip().strip('"').strip("'")

        if not topic_id_in_report:
            if rf.name.endswith("-synthesis.md"):
                topic_id_in_report = rf.name[:-len("-synthesis.md")]
            else:
                topic_id_in_report = rf.stem

        if topic_id_in_report not in known_topic_ids:
            errors.append(f"Dossier '{rf.name}': References topic_id '{topic_id_in_report}' which does not exist in vault/syntopicon/topics/.")

        # Match markdown citations like [book:ch.md#^p-xxx](...) or (book/ch.md#^p-xxx)
        cite_matches = re.findall(r"\[([a-zA-Z0-9_\-]+):([a-zA-Z0-9_\-.]+)#(\^p-[0-9]{3,})\]", content)
        for b_id, c_file, anchor in cite_matches:
            fake_cite = {"bookId": b_id, "chapterFile": c_file, "anchor": anchor}
            validate_cross_citation(fake_cite, f"Dossier '{rf.name}' citation")

        total_reports += 1

    passed = len(errors) == 0
    if passed:
        report_suffix = f", {total_reports} dossier(s)" if total_reports > 0 else ""
        metric = f"{total_topics} topic(s), {total_terms} terms, {total_controversies} controversies{report_suffix} verified across {len(total_books_involved)} book(s)"
        return True, metric
    else:
        return False, "; ".join(errors[:5])


def check_syntopical_parity(vault_dir: Path) -> DiagnosticResult:
    start_time = time.perf_counter()
    passed, msg = audit_syntopicon_parity(vault_dir)
    errors = [msg] if not passed else []
    metric = msg if passed else "Syntopical parity check failed"

    return DiagnosticResult(
        name="10. Syntopical Parity",
        target="vault/syntopicon/{topics,reports}/*",
        metric=metric,
        passed=passed,
        errors=errors,
        duration_s=time.perf_counter() - start_time,
    )


# ----------------------------------------------------------------------
# 11. Level 1 Elementary Reading Parity Check
# ----------------------------------------------------------------------
def check_elementary_reading_parity(vault_dir: Path) -> DiagnosticResult:
    """Validates Level 1 Elementary Reading metrics, readability sanity bounds, and spine word count parity."""
    start_time = time.perf_counter()
    books_dir = vault_dir / "books"
    errors: List[str] = []
    total_books = 0
    total_words = 0
    total_minutes = 0

    if not books_dir.exists():
        return DiagnosticResult(
            name="11. Elementary Parity",
            target="vault/books/*/_meta.json",
            metric="Missing books directory",
            passed=False,
            errors=[f"Directory not found: {books_dir}"],
            duration_s=time.perf_counter() - start_time,
        )

    required_metrics = [
        "flesch_kincaid_grade",
        "avg_sentence_length_words",
        "estimated_reading_minutes",
    ]

    for b in sorted(books_dir.iterdir()):
        if not b.is_dir() or b.name.startswith("."):
            continue
        meta_file = b / "_meta.json"
        if not meta_file.exists():
            errors.append(f"{b.name}: Missing _meta.json")
            continue

        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except Exception as e:
            errors.append(f"{b.name}: Malformed _meta.json: {e}")
            continue

        elem = meta.get("elementary_metrics")
        if not elem or not isinstance(elem, dict):
            errors.append(f"{b.name}: Missing elementary_metrics in _meta.json")
            continue

        for rm in required_metrics:
            if rm not in elem:
                errors.append(f"{b.name}: Missing '{rm}' in elementary_metrics")

        fkgl = elem.get("flesch_kincaid_grade", -1)
        if not (0.0 <= fkgl <= 30.0):
            errors.append(f"{b.name}: flesch_kincaid_grade {fkgl} out of valid bounds [0..30]")

        asl = elem.get("avg_sentence_length_words", 0)
        if asl <= 0:
            errors.append(f"{b.name}: avg_sentence_length_words {asl} <= 0")

        r_time = elem.get("estimated_reading_minutes", 0)
        if r_time <= 0:
            errors.append(f"{b.name}: estimated_reading_minutes {r_time} <= 0")

        # Spine word counts consistency
        spine = meta.get("spine", [])
        spine_words = sum(ch.get("word_count", 0) for ch in spine)
        total_words_meta = meta.get("total_words", 0)
        if spine_words != total_words_meta:
            errors.append(f"{b.name}: spine word_count sum ({spine_words}) != total_words ({total_words_meta})")

        total_books += 1
        total_words += total_words_meta
        total_minutes += r_time

    if total_books == 0:
        errors.append("Zero books verified for Elementary Reading parity.")

    passed = len(errors) == 0
    metric = f"{total_books} books, {total_words:,} words ({total_minutes:,} est. mins)"

    return DiagnosticResult(
        name="11. Elementary Parity",
        target="vault/books/*/_meta.json",
        metric=metric,
        passed=passed,
        errors=errors,
        duration_s=time.perf_counter() - start_time,
    )


# ----------------------------------------------------------------------
# 12. Codebase Modularity & Vault Ephemeral Isolation Check
# ----------------------------------------------------------------------
def check_modularity_and_vault_isolation() -> DiagnosticResult:
    """Enforces Directive 1.1 (zero ephemeral DB leaks in vault) and Directive 4 (<= 300 line modular ceiling)."""
    start_time = time.perf_counter()
    errors: List[str] = []

    # 1. Check vault for leaked databases or ephemeral files (Directive 1.1)
    db_leaks: List[str] = []
    for ext in [".db", ".sqlite", ".sqlite3", ".wal", ".shm"]:
        for p in VAULT_DIR.rglob(f"*{ext}"):
            db_leaks.append(str(p.relative_to(ROOT_DIR)))
    if db_leaks:
        errors.append(f"Directive 1.1 violation: Ephemeral database file(s) leaked in vault: {', '.join(db_leaks)}")

    # 2. Check line counts of ingestion modules and desktop source files (Directive 4)
    over_limit: List[str] = []
    src_files = 0
    ingest_dir = ROOT_DIR / "packages" / "ingestion" / "ingest"
    if ingest_dir.exists():
        for p in ingest_dir.glob("*.py"):
            src_files += 1
            lines = len(p.read_text(encoding="utf-8").splitlines())
            if lines > 300:
                over_limit.append(f"{p.name} ({lines} lines)")

    desktop_src_dir = ROOT_DIR / "apps" / "desktop" / "src"
    if desktop_src_dir.exists():
        for p in desktop_src_dir.rglob("*.ts*"):
            if "node_modules" in str(p) or p.name.endswith(".d.ts"):
                continue
            try:
                src_files += 1
                lines = len(p.read_text(encoding="utf-8", errors="ignore").splitlines())
                if lines > 300:
                    over_limit.append(f"{p.relative_to(desktop_src_dir)} ({lines} lines)")
            except Exception:
                pass

    if over_limit:
        errors.append(f"Directive 4 violation: Files exceeding 300-line modular ceiling: {', '.join(over_limit)}")

    passed = len(errors) == 0
    metric = f"{src_files} source files <= 300 lines (0 DB leaks)"

    return DiagnosticResult(
        name="12. Modularity & Isolation",
        target="vault/ & src/ modules",
        metric=metric,
        passed=passed,
        errors=errors,
        duration_s=time.perf_counter() - start_time,
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

    print("    -> Evaluating Desktop Runtime Launch Smoke Test...", flush=True)
    results.append(check_desktop_runtime_launch())

    print("    -> Evaluating Inspectional Blueprint & Sampling Parity...", flush=True)
    results.append(check_inspectional_parity(VAULT_DIR))

    print("    -> Evaluating Analytical Logic & Citation Parity...", flush=True)
    results.append(check_analytical_parity(VAULT_DIR))

    print("    -> Evaluating Syntopical Cross-Vault Referential Parity...", flush=True)
    results.append(check_syntopical_parity(VAULT_DIR))

    print("    -> Evaluating Elementary Reading & Readability Parity...", flush=True)
    results.append(check_elementary_reading_parity(VAULT_DIR))

    print("    -> Evaluating Codebase Modularity & Vault Ephemeral Isolation...", flush=True)
    results.append(check_modularity_and_vault_isolation())

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

    pass_msg = f"{ANSI_GREEN}[+] SYSTEM HEALTH: 100% PASS. All {len(results)} diagnostic vectors passed.{ANSI_RESET}" if use_color else f"[+] SYSTEM HEALTH: 100% PASS. All {len(results)} diagnostic vectors passed."
    print("\n" + pass_msg + "\n", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
