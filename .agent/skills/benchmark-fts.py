#!/usr/bin/env python3
"""Benchmarks SQLite FTS5 search query latency against OS AppData index.db.

Directive: Query latency MUST average under 15ms.
"""

import os
import sys
import time
import sqlite3
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "packages" / "ingestion"))

from ingest.chapter_shape import is_heading  # noqa: E402


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
    import tempfile
    temp_p = Path(tempfile.gettempdir()) / "book-engine" / "app_cache" / "index.db"
    if temp_p.exists():
        return temp_p

    # If not yet created, return standard target path
    if appdata:
        return Path(appdata) / "book-engine" / "app_cache" / "index.db"
    return temp_p


def ensure_index_populated(db_path: Path) -> None:
    """If database does not exist or has 0 rows, populate it from vault/books/."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA synchronous = NORMAL;")

    cursor.execute("""
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

    cursor.execute("""
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

    cursor.execute("SELECT count(*) FROM search_index")
    count = cursor.fetchone()[0]

    if count == 0:
        vault_books = Path("vault/books")
        if vault_books.exists():
            for book_dir in vault_books.iterdir():
                if not book_dir.is_dir():
                    continue
                book_id = book_dir.name
                for md_file in book_dir.glob("*.md"):
                    content = md_file.read_text(encoding="utf-8")
                    ch_id = md_file.stem
                    for block in content.split("\n\n"):
                        block = block.strip()
                        if not block or is_heading(block):
                            continue
                        anchor = ""
                        para_text = block
                        if "^p-" in block:
                            pos = block.rfind("^p-")
                            anchor = block[pos:].strip()
                            para_text = block[:pos].strip()
                        if para_text:
                            cursor.execute(
                                "INSERT INTO search_index (book_id, chapter_id, chapter_title, chapter_file, anchor, content) "
                                "VALUES (?, ?, ?, ?, ?, ?)",
                                (book_id, ch_id, ch_id, md_file.name, anchor, para_text)
                            )
            conn.commit()

    conn.close()


def run_benchmark() -> bool:
    db_path = find_db_path()
    ensure_index_populated(db_path)

    if not db_path.exists():
        print(f"[-] Database file not found at: {db_path}", file=sys.stderr)
        return False

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    test_queries = [
        "linearizability*",
        "consensus*",
        "vector clocks*",
        "paxos*",
        "byzantine*",
        "replication*",
        "consistency*",
        "fault tolerance*",
        "state machine*",
        "quorum*"
    ]

    # Warmup
    for q in test_queries:
        cursor.execute(
            "SELECT snippet(search_index, 5, '<mark>', '</mark>', '...', 18) "
            "FROM search_index WHERE search_index MATCH ? LIMIT 10",
            (q,)
        )
        cursor.fetchall()

    # Benchmark loop: 50 iterations per query
    iterations = 50
    latencies = []

    for q in test_queries:
        for _ in range(iterations):
            start = time.perf_counter()
            cursor.execute(
                "SELECT book_id, chapter_id, anchor, snippet(search_index, 5, '<mark>', '</mark>', '...', 18), bm25(search_index) "
                "FROM search_index WHERE search_index MATCH ? ORDER BY rank LIMIT 25",
                (q,)
            )
            rows = cursor.fetchall()
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            latencies.append(elapsed_ms)

    conn.close()

    latencies.sort()
    avg_latency = sum(latencies) / len(latencies)
    p50 = latencies[int(len(latencies) * 0.50)]
    p95 = latencies[int(len(latencies) * 0.95)]
    p99 = latencies[int(len(latencies) * 0.99)]

    print(f"[*] SQLite FTS5 Benchmark Results ({len(latencies)} total queries executed):")
    print(f"    - Database: {db_path}")
    print(f"    - Average Latency: {avg_latency:.3f} ms (Target: < 15.0 ms)")
    print(f"    - Median (p50):    {p50:.3f} ms")
    print(f"    - p95 Latency:     {p95:.3f} ms")
    print(f"    - p99 Latency:     {p99:.3f} ms")

    if avg_latency < 15.0:
        print(f"[+] PASS: Average query latency ({avg_latency:.3f} ms) is well under 15ms threshold.")
        return True
    else:
        print(f"[-] FAIL: Average query latency ({avg_latency:.3f} ms) exceeds 15ms limit.", file=sys.stderr)
        return False


if __name__ == "__main__":
    success = run_benchmark()
    sys.exit(0 if success else 1)
