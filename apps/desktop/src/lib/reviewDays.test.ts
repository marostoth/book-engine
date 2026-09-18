import { test } from "vitest";
import assert from "node:assert/strict";
import type { ReviewBlock } from "./types.ts";
import { heatmapWeeks, localDay, reviewsInLastDays, reviewsPerDay, reviewStreaks, startOfLocalDay } from "./reviewDays.ts";

/**
 * AN-02: the heatmap and the streak count each review on the day it was made, in the time zone of the window.
 *
 * The heatmap needs React and a DOM, which this repo has no test library for, so these tests drive the functions the
 * heatmap and the streak are built on. Each test sets the time zone of the test process, so the tests give the same
 * result on every computer.
 */

/** The 15-minute block of a UTC time, as the cache sends it (`db/analytics.rs`). */
function block(utc: string, count = 1): ReviewBlock {
  const seconds = Date.parse(utc) / 1000;
  return { started_at: seconds - (seconds % 900), count };
}

/** The reviews of `db/analytics_tests.rs`: at 00:40, 00:52 and 11:05 on 16 September 2026 in UTC+1. */
const REVIEWS_AFTER_MIDNIGHT = [
  block("2026-09-15T23:40:05Z"),
  block("2026-09-15T23:52:10Z"),
  block("2026-09-16T10:05:00Z"),
];

/** Wednesday 16 September 2026 at 18:36, in the time zone of the test. */
const wednesdayEvening = () => new Date(2026, 8, 16, 18, 36);

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekdayOf = (day: string) => startOfLocalDay(day).toLocaleDateString("en-GB", { weekday: "short" });

test("a review after midnight counts on the day of the window's time zone, not on the UTC day", () => {
  process.env.TZ = "Europe/London";
  assert.deepEqual([...reviewsPerDay(REVIEWS_AFTER_MIDNIGHT)], [["2026-09-16", 3]], "UTC+1: all 3 on 16 September");

  process.env.TZ = "America/New_York";
  assert.deepEqual(
    [...reviewsPerDay(REVIEWS_AFTER_MIDNIGHT)],
    [
      ["2026-09-15", 2],
      ["2026-09-16", 1],
    ],
    "UTC-4: at 19:40 and 19:52 on 15 September, and at 06:05 on 16 September"
  );
});

test("the rows go from Monday to Sunday, and the last column ends with today and its reviews", () => {
  process.env.TZ = "Europe/London";
  const weeks = heatmapWeeks(reviewsPerDay(REVIEWS_AFTER_MIDNIGHT), wednesdayEvening());

  assert.equal(weeks.length, 52);
  for (const week of weeks) {
    week.forEach((cell, row) => assert.equal(weekdayOf(cell.day), WEEKDAYS[row], `${cell.day} is in the row of ${WEEKDAYS[row]}`));
  }
  assert.equal(weeks[0][0].day, "2025-09-22", "the first column starts on a Monday");
  assert.deepEqual(
    weeks[weeks.length - 1],
    [
      { day: "2026-09-14", count: 0 },
      { day: "2026-09-15", count: 0 },
      { day: "2026-09-16", count: 3 },
    ],
    "today's reviews show, and no day after today is in the heatmap"
  );
});

test("every day is in the heatmap once, also on the days the clocks change", () => {
  process.env.TZ = "Europe/London";
  const days = heatmapWeeks(new Map(), wednesdayEvening())
    .flat()
    .map((cell) => cell.day);

  assert.equal(days.length, 51 * 7 + 3);
  for (let i = 1; i < days.length; i++) {
    const dayBefore = startOfLocalDay(days[i - 1]);
    const next = localDay(new Date(dayBefore.getFullYear(), dayBefore.getMonth(), dayBefore.getDate() + 1));
    assert.equal(days[i], next, `the day after ${days[i - 1]}`);
  }
  assert.ok(days.includes("2025-10-26"), "the clocks went back on 26 October 2025");
  assert.ok(days.includes("2026-03-29"), "the clocks went forward on 29 March 2026");
});

test("the streak counts the days of the window's time zone, and today with no review yet does not end it", () => {
  process.env.TZ = "Europe/London";
  // At 00:40 on Tuesday 15 September and at 11:05 on Wednesday 16 September, in UTC+1. The UTC day of the first
  // review is 14 September.
  const perDay = reviewsPerDay([block("2026-09-14T23:40:05Z"), block("2026-09-16T10:05:00Z")]);

  assert.deepEqual(reviewStreaks(perDay, wednesdayEvening()), { current: 2, longest: 2 });
  assert.deepEqual(reviewStreaks(perDay, new Date(2026, 8, 17, 9, 0)), { current: 2, longest: 2 }, "17 September, no review yet");
  assert.deepEqual(reviewStreaks(perDay, new Date(2026, 8, 18, 9, 0)), { current: 0, longest: 2 }, "no review on 17 September");
});

test("a streak goes on over the night the clocks go forward", () => {
  process.env.TZ = "Europe/London";
  // A review at 00:30 local time on each day from 27 to 30 March 2026. 29 March had 23 hours.
  const perDay = reviewsPerDay([
    block("2026-03-27T00:30:00Z"),
    block("2026-03-28T00:30:00Z"),
    block("2026-03-29T00:30:00Z"),
    block("2026-03-29T23:30:00Z"),
  ]);
  // 30 March at 00:45 local time. A step of 24 hours back from it is 28 March at 23:45, which jumps over 29 March.
  assert.deepEqual(reviewStreaks(perDay, new Date(2026, 2, 30, 0, 45)), { current: 4, longest: 4 });
});

test("the count next to the heatmap title is the reviews of the past 365 days", () => {
  process.env.TZ = "Europe/London";
  const perDay = new Map([
    ["2026-09-16", 3],
    ["2025-09-17", 2],
    ["2025-09-16", 5],
  ]);
  assert.equal(reviewsInLastDays(perDay, wednesdayEvening()), 5, "today and the 364 days before it, not 365 days ago");
});

test("the date shown for a day is that day in every time zone", () => {
  for (const zone of ["Pacific/Pago_Pago", "America/New_York", "Europe/London", "Asia/Kathmandu", "Pacific/Kiritimati"]) {
    process.env.TZ = zone;
    const start = startOfLocalDay("2026-09-16");
    assert.equal(start.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), "16 September 2026", zone);
    assert.equal(localDay(start), "2026-09-16", zone);
  }
});

test("all the reviews of a 15-minute block are on one day in every time zone", () => {
  // Zones 30 or 45 minutes off a whole hour: India +5:30, Nepal +5:45, Chatham Islands +12:45, Marquesas -9:30.
  const zones = ["Asia/Kolkata", "Asia/Kathmandu", "Pacific/Chatham", "Pacific/Marquesas", "Europe/London", "America/New_York"];
  for (const zone of zones) {
    process.env.TZ = zone;
    for (let start = Date.parse("2026-09-15T00:00:00Z"); start < Date.parse("2026-09-17T00:00:00Z"); start += 900_000) {
      const lastSecond = new Date(start + 899_000);
      assert.equal(localDay(new Date(start)), localDay(lastSecond), `${zone}: the block at ${new Date(start).toISOString()}`);
    }
  }
});
