import type { SyntopicTopic, SyntopicTopicSummary } from "../../types/syntopicon.ts";

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

/** Browser stand-in for `get_syntopic_topics`: the topic list in browser storage, or the sample topic. */
export function getSyntopicTopics(): SyntopicTopicSummary[] {
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

/** Browser stand-in for `get_syntopic_topic`: browser storage, the sample topic, or an empty topic. */
export function getSyntopicTopic(topicId: string): SyntopicTopic {
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

/** Browser stand-in for `topic_id_from_title` in `vault/syntopicon.rs`: the file name of a new topic. */
function topicIdFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Browser stand-in for `create_syntopic_topic`: the same file names, and the same refusal of a taken one. */
export function createSyntopicTopic(title: string, description: string): SyntopicTopic {
  const taken = new Set(getSyntopicTopics().map((summary) => summary.id));
  let id = topicIdFromTitle(title);
  if (id && taken.has(id)) {
    throw new Error(
      `This title needs the file ${id}.json, and the topic "${getSyntopicTopic(id).title}" already uses it. ` +
        "Open that topic, or choose another title."
    );
  }
  if (!id) {
    let n = 1;
    while (taken.has(`topic-${n}`)) n += 1;
    id = `topic-${n}`;
  }

  const topic: SyntopicTopic = {
    id,
    title,
    description,
    neutralTerms: [],
    questions: [],
    controversies: [],
    createdAt: new Date().toISOString(),
  };
  saveSyntopicTopic(topic);
  return topic;
}

/** Browser stand-in for `save_syntopic_topic`: browser storage. */
export function saveSyntopicTopic(topic: SyntopicTopic): void {
  localStorage.setItem(`syntopic_topic_${topic.id}`, JSON.stringify(topic));

  // Start from the list the page sees, so the sample topic stays in the list after the first save.
  const list = getSyntopicTopics().filter((s) => s.id !== topic.id);

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

/** Browser stand-in for `export_syntopic_report`: keeps a copy of the topic in browser storage. */
export function exportSyntopicReport(topicId: string): string {
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
