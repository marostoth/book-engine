import type { ChapterReadingStatItem, ReadingVelocityStats } from "./types.ts";

/**
 * AN-03: the analytics window shows only numbers the app has. A number it does not have shows as a dash, so a real 0
 * is never hidden behind a made-up default such as a 90% retention rate.
 */

/** What the analytics window shows for a number it does not have. */
export const NO_DATA = "\u2014";

/** The retention rate, such as "93.4%" or "0%". A dash when no card was reviewed or the analytics have not loaded. */
export function retentionText(rate: number | null | undefined): string {
  return rate == null ? NO_DATA : `${rate}%`;
}

/** A count, 0 too. A dash while the analytics have not loaded. */
export function countText(count: number | null | undefined): string {
  return count == null ? NO_DATA : count.toLocaleString();
}

/** The current streak, such as "12 days" or "1 day", 0 too. A dash while the review days are not known (RD-15). */
export function streakText(days: number | null | undefined): string {
  if (days == null) return NO_DATA;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** The longest streak, such as "12d", 0 too. A dash while the review days are not known (RD-15). */
export function bestStreakText(days: number | null | undefined): string {
  return days == null ? NO_DATA : `${days}d`;
}

/**
 * The finished chapters of all the chapters the cache counted, such as "2 / 66". Only the finished chapters when no
 * `_meta.json` could be read, and a dash while the analytics have not loaded.
 */
export function completedChaptersText(stats: ReadingVelocityStats | null): string {
  if (!stats) return NO_DATA;
  return stats.total_chapters == null
    ? `${stats.completed_chapters}`
    : `${stats.completed_chapters} / ${stats.total_chapters}`;
}

/** The reading time, such as "1h 2m" or "51m 25s". A dash while the analytics have not loaded. */
export function readingTimeText(stats: ReadingVelocityStats | null): string {
  if (!stats) return NO_DATA;
  const hours = Math.floor(stats.total_seconds / 3600);
  const minutes = Math.floor((stats.total_seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${stats.total_seconds % 60}s`;
}

/** The name of a reading row: the chapter title in the book's spine, or the file name when the spine does not list it. */
export function chapterName(row: ChapterReadingStatItem): string {
  return row.chapter_title ?? row.chapter_file;
}

/** The book of a reading row: its title, or its folder name when its `_meta.json` cannot be read. */
export function bookName(row: ChapterReadingStatItem): string {
  return row.book_title ?? row.book_id;
}
