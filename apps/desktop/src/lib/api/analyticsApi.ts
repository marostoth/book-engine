import type {
  StudyAnalytics,
  DayReviewActivity,
  RetentionMetrics,
  ReadingVelocityStats,
} from "../types.ts";
import { callBackend } from "./clientBase.ts";

export async function getStudyAnalytics(bookId?: string): Promise<StudyAnalytics> {
  return callBackend<StudyAnalytics>("get_study_analytics", { bookId: bookId || null }, (dev) =>
    dev.getStudyAnalytics()
  );
}

export async function fetchReviewHeatmap(bookId?: string): Promise<DayReviewActivity[]> {
  return callBackend<DayReviewActivity[]>("get_review_heatmap", { bookId }, (dev) => dev.fetchReviewHeatmap());
}

export async function fetchRetentionMetrics(bookId?: string): Promise<RetentionMetrics> {
  return callBackend<RetentionMetrics>("get_retention_metrics", { bookId }, (dev) => dev.fetchRetentionMetrics());
}

export async function fetchReadingVelocity(bookId?: string): Promise<ReadingVelocityStats> {
  return callBackend<ReadingVelocityStats>("get_reading_velocity", { bookId }, (dev) =>
    dev.fetchReadingVelocity(bookId)
  );
}

export async function recordReadingProgress(
  bookId: string,
  chapterFile: string,
  secondsSpent: number,
  wordsRead: number,
  completed: boolean
): Promise<void> {
  return callBackend<void>(
    "record_reading_progress",
    { bookId, chapterFile, secondsSpent, wordsRead, completed },
    (dev) => dev.recordReadingProgress(bookId, chapterFile, secondsSpent, wordsRead, completed)
  );
}
