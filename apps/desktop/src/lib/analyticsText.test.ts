import { test } from "vitest";
import assert from "node:assert/strict";
import type { ChapterReadingStatItem, ReadingVelocityStats } from "./types.ts";
import {
  bookName,
  chapterName,
  completedChaptersText,
  countText,
  NO_DATA,
  readingTimeText,
  retentionText,
} from "./analyticsText.ts";

/**
 * AN-03: the analytics window shows only numbers the app has.
 *
 * The window needs React and a DOM, which this repo has no test library for, so these tests drive the text functions
 * the window shows its numbers with.
 */

function reading(completed: number, total: number | null, seconds = 0): ReadingVelocityStats {
  return { total_seconds: seconds, completed_chapters: completed, total_chapters: total, chapter_stats: [] };
}

test("a retention rate of 0% shows as 0%, and no retention rate shows a dash, not a made-up 90%", () => {
  // Before AN-03 the window showed "90.0%" for a rate of 0: `retention_rate ? `${retention_rate}%` : "90.0%"`.
  assert.equal(retentionText(0), "0%", "1 review, rated Again");
  assert.equal(retentionText(50), "50%");
  assert.equal(retentionText(93.4), "93.4%");
  assert.equal(retentionText(null), NO_DATA, "no card was reviewed");
  assert.equal(retentionText(undefined), NO_DATA, "the analytics have not loaded");
});

test("a count shows as it is, 0 too, and a dash while the analytics have not loaded", () => {
  assert.equal(countText(0), "0");
  assert.equal(countText(51), "51");
  assert.equal(countText(undefined), NO_DATA);
});

test("finished chapters show over the chapters the cache counted, not over the open book or a made-up 1", () => {
  // Before AN-03 the window divided by the chapters of the open book, also for All Books, and by 1 with no book open.
  assert.equal(completedChaptersText(reading(2, 66)), "2 / 66");
  assert.equal(completedChaptersText(reading(0, 7)), "0 / 7");
  assert.equal(completedChaptersText(reading(2, null)), "2", "no _meta.json could be read, so there is no total");
  assert.equal(completedChaptersText(null), NO_DATA);
});

test("the reading time shows as before, and a dash while the analytics have not loaded", () => {
  assert.equal(readingTimeText(reading(0, 1, 0)), "0m 0s");
  assert.equal(readingTimeText(reading(0, 1, 3085)), "51m 25s");
  assert.equal(readingTimeText(reading(0, 1, 3725)), "1h 2m");
  assert.equal(readingTimeText(null), NO_DATA);
});

test("a reading row shows the titles of its chapter and book, and a file or folder name only when there is no title", () => {
  const row: ChapterReadingStatItem = {
    book_id: "principles-of-marketing-19ed",
    book_title: "Principles of Marketing, Global Edition",
    chapter_file: "ch-01.md",
    chapter_title: "Chapter 1. Marketing: Creating Customer Value and Engagement",
    seconds_spent: 2000,
    completed: true,
    last_read_at: 1789397367,
  };
  assert.equal(chapterName(row), "Chapter 1. Marketing: Creating Customer Value and Engagement");
  assert.equal(bookName(row), "Principles of Marketing, Global Edition");

  const untitled: ChapterReadingStatItem = { ...row, book_title: null, chapter_title: null };
  assert.equal(chapterName(untitled), "ch-01.md");
  assert.equal(bookName(untitled), "principles-of-marketing-19ed");
});
