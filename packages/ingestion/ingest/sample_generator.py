"""Generates a rich sample.epub to validate the ingestion pipeline, endnote relocation, and anchor audits."""

from __future__ import annotations

import sys
from pathlib import Path

from ebooklib import epub


def create_sample_epub(output_path: Path) -> Path:
    book = epub.EpubBook()

    # Metadata
    book.set_identifier("sample-distributed-systems-01")
    book.set_title("Principles of Distributed Systems")
    book.set_language("en")
    book.add_author("Leslie Lamport & Friends")

    # Sample Image Asset (Valid 64x64 diagram PNG satisfying the >= 60x60px threshold)
    try:
        import pymupdf

        pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 64, 64), 0)
        png_bytes = pix.tobytes("png")
    except Exception:
        # Fallback 68-byte transparent PNG
        png_bytes = bytes(
            [
                0x89,
                0x50,
                0x4E,
                0x47,
                0x0D,
                0x0A,
                0x1A,
                0x0A,
                0x00,
                0x00,
                0x00,
                0x0D,
                0x49,
                0x48,
                0x44,
                0x52,
                0x00,
                0x00,
                0x00,
                0x40,
                0x00,
                0x00,
                0x00,
                0x40,
                0x08,
                0x06,
                0x00,
                0x00,
                0x00,
                0xAA,
                0x69,
                0x71,
                0xDE,
                0x00,
                0x00,
                0x00,
                0x0A,
                0x49,
                0x44,
                0x41,
                0x54,
                0x78,
                0x9C,
                0x63,
                0x00,
                0x01,
                0x00,
                0x00,
                0x05,
                0x00,
                0x01,
                0x0D,
                0x0A,
                0x2D,
                0xB4,
                0x00,
                0x00,
                0x00,
                0x00,
                0x49,
                0x45,
                0x4E,
                0x44,
                0xAE,
                0x42,
                0x60,
                0x82,
            ]
        )
    img_item = epub.EpubItem(
        uid="img_diag", file_name="images/system_architecture.png", media_type="image/png", content=png_bytes
    )
    book.add_item(img_item)

    # Chapter 1
    ch1 = epub.EpubHtml(title="Chapter 1: Consistency Models", file_name="ch01.xhtml", lang="en")
    ch1.content = """
    <html>
      <head><title>Chapter 1: Consistency Models</title></head>
      <body>
        <h1>Chapter 1: Consistency Models</h1>
        <p>In distributed computing, <strong>linearizability</strong> is defined as a strong consistency guarantee where all operations appear to execute atomically at a specific point in time between their invocation and response.<a href="notes.xhtml#n1" id="ref1"><sup>1</sup></a></p>
        <p>The primary purpose of <strong>vector clocks</strong> is determining the partial ordering of events in an asynchronous distributed system without synchronized physical time.<a href="notes.xhtml#n2" id="ref2"><sup>2</sup></a></p>
        <p>Under network partitions, the <strong>CAP theorem</strong> is defined as the trade-off stating that a distributed data store can simultaneously provide at most two out of Consistency, Availability, and Partition tolerance.</p>
        <p>The fundamental principle of <strong>eventual consistency</strong> is that all replicas will gradually converge to the same value given that no new updates are made to the object.</p>
        <p>A <strong>quorums system</strong> refers to a subset of nodes whose intersection property guarantees mutual exclusion for concurrent read and write operations.</p>
        <p><strong>Byzantine fault tolerance</strong> represents the capability of a distributed cluster to defend against arbitrary or malicious node failures.</p>
        <p>In contrast to crash-stop failures, Byzantine nodes may communicate conflicting state transitions to distinct peers in the cluster.</p>
        <p><img src="images/system_architecture.png" alt="High Level System Architecture Diagram" /></p>
        <p>Crucially, achieving consensus in an asynchronous environment with even a single crash failure is mathematically impossible according to the FLP impossibility theorem.</p>
      </body>
    </html>
    """
    book.add_item(ch1)

    # Chapter 2
    ch2 = epub.EpubHtml(title="Chapter 2: State Machine Replication", file_name="ch02.xhtml", lang="en")
    ch2.content = """
    <html>
      <head><title>Chapter 2: State Machine Replication</title></head>
      <body>
        <h1>Chapter 2: State Machine Replication</h1>
        <p><strong>State machine replication</strong> is defined as a general technique for implementing a fault-tolerant service by coordinating deterministic replicas across a network.<a href="notes.xhtml#n3" id="ref3"><sup>3</sup></a></p>
        <p>The <strong>Paxos consensus algorithm</strong> is considered to be the canonical protocol for reaching agreement among unreliable participants over an asynchronous network.<a href="notes.xhtml#n4" id="ref4"><sup>4</sup></a></p>
        <p>In Raft consensus, the <strong>leader election</strong> mechanism ensures that exactly one designated node manages log entry sequencing and client interactions.</p>
        <p>The concept of <strong>log compaction</strong> refers to snapshotting the committed system state to truncate historical write-ahead log records and reclaim disk storage.</p>
        <p>A <strong>read index</strong> is essential for optimizing query throughput by avoiding consensus rounds while ensuring monotonic read linearizability.</p>
        <p>Consequently, maintaining an odd number of replicas maximizes failure tolerance without requiring additional quorum consensus votes.</p>
        <p>Furthermore, deterministic execution across all state machines guarantees identical state transitions given the exact same sequence of committed log entries.</p>
      </body>
    </html>
    """
    book.add_item(ch2)

    # Dedicated Backmatter Endnotes Document (severed citations)
    notes = epub.EpubHtml(title="Notes and Citations", file_name="notes.xhtml", lang="en")
    notes.content = """
    <html>
      <head><title>Notes and Citations</title></head>
      <body>
        <h1>Notes and Citations</h1>
        <div id="n1">
          <p><a href="ch01.xhtml#ref1">1.</a> Herlihy, M. P., &amp; Wing, J. M. (1990). Linearizability: A correctness condition for concurrent objects. ACM TOPLAS.</p>
        </div>
        <div id="n2">
          <p><a href="ch01.xhtml#ref2">2.</a> Fidge, C. J. (1988). Timestamps in message-passing systems that preserve the partial ordering. Australian Computer Science Communications.</p>
        </div>
        <div id="n3">
          <p><a href="ch02.xhtml#ref3">3.</a> Schneider, F. B. (1990). Implementing fault-tolerant services using the state machine approach: A tutorial. ACM Computing Surveys.</p>
        </div>
        <div id="n4">
          <p><a href="ch02.xhtml#ref4">4.</a> Lamport, L. (1998). The Part-Time Parliament. ACM Transactions on Computer Systems.</p>
        </div>
      </body>
    </html>
    """
    book.add_item(notes)

    # Multi-level Table of Contents
    book.toc = [
        (
            epub.Section("Part I: Foundations of Consensus"),
            [
                epub.Link("ch01.xhtml", "Chapter 1: Consistency Models", "ch01"),
                epub.Link("ch02.xhtml", "Chapter 2: State Machine Replication", "ch02"),
            ],
        ),
        epub.Link("notes.xhtml", "Notes and Citations", "notes"),
    ]

    # Spine and navigation
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav", ch1, ch2, notes]

    epub.write_epub(str(output_path), book)
    return output_path


def generate_sample_vault_book(vault_dir: Path, custom_book_id: str = "sample") -> None:
    """Generate sample EPUB and ingest into vault with full metrics and sampling."""
    import tempfile

    from ingest.pipeline import ingest_epub

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_epub = Path(tmp_dir) / "sample.epub"
        create_sample_epub(tmp_epub)
        ingest_epub(tmp_epub, vault_dir, custom_book_id=custom_book_id)


if __name__ == "__main__":
    # A command of this repository may print any letter of any book (IN-09)
    from ingest.console import allow_any_letter

    allow_any_letter()
    if len(sys.argv) > 1 and sys.argv[1] == "--vault":
        target_vault = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("vault")
        generate_sample_vault_book(target_vault)
        print(f"[+] Ingested sample book with metrics into vault at: {target_vault}")
    else:
        out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("sample.epub")
        create_sample_epub(out)
        print(f"[+] Created sample EPUB at: {out}")
