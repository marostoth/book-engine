import {
  StudyAnalytics,
  DayReviewActivity,
  RetentionMetrics,
  ReadingVelocityStats,
} from "../types";
import { isTauri, tauriInvoke } from "./clientBase";
import {
  getFallbackRetentionMetrics,
  getFallbackStudyAnalytics,
  getFallbackReadingVelocity,
  updateFallbackReadingProgress,
} from "./fallbackAnalytics";
import { generateFallbackHeatmap } from "./mockData";

export async function getStudyAnalytics(bookId?: string): Promise<StudyAnalytics> {
  if (isTauri) {
    try {
      return await tauriInvoke<StudyAnalytics>("get_study_analytics", { bookId: bookId || null });
    } catch (e) {
      console.warn("Tauri get_study_analytics failed, falling back:", e);
    }
  }
  return getFallbackStudyAnalytics();
}

export async function fetchReviewHeatmap(bookId?: string): Promise<DayReviewActivity[]> {
  if (isTauri) {
    try {
      return await tauriInvoke<DayReviewActivity[]>("get_review_heatmap", { bookId });
    } catch (e) {
      console.warn("Tauri get_review_heatmap failed, falling back:", e);
    }
  }
  return generateFallbackHeatmap();
}

export async function fetchRetentionMetrics(bookId?: string): Promise<RetentionMetrics> {
  if (isTauri) {
    try {
      return await tauriInvoke<RetentionMetrics>("get_retention_metrics", { bookId });
    } catch (e) {
      console.warn("Tauri get_retention_metrics failed, falling back:", e);
    }
  }
  return getFallbackRetentionMetrics();
}

export async function fetchReadingVelocity(bookId?: string): Promise<ReadingVelocityStats> {
  if (isTauri) {
    try {
      return await tauriInvoke<ReadingVelocityStats>("get_reading_velocity", { bookId });
    } catch (e) {
      console.warn("Tauri get_reading_velocity failed, falling back:", e);
    }
  }
  return getFallbackReadingVelocity(bookId);
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
  updateFallbackReadingProgress(bookId, chapterFile, secondsSpent, wordsRead, completed);
}
