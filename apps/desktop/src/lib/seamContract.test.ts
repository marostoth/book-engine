import { test } from "vitest";
import assert from "node:assert/strict";
import contract from "./seamContract.json";
import { highlightsFrom, vocabularyFrom } from "./backendShapes.ts";
import type { VaultStatus } from "./api/vaultApi.ts";
import type { Bookmark, LastBookmark } from "./readingPlace.ts";
import type {
  AggregatedNoteItem,
  AnalyticalStore,
  AnchoredCitation,
  ArgumentNode,
  AuthorInquiry,
  AuthorTerm,
  BookMetadata,
  BookSummary,
  CardSchedule,
  ChapterMeta,
  ChapterNoteFile,
  ChapterReadingStatItem,
  CritiqueItem,
  CrossBookCitation,
  DictionaryEntry,
  ElementaryMetrics,
  ExitAssessmentPayload,
  HighlightItem,
  IndexProblem,
  IndexSummary,
  InquiryDomain,
  InquiryPriority,
  InspectionalBlueprint,
  InspectionalSampling,
  NeutralTerm,
  PracticeCardItem,
  ReadingVelocityStats,
  RenamedBook,
  ResolutionStatus,
  RetentionMetrics,
  ReviewBlock,
  ScenarioOption,
  ScenarioPayload,
  SearchResult,
  StateCounts,
  StudyAnalytics,
  SyntopicControversy,
  SyntopicPerspective,
  SyntopicQuestion,
  SyntopicTopic,
  SyntopicTopicSummary,
  TermMapping,
  VocabularyEntry,
} from "./types.ts";

// seamContract.json holds one example of every shape that crosses between Rust and TypeScript (TL-14). The Rust test
// `seam_contract_tests.rs` fails when serde writes an example another way, and this file does not compile when a
// TypeScript type and its example do not name the same fields. So a field renamed on one side only fails a check.

/** The fields that one side names and the other does not. */
type OneSideOnly<T, J> = Exclude<keyof T, keyof J> | Exclude<keyof J, keyof T>;

/**
 * Pins the type `T` to its example. When a field is on one side only, `tsc` fails on the `{}` and names the field:
 * "Property 'createdAt' is missing in type '{}'".
 */
function pin<T>() {
  return <J extends object>(example: J, oneSideOnly: Record<OneSideOnly<T, J>, never>) => {
    void oneSideOnly;
    return example;
  };
}

/** Pins an enum: every value of `U` is in `values`, and `tsc` names a value that is not. */
function every<U extends string>() {
  return <const L extends readonly U[]>(values: L, missing: Record<Exclude<U, L[number]>, never>) => {
    void missing;
    return values;
  };
}

const PINNED = {
  AggregatedNoteItem: pin<AggregatedNoteItem>()(contract.AggregatedNoteItem, {}),
  AnalyticalStore: pin<AnalyticalStore>()(contract.AnalyticalStore, {}),
  AnchoredCitation: pin<AnchoredCitation>()(contract.AnchoredCitation, {}),
  ArgumentNode: pin<ArgumentNode>()(contract.ArgumentNode, {}),
  AuthorInquiry: pin<AuthorInquiry>()(contract.AuthorInquiry, {}),
  AuthorTerm: pin<AuthorTerm>()(contract.AuthorTerm, {}),
  BookBookmark: pin<LastBookmark>()(contract.BookBookmark, {}),
  BookMetadata: pin<BookMetadata>()(contract.BookMetadata, {}),
  BookSummary: pin<BookSummary>()(contract.BookSummary, {}),
  Bookmark: pin<Bookmark>()(contract.Bookmark, {}),
  CardSchedule: pin<CardSchedule>()(contract.CardSchedule, {}),
  ChapterMeta: pin<ChapterMeta>()(contract.ChapterMeta, {}),
  ChapterNoteFile: pin<ChapterNoteFile>()(contract.ChapterNoteFile, {}),
  ChapterReadingStatItem: pin<ChapterReadingStatItem>()(contract.ChapterReadingStatItem, {}),
  CritiqueItem: pin<CritiqueItem>()(contract.CritiqueItem, {}),
  CrossBookCitation: pin<CrossBookCitation>()(contract.CrossBookCitation, {}),
  DictionaryEntry: pin<DictionaryEntry>()(contract.DictionaryEntry, {}),
  ElementaryMetrics: pin<ElementaryMetrics>()(contract.ElementaryMetrics, {}),
  ExitAssessmentPayload: pin<ExitAssessmentPayload>()(contract.ExitAssessmentPayload, {}),
  HighlightItem: pin<HighlightItem>()(contract.HighlightItem, {}),
  IndexProblem: pin<IndexProblem>()(contract.IndexProblem, {}),
  IndexSummary: pin<IndexSummary>()(contract.IndexSummary, {}),
  InquiryDomain: every<InquiryDomain>()(["theoretical", "practical"], {}),
  InquiryPriority: every<InquiryPriority>()(["primary", "subordinate"], {}),
  InspectionalBlueprint: pin<InspectionalBlueprint>()(contract.InspectionalBlueprint, {}),
  InspectionalSampling: pin<InspectionalSampling>()(contract.InspectionalSampling, {}),
  NeutralTerm: pin<NeutralTerm>()(contract.NeutralTerm, {}),
  PracticeCardItem: pin<PracticeCardItem>()(contract.PracticeCardItem, {}),
  ReadingVelocityStats: pin<ReadingVelocityStats>()(contract.ReadingVelocityStats, {}),
  RenamedBook: pin<RenamedBook>()(contract.RenamedBook, {}),
  ResolutionStatus: every<ResolutionStatus>()(["solved", "unsolvedAcknowledged", "unsolvedUnrecognized"], {}),
  RetentionMetrics: pin<RetentionMetrics>()(contract.RetentionMetrics, {}),
  ReviewBlock: pin<ReviewBlock>()(contract.ReviewBlock, {}),
  ScenarioOption: pin<ScenarioOption>()(contract.ScenarioOption, {}),
  ScenarioPayload: pin<ScenarioPayload>()(contract.ScenarioPayload, {}),
  SearchResult: pin<SearchResult>()(contract.SearchResult, {}),
  StateCounts: pin<StateCounts>()(contract.StateCounts, {}),
  StudyAnalytics: pin<StudyAnalytics>()(contract.StudyAnalytics, {}),
  SyntopicControversy: pin<SyntopicControversy>()(contract.SyntopicControversy, {}),
  SyntopicPerspective: pin<SyntopicPerspective>()(contract.SyntopicPerspective, {}),
  SyntopicQuestion: pin<SyntopicQuestion>()(contract.SyntopicQuestion, {}),
  SyntopicTopic: pin<SyntopicTopic>()(contract.SyntopicTopic, {}),
  SyntopicTopicSummary: pin<SyntopicTopicSummary>()(contract.SyntopicTopicSummary, {}),
  TermMapping: pin<TermMapping>()(contract.TermMapping, {}),
  VaultStatus: pin<VaultStatus>()(contract.VaultStatus, {}),
  VocabularyEntry: pin<VocabularyEntry>()(contract.VocabularyEntry, {}),
};

test("every shape of the contract is pinned to a TypeScript type, and nothing else is", () => {
  assert.deepStrictEqual(Object.keys(PINNED).sort(), Object.keys(contract).sort());
  assert.equal(Object.keys(PINNED).length, 46, "43 structs and 3 enums cross the seam");
});

test("each enum holds the same values on both sides", () => {
  assert.deepStrictEqual([...PINNED.InquiryDomain].sort(), [...contract.InquiryDomain].sort());
  assert.deepStrictEqual([...PINNED.InquiryPriority].sort(), [...contract.InquiryPriority].sort());
  assert.deepStrictEqual([...PINNED.ResolutionStatus].sort(), [...contract.ResolutionStatus].sort());
});

test("a highlight as Rust writes it is kept whole", () => {
  assert.deepStrictEqual(highlightsFrom([contract.HighlightItem], "test"), [contract.HighlightItem]);
});

test("a saved word as Rust writes it is kept whole", () => {
  assert.deepStrictEqual(vocabularyFrom([contract.VocabularyEntry], "test"), [contract.VocabularyEntry]);
});
