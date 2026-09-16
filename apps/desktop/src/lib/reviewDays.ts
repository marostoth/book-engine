import type { ReviewBlock } from "./types.ts";

/**
 * AN-02: the heatmap and the streak count each review on the day it was made, in the time zone of this window.
 *
 * The cache counts the reviews in 15-minute blocks of time (`db/analytics.rs`), because it cannot know the time zone of
 * the window. Every time zone is a whole number of 15-minute blocks from UTC, so a midnight never falls inside a block,
 * and all the reviews of a block are on the day the block starts.
 */

/** The days the streak and the count next to the heatmap title look back over. */
export const DAYS_IN_A_YEAR = 365;

/** The number of week columns in the heatmap. */
export const HEATMAP_WEEKS = 52;

/** One cell of the heatmap: a "YYYY-MM-DD" day in the time zone of this window, and the reviews made on it. */
export interface ReviewDay {
  day: string;
  count: number;
}

/** The "YYYY-MM-DD" day of `date` in the time zone of this window. `toISOString` gives the UTC day. */
export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The start of a "YYYY-MM-DD" day in the time zone of this window. `new Date("YYYY-MM-DD")` gives the UTC midnight. */
export function startOfLocalDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

/**
 * The start of the day `days` days after the day of `date`, or before it when `days` is less than 0. It counts days on
 * the calendar, not in steps of 24 hours, so a day when the clocks change is one day.
 */
function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** The number of reviews made on each "YYYY-MM-DD" day. */
export function reviewsPerDay(blocks: ReviewBlock[]): Map<string, number> {
  const perDay = new Map<string, number>();
  for (const block of blocks) {
    const day = localDay(new Date(block.started_at * 1000));
    perDay.set(day, (perDay.get(day) ?? 0) + block.count);
  }
  return perDay;
}

/**
 * The heatmap columns. Each column is one week from Monday to Sunday, and the last column holds today. The days after
 * today are not in it.
 */
export function heatmapWeeks(perDay: Map<string, number>, today: Date, weeks = HEATMAP_WEEKS): ReviewDay[][] {
  const daysSinceMonday = (today.getDay() + 6) % 7;
  const firstMonday = addDays(today, -daysSinceMonday - (weeks - 1) * 7);
  const columns: ReviewDay[][] = [];
  for (let week = 0; week < weeks; week++) {
    const daysInColumn = week === weeks - 1 ? daysSinceMonday + 1 : 7;
    const column: ReviewDay[] = [];
    for (let weekday = 0; weekday < daysInColumn; weekday++) {
      const day = localDay(addDays(firstMonday, week * 7 + weekday));
      column.push({ day, count: perDay.get(day) ?? 0 });
    }
    columns.push(column);
  }
  return columns;
}

/** The number of reviews made today and on the days before it, `days` days in all. */
export function reviewsInLastDays(perDay: Map<string, number>, today: Date, days = DAYS_IN_A_YEAR): number {
  let total = 0;
  for (let back = 0; back < days; back++) {
    total += perDay.get(localDay(addDays(today, -back))) ?? 0;
  }
  return total;
}

/**
 * The current streak and the longest streak of the last year: days in a row with at least one review. The current
 * streak ends today, or yesterday while today has no review yet.
 */
export function reviewStreaks(perDay: Map<string, number>, today: Date): { current: number; longest: number } {
  const reviewed = (back: number) => (perDay.get(localDay(addDays(today, -back))) ?? 0) > 0;

  let longest = 0;
  let run = 0;
  for (let back = DAYS_IN_A_YEAR; back >= 0; back--) {
    run = reviewed(back) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  let current = 0;
  for (let back = 0; back < DAYS_IN_A_YEAR; back++) {
    if (reviewed(back)) {
      current++;
    } else if (back > 0) {
      break;
    }
  }

  return { current, longest };
}
