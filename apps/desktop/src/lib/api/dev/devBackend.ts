/**
 * The browser stand-in for the Tauri backend: sample books, sample notes, and browser storage, for frontend work in a
 * browser (`npm run dev`). Only `callBackend` (`../clientBase.ts`) loads this module, and only in a dev build outside
 * Tauri. The app never shows or saves this data, and a production build does not contain it.
 *
 * Each export stands in for the API function with the same name. `loadBookMetaJson` stands in for `fetchBookMeta`.
 */
export {
  fetchLibraryBooks,
  loadBookMetaJson,
  fetchChapter,
  fetchNotes,
  persistNotes,
  searchVault,
  indexVault,
  getVaultPath,
} from "./fallbackBooks.ts";
export {
  getFallbackInspectionalBlueprint as getInspectionalBlueprint,
  saveFallbackInspectionalExitAssessment as saveInspectionalExitAssessment,
  generateFallbackHeatmap as fetchReviewHeatmap,
} from "./mockData.ts";
export { syncPracticeDeck, getDueCards, getChapterDueCards, submitReview, getDeckStats } from "./fallbackPractice.ts";
export { getAllBookNotes, exportBookSummary } from "./fallbackNotes.ts";
export { getChapterHighlights, saveChapterHighlights } from "./fallbackHighlights.ts";
export {
  fallbackLookupDictionaryTerm as lookupDictionaryTerm,
  fallbackSaveVocabulary as saveBookVocabulary,
} from "./fallbackLexicon.ts";
export { getAnalyticalData, saveAnalyticalData } from "./fallbackAnalytical.ts";
export {
  getFallbackStudyAnalytics as getStudyAnalytics,
  getFallbackRetentionMetrics as fetchRetentionMetrics,
  getFallbackReadingVelocity as fetchReadingVelocity,
  updateFallbackReadingProgress as recordReadingProgress,
} from "./fallbackAnalytics.ts";
export { getSyntopicTopics, getSyntopicTopic, saveSyntopicTopic, exportSyntopicReport } from "./fallbackSyntopicon.ts";
