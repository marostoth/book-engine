// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReadingVelocityStats, ReviewBlock, StudyAnalytics } from "../lib/types.ts";
import { DEFAULT_PREFERENCES } from "../lib/preferences.ts";
import { SettingsContext } from "../hooks/useSettings.ts";
import { NO_DATA } from "../lib/analyticsText.ts";

/**
 * RD-15: the analytics window shows a streak and a year of reviews only when it has them.
 *
 * AN-03 put four numbers behind a dash while they were not known. The streak, the best streak and the reviews of the
 * past year were worked out from an empty list instead, so every opening of the window told the reader "0 days"
 * until the numbers came, and for good when they did not come.
 *
 * These tests draw the real window. Only the two calls to the backend are held, and the error bar is counted.
 */

const getStudyAnalytics = vi.fn<(bookId?: string) => Promise<StudyAnalytics>>();
const fetchReadingVelocity = vi.fn<(bookId?: string) => Promise<ReadingVelocityStats>>();
const reportBackendError = vi.fn();

vi.mock("../lib/api.ts", () => ({
  getStudyAnalytics: (bookId?: string) => getStudyAnalytics(bookId),
  fetchReadingVelocity: (bookId?: string) => fetchReadingVelocity(bookId),
}));
vi.mock("../lib/backendErrors.ts", () => ({
  reportBackendError: (action: string, error: unknown) => reportBackendError(action, error),
}));

const { AnalyticsModal } = await import("./AnalyticsModal.tsx");

afterEach(() => {
  cleanup();
  getStudyAnalytics.mockReset();
  fetchReadingVelocity.mockReset();
  reportBackendError.mockReset();
});

/** A review block at noon, `back` days before today, in the time zone of this test. */
function blockDaysAgo(back: number, count: number): ReviewBlock {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  noon.setDate(noon.getDate() - back);
  return { started_at: Math.floor(noon.getTime() / 1000), count };
}

function study(blocks: ReviewBlock[]): StudyAnalytics {
  return {
    review_blocks: blocks,
    state_counts: { new_count: 3, learning_count: 1, review_count: 5, relearning_count: 0, total_cards: 9 },
    retention_rate: 93.4,
    reviews_due: 2,
    new_cards: 3,
    mastered_cards: 4,
    total_vault_words: 80602,
    estimated_reading_time_mins: 322,
  };
}

const READING: ReadingVelocityStats = {
  total_seconds: 0,
  completed_chapters: 0,
  total_chapters: 16,
  chapter_stats: [],
};

function openWindow() {
  render(
    <SettingsContext.Provider value={{ settings: DEFAULT_PREFERENCES, change: () => {} }}>
      <AnalyticsModal isOpen onClose={() => {}} activeBookId="wealth-of-nations" />
    </SettingsContext.Provider>
  );
}

/** Lets the held calls answer, and React draw what they gave. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The streak line, such as "Streak: 2 days(Best: 2d)". */
function streakLine(): string {
  return screen.getByText(/Streak:/).closest("div")?.textContent ?? "";
}

/** The count over the activity grid, such as "(7 reviews in past 365 days)". */
function yearLine(): string {
  return screen.getByText(/reviews in past 365 days/).textContent ?? "";
}

/** The grid cells that state a number of reviews for their day. */
function cellsThatStateACount(): number {
  return document.querySelectorAll('[title$=" reviews"]').length;
}

test("while the numbers are on their way, the streak and the year show a dash, not 0", () => {
  getStudyAnalytics.mockReturnValue(new Promise(() => {}));
  fetchReadingVelocity.mockReturnValue(new Promise(() => {}));
  openWindow();
  assert.equal(getStudyAnalytics.mock.calls.length, 1, "the window did not ask, so this test reads nothing");

  assert.equal(streakLine(), `Streak: ${NO_DATA}(Best: ${NO_DATA})`);
  assert.equal(yearLine(), `(${NO_DATA} reviews in past 365 days)`);
  assert.equal(cellsThatStateACount(), 0, "no day of the grid may say it had 0 reviews");
});

test("when the numbers do not come, the streak and the year show a dash, not 0", async () => {
  getStudyAnalytics.mockRejectedValue(new Error("index.db is locked"));
  fetchReadingVelocity.mockResolvedValue(READING);
  openWindow();
  await settle();
  assert.equal(reportBackendError.mock.calls.length, 1, "the load did not fail, so this test reads nothing");

  assert.equal(streakLine(), `Streak: ${NO_DATA}(Best: ${NO_DATA})`);
  assert.equal(yearLine(), `(${NO_DATA} reviews in past 365 days)`);
  assert.equal(cellsThatStateACount(), 0, "no day of the grid may say it had 0 reviews");
});

test("asking again with Refresh shows a dash until the new numbers come, not the last ones and not 0", async () => {
  getStudyAnalytics.mockResolvedValue(study([blockDaysAgo(0, 3), blockDaysAgo(1, 4)]));
  fetchReadingVelocity.mockResolvedValue(READING);
  openWindow();
  await settle();
  assert.equal(streakLine(), "Streak: 2 days(Best: 2d)", "the first numbers did not arrive");

  // The reader points at a day, then asks again. The new answer is held.
  const today = document.querySelector('[title$=": 3 reviews"]');
  assert.ok(today, "the grid has no day with 3 reviews, so this test reads nothing");
  fireEvent.mouseEnter(today);
  assert.ok(screen.queryByText(/reviews? on/), "pointing at a day did not show its count");

  getStudyAnalytics.mockReturnValue(new Promise(() => {}));
  fetchReadingVelocity.mockReturnValue(new Promise(() => {}));
  fireEvent.click(screen.getByTitle("Refresh Analytics"));
  assert.equal(getStudyAnalytics.mock.calls.length, 2, "Refresh did not ask again");

  assert.equal(streakLine(), `Streak: ${NO_DATA}(Best: ${NO_DATA})`);
  assert.equal(yearLine(), `(${NO_DATA} reviews in past 365 days)`);
  assert.ok(screen.queryByText(/reviews? on/) === null, "the day's count from the last answer is still shown");
});

test("the numbers that came are shown, and a real 0 is still 0", async () => {
  // The control: this passes before and after RD-15.
  getStudyAnalytics.mockResolvedValue(study([blockDaysAgo(0, 3), blockDaysAgo(1, 4), blockDaysAgo(5, 1)]));
  fetchReadingVelocity.mockResolvedValue(READING);
  openWindow();
  await settle();
  assert.ok(screen.queryByText("93.4%"), "the numbers did not arrive, so this test reads nothing");

  assert.equal(streakLine(), "Streak: 2 days(Best: 2d)");
  assert.equal(yearLine(), "(8 reviews in past 365 days)");
  assert.ok(cellsThatStateACount() > 300, "every day of the year states its count");
  cleanup();

  getStudyAnalytics.mockResolvedValue(study([]));
  openWindow();
  await settle();
  assert.ok(screen.queryByText("93.4%"), "the numbers did not arrive, so this test reads nothing");

  assert.equal(streakLine(), "Streak: 0 days(Best: 0d)");
  assert.equal(yearLine(), "(0 reviews in past 365 days)");
});
