import {
  RetentionMetrics,
  ReadingVelocityStats,
  StudyAnalytics,
} from "../../types";
import { FALLBACK_META, generateFallbackHeatmap } from "./mockData";

export function getFallbackRetentionMetrics(): RetentionMetrics {
  return {
    due_today: 4,
    total_cards: 16,
    mastered_cards: 7,
    retention_rate: 93.4,
  };
}

export function getFallbackStudyAnalytics(): StudyAnalytics {
  const heatmap = generateFallbackHeatmap();
  const retention = getFallbackRetentionMetrics();
  const totalVaultWords = 22400;

  return {
    review_blocks: heatmap,
    state_counts: {
      new_count: 5,
      learning_count: 3,
      review_count: 8,
      relearning_count: 0,
      total_cards: 16,
    },
    retention_rate: retention.retention_rate,
    reviews_due: retention.due_today,
    new_cards: 5,
    mastered_cards: retention.mastered_cards,
    total_vault_words: totalVaultWords,
    estimated_reading_time_mins: Math.round(totalVaultWords / 225),
  };
}

export function getFallbackReadingVelocity(bookId?: string): ReadingVelocityStats {
  const storedSessions = localStorage.getItem(`reading_sessions_${bookId || "all"}`);
  if (storedSessions) {
    try {
      return JSON.parse(storedSessions);
    } catch {
      // A stored value this browser cannot read is no value, and the answer below is the empty one.
    }
  }

  return {
    total_seconds: 5280,
    completed_chapters: 2,
    total_chapters: FALLBACK_META.total_chapters,
    chapter_stats: [
      {
        book_id: FALLBACK_META.book_id,
        book_title: FALLBACK_META.title,
        chapter_file: "ch-01.md",
        chapter_title: "Chapter 1: Consistency Models",
        seconds_spent: 2640,
        completed: true,
        last_read_at: Math.floor(Date.now() / 1000) - 86400,
      },
      {
        book_id: FALLBACK_META.book_id,
        book_title: FALLBACK_META.title,
        chapter_file: "ch-02.md",
        chapter_title: "Chapter 2: State Machine Replication",
        seconds_spent: 2640,
        completed: true,
        last_read_at: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

export function updateFallbackReadingProgress(
  bookId: string,
  chapterFile: string,
  secondsSpent: number,
  completed: boolean
): void {
  try {
    const key = `reading_sessions_${bookId}`;
    const cur: ReadingVelocityStats = JSON.parse(
      localStorage.getItem(key) ||
        JSON.stringify({
          total_seconds: 0,
          completed_chapters: 0,
          total_chapters: bookId === FALLBACK_META.book_id ? FALLBACK_META.total_chapters : null,
          chapter_stats: [],
        })
    );

    let ch = cur.chapter_stats.find((s) => s.chapter_file === chapterFile);
    if (!ch) {
      const sample = bookId === FALLBACK_META.book_id;
      ch = {
        book_id: bookId,
        book_title: sample ? FALLBACK_META.title : null,
        chapter_file: chapterFile,
        chapter_title: (sample && FALLBACK_META.spine.find((c) => c.file_path === chapterFile)?.title) || null,
        seconds_spent: 0,
        completed: false,
        last_read_at: Math.floor(Date.now() / 1000),
      };
      cur.chapter_stats.push(ch);
    }

    ch.seconds_spent += secondsSpent;
    ch.completed = ch.completed || completed;
    ch.last_read_at = Math.floor(Date.now() / 1000);

    cur.total_seconds = cur.chapter_stats.reduce((acc, s) => acc + s.seconds_spent, 0);
    cur.completed_chapters = cur.chapter_stats.filter((s) => s.completed).length;

    localStorage.setItem(key, JSON.stringify(cur));
  } catch (err) {
    console.warn("Failed to update localStorage reading session:", err);
  }
}
