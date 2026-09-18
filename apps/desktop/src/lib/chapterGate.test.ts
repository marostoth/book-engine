import { test } from "vitest";
import assert from "node:assert/strict";
import type { ChapterMeta, ReadingLevelMode } from "./types.ts";
import type { PracticeCardItem } from "./practiceTypes.ts";
import { gatedChapterFile, gatePassed, gateRightAnswers } from "./chapterGate.ts";
import { recordSessionReview, startSession } from "./practiceSession.ts";

const AGAIN = 1;
const HARD = 2;
const GOOD = 3;
const EASY = 4;

const spine: ChapterMeta[] = [1, 2, 3, 4].map((n) => ({
  id: `ch-0${n}`,
  title: `Chapter ${n}`,
  file_path: `ch-0${n}.md`,
  order: n,
  word_count: 1000,
  anchor_count: 10,
  footnotes_count: 0,
}));

// A move from chapter `from` to chapter `to` (numbers from 1), with Gatekeeper Mode on at the elementary level.
function move(from: number | null, to: number, level: ReadingLevelMode = "elementary", gatekeeperMode = true) {
  return { gatekeeperMode, level, spine, from: from === null ? null : spine[from - 1], to: spine[to - 1] };
}

// A gate session over `cardCount` cards, with the first cards rated in order.
function ratedSession(ratings: number[], cardCount = ratings.length) {
  const cards = Array.from({ length: cardCount }, (_, i): PracticeCardItem => ({
    card_id: `card-${i + 1}`,
    book_id: "sample",
    chapter_file: "ch-02.md",
    anchor: `^p-00${i + 1}`,
    item_type: "scenario",
    prompt: "A workshop splits pin making into separate steps. What follows?",
    answer: "(A) Output per worker rises.",
    state: 0,
    stability: 0,
    difficulty: 0,
    due: 0,
    last_review: 0,
    reps: 0,
  }));
  return ratings.reduce(
    (session, rating, i) => recordSessionReview(session, `card-${i + 1}`, rating),
    startSession(cards),
  );
}

test("moving on to a later chapter tests the chapter the reader leaves", () => {
  assert.equal(gatedChapterFile(move(2, 3)), "ch-02.md");
  assert.equal(gatedChapterFile(move(1, 4)), "ch-01.md");
});

test("moving back to an earlier chapter or staying in the chapter opens no gate", () => {
  assert.equal(gatedChapterFile(move(3, 1)), null);
  assert.equal(gatedChapterFile(move(2, 2)), null);
});

test("the gate opens at every level except syntopical, also at the inspectional level", () => {
  assert.equal(gatedChapterFile(move(1, 2, "inspectional")), "ch-01.md");
  assert.equal(gatedChapterFile(move(1, 2, "analytical")), "ch-01.md");
  assert.equal(gatedChapterFile(move(1, 2, "syntopical")), null);
});

test("no gate without Gatekeeper Mode or before a chapter is open", () => {
  assert.equal(gatedChapterFile(move(1, 2, "elementary", false)), null);
  assert.equal(gatedChapterFile(move(null, 2)), null);
});

test("a wrong scenario answer does not pass the gate, even when rated Easy", () => {
  const session = ratedSession([GOOD, EASY, GOOD]);
  const wrongAnswers = new Set(["card-2"]);
  assert.equal(session.completed, true);
  assert.equal(gateRightAnswers(session, wrongAnswers), 2);
  assert.equal(gatePassed(session, wrongAnswers), false);
});

test("an Again or Hard rating does not pass the gate", () => {
  assert.equal(gatePassed(ratedSession([EASY, AGAIN, GOOD]), new Set()), false);
  assert.equal(gatePassed(ratedSession([HARD, GOOD, GOOD]), new Set()), false);
});

test("the gate is passed when every card is right, and not before the last card is rated", () => {
  assert.equal(gatePassed(ratedSession([GOOD, EASY, GOOD]), new Set()), true);
  assert.equal(gatePassed(ratedSession([GOOD, EASY], 3), new Set()), false);
});
