import { BookMeta, BookSummary } from "./types";

// Detect if running inside a Tauri v2 Webview
const isTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// Fallback sample data for web preview/dev
const FALLBACK_META: BookMeta = {
  book_id: "sample",
  title: "Principles of Distributed Systems",
  author: "Leslie Lamport & Friends",
  language: "en",
  total_words: 458,
  total_chapters: 2,
  toc: [
    {
      id: "sec_0",
      title: "Part I: Foundations of Consensus",
      href: "",
      level: 1,
      subitems: [
        {
          id: "ch01_xhtml",
          title: "Chapter 1: Consistency Models",
          href: "ch01.xhtml",
          level: 2,
        },
        {
          id: "ch02_xhtml",
          title: "Chapter 2: State Machine Replication",
          href: "ch02.xhtml",
          level: 2,
        },
      ],
    },
  ],
  spine: [
    {
      id: "ch-01",
      title: "Chapter 1: Consistency Models",
      file_path: "ch-01.md",
      order: 1,
      word_count: 261,
      anchor_count: 11,
      first_anchor: "^p-001",
      last_anchor: "^p-011",
      footnotes_count: 2,
    },
    {
      id: "ch-02",
      title: "Chapter 2: State Machine Replication",
      file_path: "ch-02.md",
      order: 2,
      word_count: 197,
      anchor_count: 9,
      first_anchor: "^p-001",
      last_anchor: "^p-009",
      footnotes_count: 2,
    },
  ],
  created_at: new Date().toISOString(),
};

const FALLBACK_CHAPTERS: Record<string, string> = {
  "ch-01.md": `# Chapter 1: Consistency Models

In distributed computing, **linearizability** is defined as a strong consistency guarantee where all operations appear to execute atomically at a specific point in time between their invocation and response.[^1] ^p-001

The primary purpose of **vector clocks** is determining the partial ordering of events in an asynchronous distributed system without synchronized physical time.[^2] ^p-002

Under network partitions, the **CAP theorem** is defined as the trade-off stating that a distributed data store can simultaneously provide at most two out of Consistency, Availability, and Partition tolerance. ^p-003

The fundamental principle of **eventual consistency** is that all replicas will gradually converge to the same value given that no new updates are made to the object. ^p-004

A **quorums system** refers to a subset of nodes whose intersection property guarantees mutual exclusion for concurrent read and write operations. ^p-005

**Byzantine fault tolerance** represents the capability of a distributed cluster to defend against arbitrary or malicious node failures. ^p-006

In contrast to crash-stop failures, Byzantine nodes may communicate conflicting state transitions to distinct peers in the cluster. ^p-007

Crucially, achieving consensus in an asynchronous environment with even a single crash failure is mathematically impossible according to the FLP impossibility theorem. ^p-008

[^1]: Herlihy, M. P., & Wing, J. M. (1990). Linearizability: A correctness condition for concurrent objects. ACM TOPLAS. ^p-009

[^2]: Fidge, C. J. (1988). Timestamps in message-passing systems that preserve the partial ordering. Australian Computer Science Communications. ^p-010`,

  "ch-02.md": `# Chapter 2: State Machine Replication

**State machine replication** is defined as a general technique for implementing a fault-tolerant service by coordinating deterministic replicas across a network.[^1] ^p-001

The **Paxos consensus algorithm** is considered to be the canonical protocol for reaching agreement among unreliable participants over an asynchronous network.[^2] ^p-002

In Raft consensus, the **leader election** mechanism ensures that exactly one designated node manages log entry sequencing and client interactions. ^p-003

The concept of **log compaction** refers to snapshotting the committed system state to truncate historical write-ahead log records and reclaim disk storage. ^p-004

A **read index** is essential for optimizing query throughput by avoiding consensus rounds while ensuring monotonic read linearizability. ^p-005

Consequently, maintaining an odd number of replicas maximizes failure tolerance without requiring additional quorum consensus votes. ^p-006

Furthermore, deterministic execution across all state machines guarantees identical state transitions given the exact same sequence of committed log entries. ^p-007

[^1]: Schneider, F. B. (1990). Implementing fault-tolerant services using the state machine approach: A tutorial. ACM Computing Surveys. ^p-008

[^2]: Lamport, L. (1998). The Part-Time Parliament. ACM Transactions on Computer Systems. ^p-009`,
};

export async function fetchAvailableBooks(): Promise<BookSummary[]> {
  if (isTauri) {
    try {
      return await tauriInvoke<BookSummary[]>("list_books");
    } catch (e) {
      console.warn("Tauri list_books failed, falling back:", e);
    }
  }

  return [
    {
      book_id: "sample",
      title: "Principles of Distributed Systems",
      author: "Leslie Lamport & Friends",
      total_chapters: 2,
      total_words: 458,
    },
  ];
}

export async function fetchBookMeta(bookId: string): Promise<BookMeta> {
  if (isTauri) {
    try {
      const json = await tauriInvoke<string>("load_book_meta", { bookId });
      return JSON.parse(json);
    } catch (e) {
      console.warn("Tauri load_book_meta failed, falling back:", e);
    }
  }

  return FALLBACK_META;
}

export async function fetchChapter(bookId: string, chapterFile: string): Promise<string> {
  if (isTauri) {
    try {
      return await tauriInvoke<string>("load_chapter", { bookId, chapterFile });
    } catch (e) {
      console.warn("Tauri load_chapter failed, falling back:", e);
    }
  }

  return FALLBACK_CHAPTERS[chapterFile] || FALLBACK_CHAPTERS["ch-01.md"];
}

export async function fetchNotes(bookId: string, notesFile: string): Promise<string> {
  if (isTauri) {
    try {
      return await tauriInvoke<string>("load_notes", { bookId, notesFile });
    } catch (e) {
      console.warn("Tauri load_notes failed, falling back:", e);
    }
  }

  const stored = localStorage.getItem(`notes_${bookId}_${notesFile}`);
  if (stored) return stored;

  return `# Reflections: ${bookId}\n\n## Key Takeaways\n\n- Linearizability creates the illusion of single-copy atomic operations.\n- Vector clocks track partial ordering without global wall clocks.\n\n## Questions\n\n- How does Raft handle network partitions during leader election?\n`;
}

export async function persistNotes(bookId: string, notesFile: string, content: string): Promise<void> {
  if (isTauri) {
    try {
      await tauriInvoke<void>("save_notes", { bookId, notesFile, content });
      return;
    } catch (e) {
      console.warn("Tauri save_notes failed, falling back to localStorage:", e);
    }
  }

  localStorage.setItem(`notes_${bookId}_${notesFile}`, content);
}

export async function searchVault(query: string): Promise<import("./types").SearchResult[]> {
  if (isTauri) {
    try {
      return await tauriInvoke<import("./types").SearchResult[]>("search_vault", { query });
    } catch (e) {
      console.warn("Tauri search_vault failed, falling back:", e);
    }
  }

  // Fallback client-side search across fallback chapters for dev preview
  const results: import("./types").SearchResult[] = [];
  const qLower = query.toLowerCase().trim();
  if (!qLower) return results;

  for (const [chFile, content] of Object.entries(FALLBACK_CHAPTERS)) {
    const chId = chFile.replace(".md", "");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : chId;

    const blocks = content.split("\n\n");
    for (const block of blocks) {
      if (block.toLowerCase().includes(qLower) && !block.startsWith("#")) {
        let anchor = "";
        let text = block;
        if (block.includes("^p-")) {
          const idx = block.lastIndexOf("^p-");
          anchor = block.slice(idx).trim();
          text = block.slice(0, idx).trim();
        }

        // Highlight matched word with <mark>
        const regex = new RegExp(`(${qLower})`, "gi");
        const highlighted = text.replace(regex, "<mark>$1</mark>");

        results.push({
          book_id: "sample",
          chapter_id: chId,
          chapter_title: title,
          chapter_file: chFile,
          anchor,
          snippet: highlighted,
          rank: -1.0,
        });
      }
    }
  }

  return results;
}

export async function indexVault(): Promise<{ chapters_indexed: number; paragraphs_indexed: number }> {
  if (isTauri) {
    try {
      return await tauriInvoke("index_vault");
    } catch (e) {
      console.warn("Tauri index_vault failed:", e);
    }
  }
  return { chapters_indexed: 2, paragraphs_indexed: 20 };
}
