import { SyntopicTopic, SyntopicTopicSummary } from "../types/syntopicon";
import { isTauri, tauriInvoke } from "./clientBase";

const DEFAULT_SAMPLE_TOPIC: SyntopicTopic = {
  id: "division-of-labor",
  title: "Division of Labor & Human Specialization",
  description:
    "Investigation of productive specialization, economic efficiency, and systemic consequences across classical political economy and autonomous distributed systems.",
  neutralTerms: [
    {
      id: "term-spec",
      term: "Operational Specialization",
      neutralDefinition:
        "The decomposition of complex processes into bounded sub-tasks performed by specialized entities.",
      mappings: [
        {
          bookId: "wealth-of-nations",
          authorVariant: "Division of Labour",
          citation: {
            bookId: "wealth-of-nations",
            chapterFile: "ch-01.md",
            anchor: "^p-001",
            quote:
              "The greatest improvement in the productive powers of labour, and the greater part of the skill, dexterity, and judgment with which it is anywhere directed, or applied, seem to have been the effects of the division of labour.",
          },
        },
        {
          bookId: "sample",
          authorVariant: "Decomposition of Autonomous Entities",
          citation: {
            bookId: "sample",
            chapterFile: "ch-01.md",
            anchor: "^p-003",
            quote:
              "A process cannot distinguish between a crashed peer and a slow communication link.",
          },
        },
      ],
    },
  ],
  questions: [
    {
      id: "q-coordination",
      question:
        "How does granular decomposition impact overall coordination overhead and failure propagation across participants?",
      order: 1,
    },
  ],
  controversies: [
    {
      id: "c-coordination",
      questionId: "q-coordination",
      title: "Dexterity Amplification vs Asynchronous Partition Vulnerability",
      perspectives: [
        {
          bookId: "wealth-of-nations",
          stance:
            "Granular specialization dramatically magnifies output through focused dexterity and specialized machinery.",
          citations: [
            {
              bookId: "wealth-of-nations",
              chapterFile: "ch-01.md",
              anchor: "^p-001",
              quote:
                "The greatest improvement in the productive powers of labour, and the greater part of the skill, dexterity, and judgment with which it is anywhere directed, or applied, seem to have been the effects of the division of labour.",
            },
          ],
        },
        {
          bookId: "sample",
          stance:
            "Decoupled components in asynchronous environments face fundamental consensus and partitioned communication barriers.",
          citations: [
            {
              bookId: "sample",
              chapterFile: "ch-01.md",
              anchor: "^p-003",
              quote:
                "A process cannot distinguish between a crashed peer and a slow communication link.",
            },
          ],
        },
      ],
    },
  ],
  createdAt: "2026-09-13T10:00:00Z",
};

export async function getSyntopicTopics(): Promise<SyntopicTopicSummary[]> {
  if (isTauri) {
    try {
      const summaries = await tauriInvoke<SyntopicTopicSummary[]>("get_syntopic_topics");
      if (summaries && summaries.length > 0) {
        return summaries;
      }
    } catch (e) {
      console.warn("Tauri get_syntopic_topics failed, checking storage:", e);
    }
  }

  const raw = localStorage.getItem("syntopic_topics_registry");
  if (raw) {
    try {
      return JSON.parse(raw) as SyntopicTopicSummary[];
    } catch (e) {
      console.warn("Failed to parse cached syntopic topics:", e);
    }
  }

  return [
    {
      id: DEFAULT_SAMPLE_TOPIC.id,
      title: DEFAULT_SAMPLE_TOPIC.title,
      description: DEFAULT_SAMPLE_TOPIC.description,
      termCount: DEFAULT_SAMPLE_TOPIC.neutralTerms.length,
      questionCount: DEFAULT_SAMPLE_TOPIC.questions.length,
      controversyCount: DEFAULT_SAMPLE_TOPIC.controversies.length,
      booksInvolved: ["wealth-of-nations", "sample"],
      createdAt: DEFAULT_SAMPLE_TOPIC.createdAt,
    },
  ];
}

export async function getSyntopicTopic(topicId: string): Promise<SyntopicTopic> {
  if (isTauri) {
    try {
      return await tauriInvoke<SyntopicTopic>("get_syntopic_topic", { topicId });
    } catch (e) {
      console.warn("Tauri get_syntopic_topic failed, falling back to storage:", e);
    }
  }

  const raw = localStorage.getItem(`syntopic_topic_${topicId}`);
  if (raw) {
    try {
      return JSON.parse(raw) as SyntopicTopic;
    } catch (e) {
      console.warn("Failed to parse cached syntopic topic:", e);
    }
  }

  if (topicId === DEFAULT_SAMPLE_TOPIC.id) {
    return DEFAULT_SAMPLE_TOPIC;
  }

  return {
    id: topicId,
    title: topicId,
    description: "",
    neutralTerms: [],
    questions: [],
    controversies: [],
    createdAt: new Date().toISOString(),
  };
}

export async function saveSyntopicTopic(topic: SyntopicTopic): Promise<void> {
  if (isTauri) {
    try {
      await tauriInvoke<void>("save_syntopic_topic", { topic });
      return;
    } catch (e) {
      console.warn("Tauri save_syntopic_topic failed, caching in storage:", e);
    }
  }

  localStorage.setItem(`syntopic_topic_${topic.id}`, JSON.stringify(topic));

  const raw = localStorage.getItem("syntopic_topics_registry");
  let list: SyntopicTopicSummary[] = raw ? JSON.parse(raw) : [];
  list = list.filter((s) => s.id !== topic.id);

  const books = Array.from(
    new Set([
      ...topic.neutralTerms.flatMap((t) => t.mappings.map((m) => m.bookId)),
      ...topic.controversies.flatMap((c) => c.perspectives.map((p) => p.bookId)),
    ])
  ).filter(Boolean);

  list.push({
    id: topic.id,
    title: topic.title,
    description: topic.description,
    termCount: topic.neutralTerms.length,
    questionCount: topic.questions.length,
    controversyCount: topic.controversies.length,
    booksInvolved: books,
    createdAt: topic.createdAt,
  });
  localStorage.setItem("syntopic_topics_registry", JSON.stringify(list));
}

export async function exportSyntopicReport(topicId: string): Promise<string> {
  if (isTauri) {
    try {
      return await tauriInvoke<string>("export_syntopic_report", { topicId });
    } catch (e) {
      console.warn("Tauri export_syntopic_report failed, falling back to local simulation:", e);
    }
  }

  const simulatedPath = `reports/${topicId}-synthesis.md`;
  try {
    const raw = localStorage.getItem(`syntopic_topic_${topicId}`);
    if (raw) {
      localStorage.setItem(`syntopic_report_${topicId}`, raw);
    }
  } catch (e) {
    console.warn("Failed to cache simulated report:", e);
  }

  return simulatedPath;
}
