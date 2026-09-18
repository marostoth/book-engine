import { test } from "vitest";
import assert from "node:assert/strict";
import type { ChapterRef } from "./readingPlace.ts";
import { createReadingTimer, LONGEST_TICK_MS, type ReadingPiece } from "./readingTime.ts";

/**
 * AN-01: every focused second a chapter is on screen counts, a chapter is finished only by its own scroll position, and
 * no word count is saved.
 *
 * The reader screen needs React and a DOM, which this repo has no test library for, so these tests drive the timer the
 * screen is built on: `useBookSession` shows it the chapter whose words are on screen, ticks it every second, and gives
 * it every scroll of the reader.
 */

const chapterOne: ChapterRef = { bookId: "dalton", chapterFile: "ch-01.md" };
const chapterTwo: ChapterRef = { bookId: "dalton", chapterFile: "ch-02.md" };

function timerWithSaves() {
  const saves: { chapterFile: string; piece: ReadingPiece }[] = [];
  const timer = createReadingTimer((chapter, piece) => saves.push({ chapterFile: chapter.chapterFile, piece }));
  return { timer, saves };
}

const at = (seconds: number) => seconds * 1000;

test("a scroll does not start the reading time again", () => {
  const { timer, saves } = timerWithSaves();
  timer.show(chapterOne, 0, true);
  // A scroll every 3 seconds. The timer before AN-01 kept 5 of these 48 seconds in the browser dev build.
  for (let second = 1; second <= 48; second++) {
    if (second % 3 === 0) timer.scrolled(chapterOne, second % 6 === 0 ? 50 : 25);
    timer.tick(at(second), true);
  }
  timer.show(null, at(48.4), true);

  assert.deepEqual(
    saves.map((save) => save.piece.seconds),
    [15, 15, 15, 3],
    "all 48 seconds count"
  );
});

test("reading time is saved in pieces of 15 seconds with no word count, and the rest when the next chapter shows", () => {
  const { timer, saves } = timerWithSaves();
  timer.show(chapterOne, 0, true);
  for (let second = 1; second <= 20; second++) timer.tick(at(second), true);
  timer.show(chapterTwo, at(20.6), true);

  assert.deepEqual(saves, [
    { chapterFile: "ch-01.md", piece: { seconds: 15, completed: false } },
    { chapterFile: "ch-01.md", piece: { seconds: 6, completed: false } },
  ]);
});

test("time while the window has no focus does not count", () => {
  const { timer, saves } = timerWithSaves();
  timer.show(chapterOne, 0, true);
  for (let second = 1; second <= 40; second++) timer.tick(at(second), second > 20);
  timer.show(null, at(40), false);

  assert.deepEqual(
    saves.map((save) => save.piece.seconds),
    [15, 5]
  );
});

test("a PC that sleeps does not read", () => {
  const { timer, saves } = timerWithSaves();
  timer.show(chapterOne, 0, true);
  timer.tick(at(1), true);
  // The timer stops while the PC sleeps. The next tick comes when it wakes up, two hours later.
  timer.tick(at(2 * 60 * 60), true);
  timer.show(null, at(2 * 60 * 60 + 1), true);

  assert.deepEqual(
    saves.map((save) => save.piece.seconds),
    [1 + LONGEST_TICK_MS / 1000 + 1]
  );
});

test("a chapter gets the Completed mark only from its own scroll position", () => {
  const { timer, saves } = timerWithSaves();
  timer.show(chapterOne, 0, true);
  for (let second = 1; second <= 10; second++) timer.tick(at(second), true);
  timer.scrolled(chapterOne, 100);
  timer.show(chapterTwo, at(10), true);
  // The words of chapter 1 stay on screen until the words of chapter 2 arrive, and a scroll then reports chapter 1.
  timer.scrolled(chapterOne, 100);
  for (let second = 11; second <= 25; second++) timer.tick(at(second), true);
  timer.scrolled(chapterTwo, 0);
  timer.scrolled(chapterTwo, 92);
  for (let second = 26; second <= 30; second++) timer.tick(at(second), true);
  timer.show(null, at(30), true);

  assert.deepEqual(saves, [
    { chapterFile: "ch-01.md", piece: { seconds: 10, completed: true } },
    { chapterFile: "ch-02.md", piece: { seconds: 15, completed: false } },
    { chapterFile: "ch-02.md", piece: { seconds: 5, completed: true } },
  ]);
});

test("a chapter on screen for less than half a second saves nothing, and no chapter on screen saves nothing", () => {
  const { timer, saves } = timerWithSaves();
  // No words on screen, as while a chapter loads.
  for (let second = 1; second <= 20; second++) timer.tick(at(second), true);
  timer.show(chapterOne, at(20), true);
  timer.scrolled(chapterOne, 100);
  timer.show(chapterTwo, at(20.4), true);
  timer.show(null, at(20.45), true);

  assert.deepEqual(saves, []);
});
