import test from "node:test";
import assert from "node:assert/strict";
import type { ExitAssessmentPayload, VocabularyEntry } from "./types.ts";
import type { AnalyticalStore } from "./types/analytical.ts";
import type { SyntopicTopic } from "./types/syntopicon.ts";

// Inside the app, a failed backend call must reach the caller, so the app can show the error (DS-02).

// The Tauri window of the app, with a backend whose commands all fail. The API modules look for Tauri when they
// load, so this window exists before they load.
let backend = (cmd: string): unknown => {
  throw `${cmd} failed: the vault is not reachable`;
};
const browserStorageWrites: string[] = [];
Object.assign(globalThis, {
  window: { __TAURI_INTERNALS__: { invoke: async (cmd: string) => backend(cmd) } },
  localStorage: {
    getItem: () => null,
    setItem: (key: string) => {
      browserStorageWrites.push(key);
    },
  },
});
const api = await import("./api.ts");
const syntopicon = await import("./api/syntopiconApi.ts");

const assessment: ExitAssessmentPayload = {
  classification: "Theoretical - Science",
  unityStatement: "A book about agreement between computers.",
  partsStructure: ["Consistency models", "State machine replication"],
  completedAt: "2026-09-15T10:00:00Z",
};
const vocabularyEntry: VocabularyEntry = {
  word: "quorum",
  definition: "A set of nodes that overlaps every other set.",
  anchor: "^p-005",
  savedAt: "2026-09-15T10:00:00Z",
};
const analyticalStore: AnalyticalStore = { terms: [], arguments: [] };
const topic: SyntopicTopic = {
  id: "division-of-labour",
  title: "Division of labour",
  description: "",
  neutralTerms: [],
  questions: [],
  controversies: [],
  createdAt: "2026-09-15T10:00:00Z",
};

/** Every API function that calls a backend command, with example arguments. */
const backendCalls: [name: string, call: () => Promise<unknown>][] = [
  ["fetchLibraryBooks", () => api.fetchLibraryBooks()],
  ["fetchAvailableBooks", () => api.fetchAvailableBooks()],
  ["fetchBookMeta", () => api.fetchBookMeta("sample")],
  ["getInspectionalBlueprint", () => api.getInspectionalBlueprint("sample")],
  ["saveInspectionalExitAssessment", () => api.saveInspectionalExitAssessment("sample", assessment)],
  ["fetchChapter", () => api.fetchChapter("sample", "ch-01.md")],
  ["fetchNotes", () => api.fetchNotes("sample", "ch-01-notes.md")],
  ["persistNotes", () => api.persistNotes("sample", "ch-01-notes.md", "My reflections")],
  ["searchVault", () => api.searchVault("consensus")],
  ["indexVault", () => api.indexVault()],
  ["getVaultPath", () => api.getVaultPath()],
  ["syncPracticeDeck", () => api.syncPracticeDeck("sample")],
  ["getDueCards", () => api.getDueCards("sample", "cloze", 20, 0.5)],
  ["getChapterDueCards", () => api.getChapterDueCards("sample", "ch-01.md", "cloze", 3, 0.5)],
  ["submitReview", () => api.submitReview("card-ch-01-001", 3)],
  ["getDeckStats", () => api.getDeckStats("sample")],
  ["getAllBookNotes", () => api.getAllBookNotes("sample")],
  ["exportBookSummary", () => api.exportBookSummary("sample")],
  ["getStudyAnalytics", () => api.getStudyAnalytics("sample")],
  ["fetchReviewHeatmap", () => api.fetchReviewHeatmap("sample")],
  ["fetchRetentionMetrics", () => api.fetchRetentionMetrics("sample")],
  ["fetchReadingVelocity", () => api.fetchReadingVelocity("sample")],
  ["recordReadingProgress", () => api.recordReadingProgress("sample", "ch-01.md", 15, 261, false)],
  ["lookupDictionaryTerm", () => api.lookupDictionaryTerm("elementary")],
  ["saveBookVocabulary", () => api.saveBookVocabulary("sample", vocabularyEntry)],
  ["getAnalyticalData", () => api.getAnalyticalData("sample")],
  ["saveAnalyticalData", () => api.saveAnalyticalData("sample", analyticalStore)],
  ["getSyntopicTopics", () => syntopicon.getSyntopicTopics()],
  ["getSyntopicTopic", () => syntopicon.getSyntopicTopic("division-of-labor")],
  ["saveSyntopicTopic", () => syntopicon.saveSyntopicTopic(topic)],
  ["exportSyntopicReport", () => syntopicon.exportSyntopicReport("division-of-labor")],
];

test("inside the app, every backend call that fails rejects with the backend error", async () => {
  const answered: string[] = [];
  for (const [name, call] of backendCalls) {
    try {
      await call();
      answered.push(name);
    } catch (error) {
      assert.match(String(error), /failed: the vault is not reachable$/, name);
    }
  }
  assert.deepEqual(answered, [], "these calls gave an answer although the backend failed");
  assert.deepEqual(browserStorageWrites, [], "these browser storage keys were written instead of the vault");
});

test("inside the app, an empty backend answer stays empty", async () => {
  backend = (cmd) => (cmd === "lookup_dictionary_term" ? null : []);
  assert.deepEqual(await syntopicon.getSyntopicTopics(), [], "a vault with no topics");
  assert.equal(await api.lookupDictionaryTerm("elementary"), null, "a word the dictionary does not have");
});
