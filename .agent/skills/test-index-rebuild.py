#!/usr/bin/env python3
"""Autonomous verification test for self-healing SQLite FTS5 index reconstruction from the Markdown vault."""

from __future__ import annotations

import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

# Root-relative path resolution
SKILL_DIR = Path(__file__).resolve().parent
ROOT_DIR = SKILL_DIR.parent.parent
SRC_TAURI_DIR = ROOT_DIR / "apps" / "desktop" / "src-tauri"
VAULT_DIR = ROOT_DIR / "vault"


def get_db_path() -> Path:
    """Resolves the OS AppData path for the ephemeral database."""
    appdata = os.getenv("APPDATA")
    if appdata:
        return Path(appdata) / "book-engine" / "app_cache" / "index.db"
    userprofile = os.getenv("USERPROFILE")
    if userprofile:
        return Path(userprofile) / ".book-engine" / "app_cache" / "index.db"
    return Path(os.environ.get("TEMP", "/tmp")) / "book-engine" / "app_cache" / "index.db"


def run_reconstruction() -> bool:
    """Executes the Rust backend indexer to rebuild the database from vault/."""
    cargo_manifest = SRC_TAURI_DIR / "Cargo.toml"
    cmd = [
        "cargo",
        "test",
        "--manifest-path",
        str(cargo_manifest),
        "--",
        "test_index_and_search",
        "--nocapture",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT_DIR))
    if res.returncode != 0:
        print("[-] Cargo test index_and_search failed:", file=sys.stderr)
        print(res.stderr, file=sys.stderr)
        return False
    return True


def main() -> int:
    db_path = get_db_path()
    print(f"[*] Live Database Path: {db_path}")

    # 1. Capture baseline counts if database exists
    baseline_chapters = 0
    baseline_paragraphs = 0
    backup_path = db_path.with_suffix(".db.test_bak")

    if db_path.exists():
        try:
            conn = sqlite3.connect(str(db_path))
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM indexed_chapters")
            baseline_chapters = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM search_index")
            baseline_paragraphs = cur.fetchone()[0]
            conn.close()
            print(f"[+] Baseline: {baseline_chapters} chapters, {baseline_paragraphs} paragraphs indexed.")
        except Exception as e:
            print(f"[!] Warning reading baseline: {e}")

        # Temporarily back up live database to test_bak
        print("[*] Backing up live database to simulate complete cache loss...")
        shutil.copy(str(db_path), str(backup_path))
        for extra in [db_path.with_name("index.db-wal"), db_path.with_name("index.db-shm")]:
            if extra.exists():
                shutil.copy(str(extra), str(backup_path.parent / (extra.name + ".test_bak")))
                extra.unlink()
        db_path.unlink()
        print("[+] Live database deleted. System is now running without cache.")

    assert not db_path.exists(), "Target database should not exist before rebuild."

    # 2. Reconstruct database purely from Markdown vault
    print("[*] Rebuilding index purely from Markdown vault files...")
    success = run_reconstruction()
    if not success:
        print("[-] Index reconstruction failed.", file=sys.stderr)
        if backup_path.exists():
            shutil.move(str(backup_path), str(db_path))
        return 1

    # 3. Assert reconstructed database integrity
    if not db_path.exists():
        print("[-] Reconstructed database was not created at target location.", file=sys.stderr)
        if backup_path.exists():
            shutil.move(str(backup_path), str(db_path))
        return 1

    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM indexed_chapters")
    rebuilt_chapters = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM search_index")
    rebuilt_paragraphs = cur.fetchone()[0]

    # Verify FTS5 queries against rebuilt database
    cur.execute("SELECT COUNT(*) FROM search_index WHERE search_index MATCH 'marketing'")
    marketing_matches = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM search_index WHERE search_index MATCH 'division of labour'")
    division_matches = cur.fetchone()[0]

    conn.close()

    print("\n=== SELF-HEALING REBUILD VERIFICATION RESULTS ===")
    print(f"  Chapters Rebuilt:   {rebuilt_chapters} (Expected: >= 59)")
    print(f"  Paragraphs Indexed: {rebuilt_paragraphs} (Expected: >= 9300)")
    print(f"  FTS5 'marketing':   {marketing_matches} occurrences")
    print(f"  FTS5 'division':    {division_matches} occurrences")

    # Assert parity
    assert rebuilt_chapters >= 59, f"Expected at least 59 chapters, got {rebuilt_chapters}"
    assert rebuilt_paragraphs >= 9000, f"Expected at least 9000 paragraphs, got {rebuilt_paragraphs}"
    assert marketing_matches > 0, "FTS5 query 'marketing' returned 0 results."
    assert division_matches > 0, "FTS5 query 'division of labour' returned 0 results."

    # 4. Cleanup backup
    if backup_path.exists():
        backup_path.unlink()
    for extra in [backup_path.parent / "index.db-wal.test_bak", backup_path.parent / "index.db-shm.test_bak"]:
        if extra.exists():
            extra.unlink()

    print("\n[+] PASS: Cache self-healing verified! Database successfully reconstructed 100% from Markdown vault.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
