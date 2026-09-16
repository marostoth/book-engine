import { AggregatedNoteItem, ChapterNoteFile } from "../../types";
import { aggregateBookNotes, generateSummaryMarkdown } from "../../notesAggregator";
import { FALLBACK_META } from "./mockData";

export function getFallbackBookNoteFiles(bookId: string): ChapterNoteFile[] {
  const ch1Notes = localStorage.getItem(`notes_${bookId}_ch-01-notes.md`) || `# Reflections: Chapter 1 - Consistency Models

<!-- highlights-json
[
  {
    "id": "hl-sample-1",
    "exact": "In distributed computing, linearizability is defined as a strong consistency guarantee where all operations appear to execute atomically",
    "prefix": "",
    "suffix": " at a specific point",
    "anchor": "^p-001",
    "color": "yellow",
    "createdAt": "${new Date(Date.now() - 86400000 * 2).toISOString()}"
  },
  {
    "id": "hl-sample-2",
    "exact": "The primary purpose of vector clocks is determining the partial ordering of events",
    "prefix": "",
    "suffix": " in an asynchronous distributed system",
    "anchor": "^p-002",
    "color": "emerald",
    "createdAt": "${new Date(Date.now() - 86400000).toISOString()}"
  }
]
-->

## Key Takeaways

- Linearizability guarantees total ordering for read and write operations (^p-001).
- Vector clocks track distributed causality without synchronized physical clocks (^p-002).

## Open Inquiries

- How do large-scale databases truncate vector clock dimensions without losing causal consistency?
`;

  const ch2Notes = localStorage.getItem(`notes_${bookId}_ch-02-notes.md`) || `# Reflections: Chapter 2 - State Machine Replication

<!-- highlights-json
[
  {
    "id": "hl-sample-3",
    "exact": "The Paxos consensus algorithm is considered to be the canonical protocol",
    "prefix": "",
    "suffix": " for reaching agreement",
    "anchor": "^p-002",
    "color": "blue",
    "createdAt": "${new Date().toISOString()}"
  }
]
-->

## Key Takeaways

- State machine replication requires deterministic transitions across all replicas (^p-001).
- Paxos guarantees safety under asynchronous network partitions (^p-002).

## Open Inquiries

- What are the empirical latency differences between Multi-Paxos and Raft leader leases?
`;

  return [
    { file_name: "ch-01-notes.md", chapter_file: "ch-01.md", content: ch1Notes },
    { file_name: "ch-02-notes.md", chapter_file: "ch-02.md", content: ch2Notes },
  ];
}

/** Browser stand-in for `get_all_book_notes`: aggregates the sample notes in the browser. */
export function getAllBookNotes(bookId: string): AggregatedNoteItem[] {
  const entries = aggregateBookNotes(FALLBACK_META, getFallbackBookNoteFiles(bookId));
  return entries.map((e) => ({
    id: e.id,
    item_type: e.type,
    chapter_file: e.chapterFile,
    chapter_title: e.chapterTitle,
    chapter_order: e.chapterOrder,
    anchor: e.anchor || null,
    text: e.text,
    color: e.color || null,
    section_heading: e.sectionHeading || null,
    created_at: e.createdAt || null,
  }));
}

/** Browser stand-in for `export_book_summary`: keeps the summary in browser storage. */
export function exportBookSummary(bookId: string): string {
  const entries = aggregateBookNotes(FALLBACK_META, getFallbackBookNoteFiles(bookId));
  localStorage.setItem(`summary_export_${bookId}`, generateSummaryMarkdown(FALLBACK_META, entries));
  return `vault/notes/${bookId}/summary-export.md`;
}
