import {
  RetentionMetrics,
  ReadingVelocityStats,
  StudyAnalytics,
} from "../types";
import { generateFallbackHeatmap } from "./mockData";

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
    daily_reviews: heatmap,
    state_counts: {
      new_count: 5,
      learning_count: 3,
      review_count: 8,
      relearning_count: 0,
      total_cards: 16,
    },
    retention_rate: retention.retention_rate,
    cards_due_today: retention.due_today,
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
    } catch {}
  }

  return {
    total_seconds: 5280,
    completed_chapters: 2,
    total_words_read: 22400,
    average_wpm: 254.5,
    chapter_stats: [
      {
        chapter_file: "ch-01.md",
        chapter_title: "Chapter 1: Consistency Models",
        seconds_spent: 2640,
        words_read: 11400,
        completed: true,
        wpm: 259.1,
        last_read_at: Math.floor(Date.now() / 1000) - 86400,
      },
      {
        chapter_file: "ch-02.md",
        chapter_title: "Chapter 2: State Machine Replication",
        seconds_spent: 2640,
        words_read: 11000,
        completed: true,
        wpm: 250.0,
        last_read_at: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

export function updateFallbackReadingProgress(
  bookId: string,
  chapterFile: string,
  secondsSpent: number,
  wordsRead: number,
  completed: boolean
): void {
  try {
    const key = `reading_sessions_${bookId}`;
    const cur: ReadingVelocityStats = JSON.parse(
      localStorage.getItem(key) ||
        JSON.stringify({
          total_seconds: 0,
          completed_chapters: 0,
          total_words_read: 0,
          average_wpm: 0,
          chapter_stats: [],
        })
    );

    let ch = cur.chapter_stats.find((s) => s.chapter_file === chapterFile);
    if (!ch) {
      ch = {
        chapter_file: chapterFile,
        seconds_spent: 0,
        words_read: 0,
        completed: false,
        wpm: 0,
        last_read_at: Math.floor(Date.now() / 1000),
      };
      cur.chapter_stats.push(ch);
    }

    ch.seconds_spent += secondsSpent;
    ch.words_read = Math.max(ch.words_read, wordsRead);
    ch.completed = ch.completed || completed;
    ch.last_read_at = Math.floor(Date.now() / 1000);
    ch.wpm = ch.seconds_spent > 0 ? Math.round(ch.words_read / (ch.seconds_spent / 60)) : 0;

    cur.total_seconds = cur.chapter_stats.reduce((acc, s) => acc + s.seconds_spent, 0);
    cur.total_words_read = cur.chapter_stats.reduce((acc, s) => acc + s.words_read, 0);
    cur.completed_chapters = cur.chapter_stats.filter((s) => s.completed).length;
    cur.average_wpm =
      cur.total_seconds > 0 ? Math.round(cur.total_words_read / (cur.total_seconds / 60)) : 0;

    localStorage.setItem(key, JSON.stringify(cur));
  } catch (err) {
    console.warn("Failed to update localStorage reading session:", err);
  }
}
