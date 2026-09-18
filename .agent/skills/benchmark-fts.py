#!/usr/bin/env python3
"""Benchmarks SQLite FTS5 search query latency against a copy of the OS AppData index.db.

Directive: Query latency MUST average under 15ms.

It reads the reader's index and never writes to it (TL-04). This script used to open the live search database of the
app read-write, set its journal mode, create tables in it, and insert a row per paragraph of the vault when it found
the index empty. A speed check has no business changing the file it measures, so it now copies the index into a
temporary file with the SQLite backup API and measures the copy.

It also counts what each query finds. A query that finds nothing is the fastest query there is, so a benchmark that
never looked at the results could report a fine average for a search that matched no paragraph at all.
"""

import os
import shutil
import sqlite3
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "packages" / "ingestion"))

from ingest.chapter_shape import is_heading
from ingest.console import allow_any_letter

TEST_QUERIES = [
    "linearizability*",
    "consensus*",
    "vector clocks*",
    "paxos*",
    "byzantine*",
    "replication*",
    "consistency*",
    "fault tolerance*",
    "state machine*",
    "quorum*",
]


def find_db_path() -> Path:
    # 1. Check OS AppData
    appdata = os.environ.get("APPDATA")
    if appdata:
        p = Path(appdata) / "book-engine" / "app_cache" / "index.db"
        if p.exists():
            return p

    # 2. Check USERPROFILE / .book-engine
    userprofile = os.environ.get("USERPROFILE")
    if userprofile:
        p = Path(userprofile) / ".book-engine" / "app_cache" / "index.db"
        if p.exists():
            return p

    # 3. Fallback to temp dir
    temp_p = Path(tempfile.gettempdir()) / "book-engine" / "app_cache" / "index.db"
    if temp_p.exists():
        return temp_p

    # If not yet created, return standard target path
    if appdata:
        return Path(appdata) / "book-engine" / "app_cache" / "index.db"
    return temp_p


def make_tables(conn: sqlite3.Connection) -> None:
    """The two tables of the search index, as the app makes them."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS indexed_chapters (
            book_id TEXT NOT NULL,
            chapter_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            title TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (book_id, chapter_id)
        );
    """)
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
            book_id UNINDEXED,
            chapter_id UNINDEXED,
            chapter_title UNINDEXED,
            chapter_file UNINDEXED,
            anchor UNINDEXED,
            content,
            tokenize = 'porter unicode61'
        );
    """)


def fill_from_vault(conn: sqlite3.Connection, vault_books: Path) -> None:
    """Puts every paragraph of every book of `vault_books` into a fresh index."""
    for book_dir in sorted(vault_books.iterdir()):
        if not book_dir.is_dir():
            continue
        for md_file in sorted(book_dir.glob("*.md")):
            content = md_file.read_text(encoding="utf-8")
            ch_id = md_file.stem
            for raw_block in content.split("\n\n"):
                block = raw_block.strip()
                if not block or is_heading(block):
                    continue
                anchor = ""
                para_text = block
                if "^p-" in block:
                    pos = block.rfind("^p-")
                    anchor = block[pos:].strip()
                    para_text = block[:pos].strip()
                if para_text:
                    conn.execute(
                        "INSERT INTO search_index (book_id, chapter_id, chapter_title, chapter_file, anchor, content) "
                        "VALUES (?, ?, ?, ?, ?, ?)",
                        (book_dir.name, ch_id, ch_id, md_file.name, anchor, para_text),
                    )
    conn.commit()


def index_to_measure(live: Path, into: Path) -> str:
    """Writes the index to measure at `into` and says where it came from. The live file is never opened for writing."""
    if live.exists():
        source = sqlite3.connect(f"file:{live}?mode=ro", uri=True)
        try:
            copy = sqlite3.connect(str(into))
            try:
                source.backup(copy)
            finally:
                copy.close()
        finally:
            source.close()
        rows = 0
        conn = sqlite3.connect(f"file:{into}?mode=ro", uri=True)
        try:
            names = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view')")}
            if "search_index" in names:
                rows = conn.execute("SELECT count(*) FROM search_index").fetchone()[0]
        finally:
            conn.close()
        if rows:
            return f"a copy of {live}"
        into.unlink(missing_ok=True)

    vault_books = Path("vault/books")
    if not vault_books.is_dir() or not any(p.is_dir() for p in vault_books.iterdir()):
        raise SystemExit(
            f"[-] {live} holds no paragraph and vault/books holds no book, so there is nothing to measure."
        )
    conn = sqlite3.connect(str(into))
    try:
        make_tables(conn)
        fill_from_vault(conn, vault_books)
    finally:
        conn.close()
    return "a new index built from vault/books"


def run_benchmark() -> bool:
    live = find_db_path()
    work = Path(tempfile.mkdtemp(prefix="fts-benchmark-"))
    try:
        db_path = work / "index.db"
        where_from = index_to_measure(live, db_path)

        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()
        paragraphs = cursor.execute("SELECT count(*) FROM search_index").fetchone()[0]

        # What each query finds. A query that finds nothing measures nothing, however fast it comes back.
        found: list[tuple[str, int]] = []
        for q in TEST_QUERIES:
            cursor.execute("SELECT count(*) FROM search_index WHERE search_index MATCH ?", (q,))
            found.append((q, cursor.fetchone()[0]))

        # Warmup
        for q in TEST_QUERIES:
            cursor.execute(
                "SELECT snippet(search_index, 5, '<mark>', '</mark>', '...', 18) "
                "FROM search_index WHERE search_index MATCH ? LIMIT 10",
                (q,),
            )
            cursor.fetchall()

        # Benchmark loop: 50 iterations per query
        iterations = 50
        latencies = []

        for q in TEST_QUERIES:
            for _ in range(iterations):
                start = time.perf_counter()
                cursor.execute(
                    "SELECT book_id, chapter_id, anchor, snippet(search_index, 5, '<mark>', '</mark>', '...', 18), "
                    "bm25(search_index) FROM search_index WHERE search_index MATCH ? ORDER BY rank LIMIT 25",
                    (q,),
                )
                cursor.fetchall()
                elapsed_ms = (time.perf_counter() - start) * 1000.0
                latencies.append(elapsed_ms)

        conn.close()

        latencies.sort()
        avg_latency = sum(latencies) / len(latencies)
        p50 = latencies[int(len(latencies) * 0.50)]
        p95 = latencies[int(len(latencies) * 0.95)]
        p99 = latencies[int(len(latencies) * 0.99)]

        print(f"[*] SQLite FTS5 Benchmark Results ({len(latencies)} total queries executed):")
        print(f"    - Database: {where_from} ({paragraphs:,} paragraphs)")
        print(f"    - Average Latency: {avg_latency:.3f} ms (Target: < 15.0 ms)")
        print(f"    - Median (p50):    {p50:.3f} ms")
        print(f"    - p95 Latency:     {p95:.3f} ms")
        print(f"    - p99 Latency:     {p99:.3f} ms")
        print("    - What each query found:")
        for q, hits in found:
            print(f"        {q:22s} {hits:7,} of {paragraphs:,} paragraphs")

        nothing = [q for q, hits in found if hits == 0]
        if nothing:
            print(
                f"[-] FAIL: {len(nothing)} of {len(found)} queries found no paragraph at all, so their timing "
                f"measures nothing: {', '.join(nothing)}",
                file=sys.stderr,
            )
            return False

        if avg_latency < 15.0:
            print(f"[+] PASS: Average query latency ({avg_latency:.3f} ms) is well under 15ms threshold.")
            return True
        print(f"[-] FAIL: Average query latency ({avg_latency:.3f} ms) exceeds 15ms limit.", file=sys.stderr)
        return False
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    # A command of this repository may print any letter of any book (IN-09)
    allow_any_letter()
    success = run_benchmark()
    sys.exit(0 if success else 1)
