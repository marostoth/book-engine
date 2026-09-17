import test from "node:test";
import assert from "node:assert/strict";
import { createProgressTicker, scrollPercent, type ScrollBox } from "./readerProgress.ts";
import type { ChapterRef } from "./readingPlace.ts";

const CHAPTER: ChapterRef = { bookId: "wealth-of-nations", chapterFile: "ch-05.md" };
const OTHER: ChapterRef = { bookId: "wealth-of-nations", chapterFile: "ch-06.md" };

/** A reader window of 900 pixels over a chapter `pixels` tall, scrolled `top` pixels down. */
function box(top: number, pixels = 100_000): ScrollBox {
  return { scrollTop: top, scrollHeight: pixels, clientHeight: 900 };
}

test("a chapter that fits on one screen is read to its end", () => {
  assert.equal(scrollPercent({ scrollTop: 0, scrollHeight: 700, clientHeight: 900 }), 100);
  assert.equal(scrollPercent({ scrollTop: 0, scrollHeight: 900, clientHeight: 900 }), 100);
});

test("the percent says how far down the chapter the reader is", () => {
  assert.equal(scrollPercent(box(0)), 0);
  assert.equal(scrollPercent(box((100_000 - 900) / 2)), 50);
  assert.equal(scrollPercent(box(100_000 - 900)), 100);
});

test("the percent is a whole number, and never below 0 or above 100", () => {
  // A trackpad can pull the chapter past its ends, which gives a scroll position outside the chapter.
  assert.equal(scrollPercent(box(-300)), 0);
  assert.equal(scrollPercent(box(200_000)), 100);
  assert.equal(scrollPercent(box(1_240)), 1);
  assert.equal(scrollPercent(box(1_730)), 2);
});

test("the first scroll of a chapter is reported", () => {
  const ticker = createProgressTicker();
  assert.equal(ticker.changed(box(0), CHAPTER), 0);
});

test("a scroll inside the same whole percent is not reported", () => {
  const ticker = createProgressTicker();

  // One percent of this chapter is 991 pixels, so these three scrolls are all 20 percent down.
  assert.equal(ticker.changed(box(20_000), CHAPTER), 20);
  assert.equal(ticker.changed(box(20_100), CHAPTER), undefined);
  assert.equal(ticker.changed(box(20_300), CHAPTER), undefined);
});

test("a scroll that changes the whole percent is reported, up and down", () => {
  const ticker = createProgressTicker();

  assert.equal(ticker.changed(box(20_000), CHAPTER), 20);
  assert.equal(ticker.changed(box(21_000), CHAPTER), 21);
  assert.equal(ticker.changed(box(20_000), CHAPTER), 20);
});

test("the same percent of another chapter is reported, so the chapter you open shows its own progress", () => {
  const ticker = createProgressTicker();

  assert.equal(ticker.changed(box(0), CHAPTER), 0);
  assert.equal(ticker.changed(box(0), OTHER), 0);
  assert.equal(ticker.changed(box(0), OTHER), undefined);
  // The words of a chapter that is still loading belong to no chapter.
  assert.equal(ticker.changed(box(0), null), 0);
  assert.equal(ticker.changed(box(0), null), undefined);
});

test("a chapter that is opened again reports its percent, even the one it had before", () => {
  const ticker = createProgressTicker();

  assert.equal(ticker.changed(box(40_000), CHAPTER), 40);
  assert.equal(ticker.changed(box(0), OTHER), 0);
  assert.equal(ticker.changed(box(40_000), CHAPTER), 40);
});

test("one long scroll of a big chapter reports each percent once, not each scroll event (RD-06)", () => {
  // The page sends a scroll event for every few pixels it moves. Each report renders the whole app, so a wheel
  // turn used to do that work tens of times for the same percent.
  const ticker = createProgressTicker();
  const events = 400;
  const step = (100_000 - 900) / events;

  let reports = 0;
  const seen: number[] = [];
  for (let event = 0; event <= events; event++) {
    const percent = ticker.changed(box(Math.round(event * step)), CHAPTER);
    if (percent !== undefined) {
      reports += 1;
      seen.push(percent);
    }
  }

  assert.equal(reports, 101, `${events + 1} scroll events made ${reports} reports`);
  assert.equal(seen[0], 0);
  assert.equal(seen[seen.length - 1], 100);
  // Every percent is reported once, and in order.
  assert.deepEqual(seen, Array.from({ length: 101 }, (_unused, percent) => percent));
});
