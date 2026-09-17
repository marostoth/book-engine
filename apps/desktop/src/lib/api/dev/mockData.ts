import type {
  BookMeta,
  PracticeCardItem,
  ReviewBlock,
  SearchResult,
  InspectionalBlueprint,
} from "../../types";
import { HIT_END, HIT_START } from "../../searchSnippet.ts";

export const FALLBACK_META: BookMeta = {
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
        { id: "ch01_xhtml", title: "Chapter 1: Consistency Models", href: "ch01.xhtml", level: 2 },
        { id: "ch02_xhtml", title: "Chapter 2: State Machine Replication", href: "ch02.xhtml", level: 2 },
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
      inspectional_sampling: {
        head_anchors: ["^p-001", "^p-002"],
        tail_anchors: ["^p-007", "^p-009"],
        head_text_preview: "In distributed computing, linearizability is defined as a strong consistency guarantee where all operations appear to execute atomically at a specific point in time between their invocation and response.",
        tail_text_preview: "In contrast to crash-stop failures, Byzantine nodes may communicate conflicting state transitions to distinct peers in the cluster.",
      },
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
      inspectional_sampling: {
        head_anchors: ["^p-001", "^p-002"],
        tail_anchors: ["^p-006", "^p-007"],
        head_text_preview: "State machine replication is defined as a general technique for implementing a fault-tolerant service by coordinating deterministic replicas across a network.",
        tail_text_preview: "Consequently, maintaining an odd number of replicas maximizes failure tolerance without requiring additional quorum consensus votes.",
      },
    },
  ],
  created_at: new Date().toISOString(),
  elementary_metrics: {
    flesch_kincaid_grade: 14.85,
    avg_sentence_length_words: 22.4,
    estimated_reading_minutes: 3,
  },
  inspectional_blueprint: {
    front_matter: {
      has_preface: false,
      preface_path: null,
      publisher_blurb: "Principles of Distributed Systems by Leslie Lamport & Friends",
    },
    pivotal_chapters: ["ch-01", "ch-02"],
    synthetic_index_clusters: [],
  },
};

export const FALLBACK_CHAPTERS: Record<string, string> = {
  "ch-01.md": `# Chapter 1: Consistency Models

In distributed computing, **linearizability** is defined as a strong consistency guarantee where all operations appear to execute atomically at a specific point in time between their invocation and response.[^1] ^p-001

The primary purpose of **vector clocks** is determining the partial ordering of events in an asynchronous distributed system without synchronized physical time.[^2] ^p-002

Under network partitions, the **CAP theorem** is defined as the trade-off stating that a distributed data store can simultaneously provide at most two out of Consistency, Availability, and Partition tolerance. ^p-003

The fundamental principle of **eventual consistency** is that all replicas will gradually converge to the same value given that no new updates are made to the object. ^p-004

A **quorums system** refers to a subset of nodes whose intersection property guarantees mutual exclusion for concurrent read and write operations. ^p-005

**Byzantine fault tolerance** represents the capability of a distributed cluster to defend against arbitrary or malicious node failures. ^p-006

In contrast to crash-stop failures, Byzantine nodes may communicate conflicting state transitions to distinct peers in the cluster. ^p-007

No algorithm can tell a crashed node from a slow one when messages have no time limit. Crucially, achieving consensus in an asynchronous environment with even a single crash failure is mathematically impossible according to the FLP impossibility theorem. ^p-008

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

export const fallbackCardsMemory: PracticeCardItem[] = [
  {
    card_id: "sc-sample-001",
    book_id: "sample",
    chapter_file: "ch-01.md",
    anchor: "^p-008",
    item_type: "scenario",
    card_type: "scenario",
    prompt: 'Which sentence comes right after this passage in the book?\n"No algorithm can tell a crashed node from a slow one when messages have no time limit."',
    answer: "(B) Crucially, achieving consensus in an asynchronous environment with even a single crash failure is mathematically impossible according to the FLP impossibility theorem.",
    state: 0,
    stability: 0.0,
    difficulty: 0.0,
    due: Math.floor(Date.now() / 1000) - 200,
    last_review: 0,
    reps: 0,
    scenario_payload: {
      scenario: 'Which sentence comes right after this passage in the book?\n"No algorithm can tell a crashed node from a slow one when messages have no time limit."',
      options: [
        { key: "A", text: "In contrast to crash-stop failures, Byzantine nodes may communicate conflicting state transitions to distinct peers in the cluster.", is_correct: false },
        { key: "B", text: "Crucially, achieving consensus in an asynchronous environment with even a single crash failure is mathematically impossible according to the FLP impossibility theorem.", is_correct: true },
        { key: "C", text: "The fundamental principle of eventual consistency is that all replicas will gradually converge to the same value given that no new updates are made to the object.", is_correct: false },
        { key: "D", text: "A quorums system refers to a subset of nodes whose intersection property guarantees mutual exclusion for concurrent read and write operations.", is_correct: false },
      ],
      citation: {
        chapterFile: "ch-01.md",
        anchor: "^p-008",
        quote: "Crucially, achieving consensus in an asynchronous environment with even a single crash failure is mathematically impossible according to the FLP impossibility theorem.",
      },
      rationale: 'Right after this passage, the book says: "Crucially, achieving consensus in an asynchronous environment with even a single crash failure is mathematically impossible according to the FLP impossibility theorem."',
    },
  },
  {
    card_id: "card-ch-01-001",
    book_id: "sample",
    chapter_file: "ch-01.md",
    anchor: "^p-001",
    item_type: "cloze",
    card_type: "cloze",
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
    card_type: "cloze",
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
    card_type: "cloze",
    prompt: "Under network partitions, | the CAP theorem is defined as the trade-off | stating that a distributed data store can simultaneously provide at most two out of | Consistency, Availability, and Partition tolerance.",
    answer: "Under network partitions, the CAP theorem is defined as the trade-off stating that a distributed data store can simultaneously provide at most two out of Consistency, Availability, and Partition tolerance.",
    state: 0,
    stability: 0.0,
    difficulty: 0.0,
    due: Math.floor(Date.now() / 1000) - 10,
    last_review: 0,
    reps: 0,
  },
];

export function fallbackSearchVault(query: string): SearchResult[] {
  const results: SearchResult[] = [];
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

        // Plain text with the characters that mark a hit, as the Rust search sends it (SEC-01).
        const regex = new RegExp(`(${qLower})`, "gi");
        const highlighted = text.replace(regex, `${HIT_START}$1${HIT_END}`);

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

export function generateFallbackHeatmap(): ReviewBlock[] {
  const blocks: ReviewBlock[] = [];
  const now = new Date();
  for (let i = 364; i >= 0; i--) {
    // The start of the day i days ago in the time zone of this window: one block with all the reviews of that day.
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const rand = Math.random();
    let count = 0;
    if (i < 90) {
      if (rand > 0.25) count = isWeekend ? Math.floor(rand * 8) + 2 : Math.floor(rand * 18) + 4;
    } else if (i < 240) {
      if (rand > 0.45) count = Math.floor(rand * 12) + 1;
    } else {
      if (rand > 0.6) count = Math.floor(rand * 6) + 1;
    }
    if (count > 0) blocks.push({ started_at: Math.floor(d.getTime() / 1000), count });
  }
  return blocks;
}

export const FALLBACK_INSPECTIONAL_BLUEPRINT: InspectionalBlueprint = {
  front_matter: {
    has_preface: false,
    preface_path: null,
    publisher_blurb: "Foundational principles of distributed computing and consensus models.",
  },
  pivotal_chapters: ["ch-01", "ch-02"],
  synthetic_index_clusters: [
    { term: "Consensus", weight: 1.0, anchors: ["^p-001", "^p-008"] },
    { term: "Replication", weight: 0.85, anchors: ["^p-001", "^p-004"] },
  ],
};

export function getFallbackInspectionalBlueprint(_bookId: string): InspectionalBlueprint {
  return FALLBACK_INSPECTIONAL_BLUEPRINT;
}

