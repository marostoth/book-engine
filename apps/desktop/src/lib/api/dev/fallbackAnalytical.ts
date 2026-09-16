import type { AnalyticalStore } from "../../types/analytical.ts";

const DEFAULT_SAMPLE_STORE: AnalyticalStore = {
  terms: [
    {
      id: "term-1",
      term: "Distributed System",
      authorDefinition: "A system in which components located on networked computers communicate and coordinate their actions by passing messages.",
      citation: {
        chapterFile: "ch-01.md",
        anchor: "^p-001",
        quote: "A distributed system consists of autonomous computing entities communicating over a network.",
      },
    },
  ],
  arguments: [
    {
      id: "arg-1",
      title: "Impossibility of Consensus with Asynchronous Crash Failures",
      inferenceType: "deductive",
      conclusion: {
        chapterFile: "ch-01.md",
        anchor: "^p-004",
        quote: "No deterministic asynchronous consensus protocol can guarantee liveness in the presence of even an unannounced process crash.",
      },
      premises: [
        {
          chapterFile: "ch-01.md",
          anchor: "^p-002",
          quote: "Message delays in asynchronous networks are unbounded.",
        },
        {
          chapterFile: "ch-01.md",
          anchor: "^p-003",
          quote: "A process cannot distinguish between a crashed peer and a slow communication link.",
        },
      ],
      notes: "FLP theorem core implication: partial synchrony or randomization is mandatory for fault-tolerant agreement.",
    },
  ],
  critiques: [
    {
      id: "crit-1",
      targetArgumentId: "arg-1",
      citation: {
        chapterFile: "ch-01.md",
        anchor: "^p-004",
        quote: "No deterministic asynchronous consensus protocol can guarantee liveness in the presence of even an unannounced process crash.",
      },
      understandingDeclared: true,
      judgment: "disagree",
      defects: ["incomplete"],
      rationale: "FLP holds for deterministic asynchronous systems, but randomized algorithms (e.g. Ben-Or) or failure detectors circumvent impossibility.",
      createdAt: "2026-09-13T09:40:00Z",
    },
  ],
  inquiries: [
    {
      id: "inq-1",
      question: "Can a distributed system achieve consensus under asynchronous network conditions with crash failures?",
      domain: "theoretical",
      priority: "primary",
      citation: {
        chapterFile: "ch-01.md",
        anchor: "^p-001",
        quote: "A distributed system consists of autonomous computing entities communicating over a network.",
      },
      resolution: "solved",
      solutionNotes: "Mathematically proven impossible for deterministic algorithms via FLP theorem, but partially solvable with randomized protocols.",
      solutionArgumentIds: ["arg-1"],
      solutionCitation: {
        chapterFile: "ch-01.md",
        anchor: "^p-004",
        quote: "No deterministic asynchronous consensus protocol can guarantee liveness in the presence of even an unannounced process crash.",
      },
      createdAt: "2026-09-13T10:00:00Z",
    },
  ],
};

/** Browser stand-in for `get_analytical_data`: browser storage, or the sample store for the sample book. */
export function getAnalyticalData(bookId: string): AnalyticalStore {
  const raw = localStorage.getItem(`analytical_store_${bookId}`);
  if (raw) {
    try {
      return JSON.parse(raw) as AnalyticalStore;
    } catch (e) {
      console.warn("Failed to parse cached analytical data:", e);
    }
  }

  if (bookId === "sample") {
    return DEFAULT_SAMPLE_STORE;
  }

  return { terms: [], arguments: [] };
}

/** Browser stand-in for `save_analytical_data`: browser storage. */
export function saveAnalyticalData(bookId: string, data: AnalyticalStore): void {
  localStorage.setItem(`analytical_store_${bookId}`, JSON.stringify(data));
}
