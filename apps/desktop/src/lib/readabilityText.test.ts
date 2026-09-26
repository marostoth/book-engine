import { test } from "vitest";
import assert from "node:assert/strict";
import { NO_DATA } from "./analyticsText.ts";
import { bookTimeText, gradeText, sentenceText } from "./readabilityText.ts";
import type { ElementaryMetrics } from "./types.ts";

/** The measures of a book, with the minutes to read it given. */
function measures(minutes: number): ElementaryMetrics {
  return { flesch_kincaid_grade: 10.63, avg_sentence_length_words: 19.51, estimated_reading_minutes: minutes };
}

test("the grade and the sentence show one decimal, as a reader would say them", () => {
  assert.equal(gradeText(measures(376)), "10.6");
  assert.equal(sentenceText(measures(376)), "19.5 words");
});

test("the time to read shows hours and minutes, and leaves out a part that is 0", () => {
  assert.equal(bookTimeText(measures(376)), "6 h 16 min");
  assert.equal(bookTimeText(measures(45)), "45 min");
  assert.equal(bookTimeText(measures(120)), "2 h");
  assert.equal(bookTimeText(measures(61)), "1 h 1 min");
});

test("a book with no measures shows a dash for each, never a 0", () => {
  assert.equal(gradeText(undefined), NO_DATA);
  assert.equal(sentenceText(undefined), NO_DATA);
  assert.equal(bookTimeText(undefined), NO_DATA);
});
