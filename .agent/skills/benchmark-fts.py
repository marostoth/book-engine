#!/usr/bin/env python3
"""Benchmarks SQLite FTS5 search query latency against a copy of the OS AppData index.db.

Two kinds of search, two numbers, because they are not the same problem (SI-04):

- A real word or phrase, which is what a reader types, must average under 15 ms.
- The broadest search the app allows, a two-letter prefix, must stay under 120 ms. It cannot meet 15 ms and never
  could: FTS5 has to rank every match before it can give the best 30, and `th*` matches 87% of this index.

It reads the reader's index and never writes to it (TL-04). This script used to open the live search database of the
app read-write, set its journal mode, create tables in it, and insert a row per paragraph of the vault when it found
the index empty. A speed check has no business changing the file it measures, so it now copies the index into a
temporary file with the SQLite backup API and measures the copy.

It also counts what each query finds, and how much of the index that is. A query that finds nothing is the fastest
query there is, so a benchmark that never looked at the results could report a fine average for a search that
matched no paragraph at all. TL-04 stopped that. It did not stop the next one along: for years every query here
matched between 1 and 338 paragraphs of 10,292, so the benchmark passed while never once measuring the case that is
slow. A broad query must now really be broad, or this fails and says so.
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
from ingest.console import allow_any_letter, say_what_was_done

#: Real words and phrases: what a reader types when they are looking for something.
#:
#: The first ten were the whole benchmark, and they match between 1 and 338 paragraphs of a 10,292 paragraph index.
#: The last four are ordinary English words that any book uses a lot, so the list holds a rare word and a common one
#: and the limit below has to be met by both (SI-04).
WORD_QUERIES = [
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
    "people*",
    "time*",
    "work*",
    "value*",
]

#: The broadest search the app will ever run. `MIN_SEARCH_CHARACTERS` is 2 (`src/lib/searchQuery.ts`, SI-03), so a
#: reader can ask for a two-letter prefix and nothing shorter.
#:
#: These were missing, and their absence is why this benchmark reported a fine average for years. The ten queries
#: above match between 1 and 338 paragraphs of a 10,292 paragraph index; `th*` matches 8,989. A query that finds
#: almost nothing is almost as fast as a query that finds nothing, and TL-04 only stopped the second one.
#:
#: They are English prefixes. A vault in another language needs its own here, and `BROAD_SHARE` below says so.
BROAD_QUERIES = ["th*", "in*", "an*"]

#: A broad query must reach at least this share of the index, or this benchmark is measuring nothing again.
BROAD_SHARE = 0.10

#: What a real word must average. This is the number the README, AGENTS.md and ARCHITECTURE.md all name.
WORD_LIMIT_MS = 15.0

#: What the broadest search must stay under. It cannot meet 15 ms and never could: FTS5 has to rank every match
#: before it can give the best 30, and `th*` matches 87% of the index. Measured at 43 ms on the reader's index of
#: 10,292 paragraphs on 2026-09-18. The ceiling is loose on purpose, to catch a real change and not a busy machine.
BROAD_LIMIT_MS = 120.0


def middle_of(times: list[float]) -> float:
    """The middle time of a query's runs. The middle, not the average, so one slow machine moment does not decide."""
    return sorted(times)[len(times) // 2]


def queries_over(timings: dict[str, list[float]], queries: list[str], limit: float) -> list[str]:
    """The queries whose middle time reaches `limit`, each judged on its own.

    Never the average of the lot. An average is how this check passed for years: ten queries that each match a
    handful of paragraphs pull the number down however slow a real search is, so adding one honest query to nine
    easy ones would hide it again (SI-04).
    """
    return [q for q in queries if q in timings and middle_of(timings[q]) >= limit]


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

        every_query = WORD_QUERIES + BROAD_QUERIES

        # What each query finds. A query that finds nothing measures nothing, however fast it comes back, and a
        # query that finds three paragraphs measures almost nothing.
        found: dict[str, int] = {}
        for q in every_query:
            cursor.execute("SELECT count(*) FROM search_index WHERE search_index MATCH ?", (q,))
            found[q] = cursor.fetchone()[0]

        # Warmup
        for q in every_query:
            cursor.execute(
                "SELECT snippet(search_index, 5, '<mark>', '</mark>', '...', 18) "
                "FROM search_index WHERE search_index MATCH ? LIMIT 10",
                (q,),
            )
            cursor.fetchall()

        # Benchmark loop: 50 iterations per query
        iterations = 50
        timings: dict[str, list[float]] = {q: [] for q in every_query}

        for q in every_query:
            for _ in range(iterations):
                start = time.perf_counter()
                cursor.execute(
                    "SELECT book_id, chapter_id, anchor, snippet(search_index, 5, '<mark>', '</mark>', '...', 18), "
                    "bm25(search_index) FROM search_index WHERE search_index MATCH ? ORDER BY rank LIMIT 25",
                    (q,),
                )
                cursor.fetchall()
                timings[q].append((time.perf_counter() - start) * 1000.0)

        conn.close()

        word_times = sorted(t for q in WORD_QUERIES for t in timings[q])
        broad_times = sorted(t for q in BROAD_QUERIES for t in timings[q])
        word_average = sum(word_times) / len(word_times)
        broad_average = sum(broad_times) / len(broad_times)

        def at(times: list[float], share: float) -> float:
            return times[min(int(len(times) * share), len(times) - 1)]

        lines = [
            f"[*] SQLite FTS5 Benchmark Results ({len(word_times) + len(broad_times)} queries executed):",
            f"    - Database: {where_from} ({paragraphs:,} paragraphs)",
            "",
            f"    Real words and phrases, which is what a reader types (limit {WORD_LIMIT_MS:.0f} ms):",
            f"      - Average: {word_average:.3f} ms   p50 {at(word_times, 0.50):.3f}   "
            f"p95 {at(word_times, 0.95):.3f}   p99 {at(word_times, 0.99):.3f}",
            "",
            f"    The broadest search the app allows, a two-letter prefix (limit {BROAD_LIMIT_MS:.0f} ms):",
            f"      - Average: {broad_average:.3f} ms   p50 {at(broad_times, 0.50):.3f}   "
            f"p95 {at(broad_times, 0.95):.3f}   p99 {at(broad_times, 0.99):.3f}",
            "",
            "    What each query found, and its middle time:",
        ]
        for q in every_query:
            middle = middle_of(timings[q])
            share = found[q] / paragraphs * 100 if paragraphs else 0
            lines.append(f"      {q:22s}{found[q]:7,} of {paragraphs:,} ({share:5.1f}%){middle:9.2f} ms")
        say_what_was_done(lines)

        nothing = [q for q in every_query if found[q] == 0]
        if nothing:
            print(
                f"[-] FAIL: {len(nothing)} of {len(every_query)} queries found no paragraph at all, so their "
                f"timing measures nothing: {', '.join(nothing)}",
                file=sys.stderr,
            )
            return False

        # The fault this benchmark had for years: every query it ran matched a handful of paragraphs, so it never
        # measured the case that is slow. A broad query has to really be broad.
        widest = max(found[q] for q in BROAD_QUERIES)
        if paragraphs and widest < paragraphs * BROAD_SHARE:
            print(
                f"[-] FAIL: the broadest query reaches only {widest:,} of {paragraphs:,} paragraphs "
                f"({widest / paragraphs * 100:.1f}%), under the {BROAD_SHARE * 100:.0f}% this check needs. It is "
                f"measuring the easy case only. Add a two-letter prefix that is common in these books to "
                f"BROAD_QUERIES.",
                file=sys.stderr,
            )
            return False

        slow_words = queries_over(timings, WORD_QUERIES, WORD_LIMIT_MS)
        if slow_words:
            for q in slow_words:
                middle = middle_of(timings[q])
                print(
                    f"[-] FAIL: {q} takes {middle:.3f} ms, over the {WORD_LIMIT_MS:.0f} ms limit for a real word "
                    f"({found[q]:,} of {paragraphs:,} paragraphs).",
                    file=sys.stderr,
                )
            return False

        slow_broad = queries_over(timings, BROAD_QUERIES, BROAD_LIMIT_MS)
        if slow_broad:
            for q in slow_broad:
                middle = middle_of(timings[q])
                print(
                    f"[-] FAIL: {q} takes {middle:.3f} ms, over the {BROAD_LIMIT_MS:.0f} ms limit for the broadest "
                    f"search the app allows ({found[q]:,} of {paragraphs:,} paragraphs).",
                    file=sys.stderr,
                )
            return False

        slowest_word = max(middle_of(timings[q]) for q in WORD_QUERIES)
        slowest_broad = max(middle_of(timings[q]) for q in BROAD_QUERIES)
        print(
            f"[+] PASS: the slowest real word takes {slowest_word:.3f} ms (limit {WORD_LIMIT_MS:.0f}), and the "
            f"slowest two-letter prefix takes {slowest_broad:.3f} ms (limit {BROAD_LIMIT_MS:.0f})."
        )
        return True
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    # A command of this repository may print any letter of any book (IN-09)
    allow_any_letter()
    success = run_benchmark()
    sys.exit(0 if success else 1)
