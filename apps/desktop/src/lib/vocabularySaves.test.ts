import { test } from "vitest";
import assert from "node:assert/strict";
import { onVocabularySaved, vocabularyWasSaved } from "./vocabularySaves.ts";

test("a listener hears a word that was saved", () => {
  const heard: string[] = [];
  const leave = onVocabularySaved((bookId) => heard.push(bookId));

  vocabularyWasSaved("a-book");
  leave();

  assert.deepEqual(heard, ["a-book"]);
});

test("a listener that has left hears nothing", () => {
  const heard: string[] = [];
  const leave = onVocabularySaved((bookId) => heard.push(bookId));

  leave();
  vocabularyWasSaved("a-book");

  assert.deepEqual(heard, []);
});

test("two listeners both hear, so a second screen is never missed", () => {
  const first: string[] = [];
  const second: string[] = [];
  const leaveFirst = onVocabularySaved((bookId) => first.push(bookId));
  const leaveSecond = onVocabularySaved((bookId) => second.push(bookId));

  vocabularyWasSaved("a-book");
  leaveFirst();
  leaveSecond();

  assert.deepEqual(first, ["a-book"]);
  assert.deepEqual(second, ["a-book"]);
});

test("leaving twice is safe, because React calls a cleanup more than once in strict mode", () => {
  const leave = onVocabularySaved(() => undefined);

  leave();
  leave();

  vocabularyWasSaved("a-book");
});

test("a word saved with nobody listening loses nothing and throws nothing", () => {
  vocabularyWasSaved("a-book");
});
