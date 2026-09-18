import type { StudyAnalytics, ReadingVelocityStats } from "../types.ts";
import { callBackend } from "./clientBase.ts";

/**
 * Everything the analytics window shows: the review blocks its activity grid draws, the card state counts, the
 * retention rate, and the size of the vault.
 *
 * `fetchReviewHeatmap` and `fetchRetentionMetrics` were deleted here (LC-03). Each asked for one part of this
 * answer, and no screen had called either since AN-03 made this one carry the lot.
 */
export async function getStudyAnalytics(bookId?: string): Promise<StudyAnalytics> {
  return callBackend<StudyAnalytics>("get_study_analytics", { bookId: bookId || null }, (dev) =>
    dev.getStudyAnalytics()
  );
}

export async function fetchReadingVelocity(bookId?: string): Promise<ReadingVelocityStats> {
  return callBackend<ReadingVelocityStats>("get_reading_velocity", { bookId }, (dev) =>
    dev.fetchReadingVelocity(bookId)
  );
}

/** Saves a piece of reading time. There is no word count: the app cannot see how many words you read (AN-01). */
export async function recordReadingProgress(
  bookId: string,
  chapterFile: string,
  secondsSpent: number,
  completed: boolean
): Promise<void> {
  return callBackend<void>(
    "record_reading_progress",
    { bookId, chapterFile, secondsSpent, completed },
    (dev) => dev.recordReadingProgress(bookId, chapterFile, secondsSpent, completed)
  );
}
