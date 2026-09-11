import { BookMeta, BookMetadata, BookSummary, PracticeCardItem, CardSchedule, DeckStats } from "./types";

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

export async function fetchLibraryBooks(): Promise<BookMetadata[]> {
  if (isTauri) {
    try {
      return await tauriInvoke<BookMetadata[]>("get_library_books");
    } catch (e) {
      console.warn("Tauri get_library_books failed, trying list_books fallback:", e);
      try {
        const summaries = await tauriInvoke<BookSummary[]>("list_books");
        return summaries.map((s) => ({
          id: s.book_id,
          title: s.title,
          author: s.author,
          chapter_count: s.total_chapters,
          total_words: s.total_words,
        }));
      } catch (e2) {
        console.warn("Tauri list_books failed, falling back to mock:", e2);
      }
    }
  }

  return [
    {
      id: "sample",
      title: "Principles of Distributed Systems",
      author: "Leslie Lamport & Friends",
      chapter_count: 2,
      total_words: 458,
    },
    {
      id: "wealth-of-nations",
      title: "An Inquiry into the Nature and Causes of the Wealth of Nations",
      author: "Adam Smith",
      chapter_count: 37,
      total_words: 387438,
    },
  ];
}

export async function fetchAvailableBooks(): Promise<BookSummary[]> {
  const lib = await fetchLibraryBooks();
  return lib.map((b) => ({
    book_id: b.id,
    title: b.title,
    author: b.author,
    total_chapters: b.chapter_count,
    total_words: b.total_words,
  }));
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

// In-memory store for fallback cards in browser dev mode
const fallbackCardsMemory: PracticeCardItem[] = [
  {
    card_id: "card-ch-01-001",
    book_id: "sample",
    chapter_file: "ch-01.md",
    anchor: "^p-001",
    item_type: "cloze",
    prompt: "In distributed computing, {{c1::linearizability}} is defined as a strong consistency guarantee where all operations appear to execute atomically at a specific point in time between their invocation and response.",
    answer: "linearizability",
    state: 0,
    stability: 0.0,
    difficulty: 0.0,
    due: Math.floor(Date.now() / 1000) - 100,
    last_review: 0,
    reps: 0,
  },
  {
    card_id: "card-ch-01-002",
    book_id: "sample",
    chapter_file: "ch-01.md",
    anchor: "^p-002",
    item_type: "cloze",
    prompt: "The primary purpose of {{c1::vector clocks}} is determining the partial ordering of events in an asynchronous distributed system without synchronized physical time.",
    answer: "vector clocks",
    state: 0,
    stability: 0.0,
    difficulty: 0.0,
    due: Math.floor(Date.now() / 1000) - 50,
    last_review: 0,
    reps: 0,
  },
  {
    card_id: "card-ch-01-003",
    book_id: "sample",
    chapter_file: "ch-01.md",
    anchor: "^p-003",
    item_type: "scramble",
    prompt: "Under network partitions, | the CAP theorem is defined as the trade-off | stating that a distributed data store can simultaneously provide at most two out of | Consistency, Availability, and Partition tolerance.",
    answer: "Under network partitions, the CAP theorem is defined as the trade-off stating that a distributed data store can simultaneously provide at most two out of Consistency, Availability, and Partition tolerance.",
    state: 0,
    stability: 0.0,
    difficulty: 0.0,
    due: Math.floor(Date.now() / 1000) - 10,
    last_review: 0,
    reps: 0,
  },
  {
    card_id: "card-ch-01-006",
    book_id: "sample",
    chapter_file: "ch-01.md",
    anchor: "^p-006",
    item_type: "cloze",
    prompt: "{{c1::Byzantine fault tolerance}} represents the capability of a distributed cluster to defend against arbitrary or malicious node failures.",
    answer: "Byzantine fault tolerance",
    state: 0,
    stability: 0.0,
    difficulty: 0.0,
    due: Math.floor(Date.now() / 1000) - 5,
    last_review: 0,
    reps: 0,
  },
];

export async function syncPracticeDeck(bookId: string): Promise<number> {
  if (isTauri) {
    try {
      return await tauriInvoke("sync_practice_deck", { bookId });
    } catch (e) {
      console.warn("Tauri sync_practice_deck failed:", e);
    }
  }
  return fallbackCardsMemory.length;
}

export async function getDueCards(bookId?: string): Promise<PracticeCardItem[]> {
  if (isTauri) {
    try {
      return await tauriInvoke("get_due_cards", { bookId });
    } catch (e) {
      console.warn("Tauri get_due_cards failed:", e);
    }
  }
  const now = Math.floor(Date.now() / 1000);
  return fallbackCardsMemory.filter((c) => c.due <= now || c.reps === 0);
}

export async function submitReview(cardId: string, rating: number): Promise<CardSchedule> {
  if (isTauri) {
    try {
      return await tauriInvoke("submit_review", { cardId, rating });
    } catch (e) {
      console.warn("Tauri submit_review failed:", e);
    }
  }

  const card = fallbackCardsMemory.find((c) => c.card_id === cardId);
  const now = Math.floor(Date.now() / 1000);
  const intervalDays = rating === 1 ? 0 : rating === 2 ? 1 : rating === 3 ? 3 : 7;
  const due = intervalDays === 0 ? now + 600 : now + intervalDays * 86400;

  if (card) {
    card.state = rating === 1 ? 1 : 2;
    card.stability = rating === 1 ? 0.4 : rating * 1.2;
    card.difficulty = Math.max(1, 7 - rating);
    card.due = due;
    card.last_review = now;
    card.reps += 1;
  }

  return {
    card_id: cardId,
    state: rating === 1 ? 1 : 2,
    stability: rating === 1 ? 0.4 : rating * 1.2,
    difficulty: Math.max(1, 7 - rating),
    due,
    last_review: now,
    reps: (card?.reps || 0),
    interval_days: intervalDays,
  };
}

export async function getDeckStats(bookId?: string): Promise<DeckStats> {
  if (isTauri) {
    try {
      return await tauriInvoke("get_deck_stats", { bookId });
    } catch (e) {
      console.warn("Tauri get_deck_stats failed:", e);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const due = fallbackCardsMemory.filter((c) => c.due <= now || c.reps === 0).length;
  const newCards = fallbackCardsMemory.filter((c) => c.state === 0).length;
  const learning = fallbackCardsMemory.filter((c) => c.state === 1 || c.state === 3).length;
  const review = fallbackCardsMemory.filter((c) => c.state === 2).length;

  return {
    due_count: due,
    new_count: newCards,
    learning_count: learning,
    review_count: review,
    total_cards: fallbackCardsMemory.length,
  };
}

export async function fetchAllBookNotes(bookId: string): Promise<import("./types").ChapterNoteFile[]> {
  if (isTauri) {
    try {
      return await tauriInvoke<import("./types").ChapterNoteFile[]>("load_all_book_notes", { bookId });
    } catch (e) {
      console.warn("Tauri load_all_book_notes failed, falling back:", e);
    }
  }

  // Fallback rich starter notes for dev preview
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
    {
      file_name: "ch-01-notes.md",
      chapter_file: "ch-01.md",
      content: ch1Notes,
    },
    {
      file_name: "ch-02-notes.md",
      chapter_file: "ch-02.md",
      content: ch2Notes,
    },
  ];
}

export async function exportSummary(bookId: string, content: string): Promise<string> {
  if (isTauri) {
    try {
      return await tauriInvoke<string>("export_summary", { bookId, content });
    } catch (e) {
      console.warn("Tauri export_summary failed, falling back:", e);
    }
  }

  localStorage.setItem(`summary_export_${bookId}`, content);
  return `vault/notes/${bookId}/summary-export.md`;
}

export async function getAllBookNotes(bookId: string): Promise<import("./types").AggregatedNoteItem[]> {
  if (isTauri) {
    try {
      return await tauriInvoke<import("./types").AggregatedNoteItem[]>("get_all_book_notes", { bookId });
    } catch (e) {
      console.warn("Tauri get_all_book_notes failed, falling back to client aggregation:", e);
    }
  }

  // Fallback: aggregate from mock note files
  const files = await fetchAllBookNotes(bookId);
  const { aggregateBookNotes } = await import("./notesAggregator");
  const meta = await fetchBookMeta(bookId);
  const entries = aggregateBookNotes(meta, files);
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

export async function exportBookSummary(bookId: string): Promise<string> {
  if (isTauri) {
    try {
      return await tauriInvoke<string>("export_book_summary", { bookId });
    } catch (e) {
      console.warn("Tauri export_book_summary failed, falling back to client export:", e);
    }
  }

  // Fallback: generate summary markdown and persist to localStorage
  const files = await fetchAllBookNotes(bookId);
  const { aggregateBookNotes, generateSummaryMarkdown } = await import("./notesAggregator");
  const meta = await fetchBookMeta(bookId);
  const entries = aggregateBookNotes(meta, files);
  const md = generateSummaryMarkdown(meta, entries);
  localStorage.setItem(`summary_export_${bookId}`, md);
  return `vault/notes/${bookId}/summary-export.md`;
}

export async function getStudyAnalytics(bookId?: string): Promise<import("./types").StudyAnalytics> {
  if (isTauri) {
    try {
      return await tauriInvoke<import("./types").StudyAnalytics>("get_study_analytics", { bookId: bookId || null });
    } catch (e) {
      console.warn("Tauri get_study_analytics failed, falling back:", e);
    }
  }

  // Fallback calculations for web dev preview
  const [heatmap, retention] = await Promise.all([
    fetchReviewHeatmap(bookId),
    fetchRetentionMetrics(bookId),
  ]);

  const totalVaultWords = 22400;

  return {
    daily_reviews: heatmap,
    state_counts: {
      new_count: 5,
      learning_count: 3,
      review_count: 8,
      relearning_count: 0,
      total_cards: 16,
    },
    retention_rate: retention.retention_rate,
    cards_due_today: retention.due_today,
    mastered_cards: retention.mastered_cards,
    total_vault_words: totalVaultWords,
    estimated_reading_time_mins: Math.round(totalVaultWords / 225),
  };
}


export async function fetchReviewHeatmap(bookId?: string): Promise<import("./types").DayReviewActivity[]> {
  if (isTauri) {
    try {
      return await tauriInvoke<import("./types").DayReviewActivity[]>("get_review_heatmap", { bookId });
    } catch (e) {
      console.warn("Tauri get_review_heatmap failed, falling back:", e);
    }
  }

  // Generate realistic 365-day activity pattern for web preview
  const activities: import("./types").DayReviewActivity[] = [];
  const now = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dateStr = d.toISOString().split("T")[0];
    const dayOfWeek = d.getDay();
    // Simulate active streaks and weekday rhythms
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const rand = Math.random();
    let count = 0;
    if (i < 90) {
      // Recent active period
      if (rand > 0.25) {
        count = isWeekend ? Math.floor(rand * 8) + 2 : Math.floor(rand * 18) + 4;
      }
    } else if (i < 240) {
      // Intermittent activity
      if (rand > 0.45) {
        count = Math.floor(rand * 12) + 1;
      }
    } else {
      // Early onboarding
      if (rand > 0.6) {
        count = Math.floor(rand * 6) + 1;
      }
    }
    if (count > 0) {
      activities.push({ date: dateStr, count });
    }
  }
  return activities;
}

export async function fetchRetentionMetrics(bookId?: string): Promise<import("./types").RetentionMetrics> {
  if (isTauri) {
    try {
      return await tauriInvoke<import("./types").RetentionMetrics>("get_retention_metrics", { bookId });
    } catch (e) {
      console.warn("Tauri get_retention_metrics failed, falling back:", e);
    }
  }

  return {
    due_today: 4,
    total_cards: 16,
    mastered_cards: 7,
    retention_rate: 93.4,
  };
}

export async function fetchReadingVelocity(bookId?: string): Promise<import("./types").ReadingVelocityStats> {
  if (isTauri) {
    try {
      return await tauriInvoke<import("./types").ReadingVelocityStats>("get_reading_velocity", { bookId });
    } catch (e) {
      console.warn("Tauri get_reading_velocity failed, falling back:", e);
    }
  }

  // Calculate from localStorage or provide initial realistic stats
  const storedSessions = localStorage.getItem(`reading_sessions_${bookId || "all"}`);
  if (storedSessions) {
    try {
      return JSON.parse(storedSessions);
    } catch {}
  }

  return {
    total_seconds: 5280, // ~1h 28m
    completed_chapters: 2,
    total_words_read: 22400,
    average_wpm: 254.5,
    chapter_stats: [
      {
        chapter_file: "ch-01.md",
        chapter_title: "Chapter 1: Consistency Models",
        seconds_spent: 2640,
        words_read: 11400,
        completed: true,
        wpm: 259.1,
        last_read_at: Math.floor(Date.now() / 1000) - 86400,
      },
      {
        chapter_file: "ch-02.md",
        chapter_title: "Chapter 2: State Machine Replication",
        seconds_spent: 2640,
        words_read: 11000,
        completed: true,
        wpm: 250.0,
        last_read_at: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

export async function recordReadingProgress(
  bookId: string,
  chapterFile: string,
  secondsSpent: number,
  wordsRead: number,
  completed: boolean
): Promise<void> {
  if (isTauri) {
    try {
      await tauriInvoke("record_reading_progress", {
        bookId,
        chapterFile,
        secondsSpent,
        wordsRead,
        completed,
      });
      return;
    } catch (e) {
      console.warn("Tauri record_reading_progress failed:", e);
    }
  }

  // Update fallback in localStorage
  try {
    const key = `reading_sessions_${bookId}`;
    const cur: import("./types").ReadingVelocityStats = JSON.parse(
      localStorage.getItem(key) ||
        JSON.stringify({
          total_seconds: 0,
          completed_chapters: 0,
          total_words_read: 0,
          average_wpm: 0,
          chapter_stats: [],
        })
    );

    let ch = cur.chapter_stats.find((s) => s.chapter_file === chapterFile);
    if (!ch) {
      ch = {
        chapter_file: chapterFile,
        seconds_spent: 0,
        words_read: 0,
        completed: false,
        wpm: 0,
        last_read_at: Math.floor(Date.now() / 1000),
      };
      cur.chapter_stats.push(ch);
    }

    ch.seconds_spent += secondsSpent;
    ch.words_read = Math.max(ch.words_read, wordsRead);
    ch.completed = ch.completed || completed;
    ch.last_read_at = Math.floor(Date.now() / 1000);
    ch.wpm = ch.seconds_spent > 0 ? Math.round(ch.words_read / (ch.seconds_spent / 60)) : 0;

    cur.total_seconds = cur.chapter_stats.reduce((acc, s) => acc + s.seconds_spent, 0);
    cur.total_words_read = cur.chapter_stats.reduce((acc, s) => acc + s.words_read, 0);
    cur.completed_chapters = cur.chapter_stats.filter((s) => s.completed).length;
    cur.average_wpm =
      cur.total_seconds > 0 ? Math.round(cur.total_words_read / (cur.total_seconds / 60)) : 0;

    localStorage.setItem(key, JSON.stringify(cur));
  } catch (err) {
    console.warn("Failed to update localStorage reading session:", err);
  }
}


