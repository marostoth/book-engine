import { test } from "vitest";
import assert from "node:assert/strict";
import { NO_CHAPTER_TITLE, vocabularyEntries } from "./vocabularyEntries.ts";
import type { ChapterMeta, VocabularyEntry } from "./types.ts";

/** One chapter of a book, with only the fields this mapping reads set to anything interesting. */
function chapter(file: string, title: string, order: number): ChapterMeta {
  return {
    id: file.replace(".md", ""),
    title,
    file_path: file,
    order,
    word_count: 0,
    anchor_count: 0,
    footnotes_count: 0,
  };
}

function word(over: Partial<VocabularyEntry> = {}): VocabularyEntry {
  return {
    word: "quorum",
    definition: "The smallest number of people who may decide.",
    chapterFile: "ch-02.md",
    anchor: "^p-005",
    savedAt: "2026-09-18T10:00:00.000Z",
    ...over,
  };
}

const SPINE = [chapter("ch-01.md", "One", 0), chapter("ch-02.md", "Two", 1)];

test("a saved word takes the title and the reading order of its chapter from the book", () => {
  const [entry] = vocabularyEntries([word()], SPINE);

  assert.equal(entry.item_type, "word");
  assert.equal(entry.chapter_file, "ch-02.md");
  assert.equal(entry.chapter_title, "Two");
  assert.equal(entry.chapter_order, 1);
  assert.equal(entry.anchor, "^p-005");
  assert.equal(entry.created_at, "2026-09-18T10:00:00.000Z");
});

test("the word is the heading and the meaning is the body, so a search of either finds it", () => {
  // The drawer searches `text`, `chapter_title`, `anchor` and `section_heading`. Putting the word in the
  // heading and the meaning in the body makes both searchable with no change to the drawer (FR-005).
  const [entry] = vocabularyEntries([word()], SPINE);

  assert.equal(entry.section_heading, "quorum");
  assert.equal(entry.text, "The smallest number of people who may decide.");
});

test("the newest word comes first", () => {
  const entries = vocabularyEntries(
    [
      word({ word: "older", savedAt: "2026-09-01T10:00:00.000Z" }),
      word({ word: "newest", savedAt: "2026-09-19T10:00:00.000Z" }),
      word({ word: "middle", savedAt: "2026-09-10T10:00:00.000Z" }),
    ],
    SPINE
  );

  assert.deepEqual(
    entries.map((e) => e.section_heading),
    ["newest", "middle", "older"]
  );
});

test("a word with no time saved comes last, and is not dropped", () => {
  const entries = vocabularyEntries(
    [word({ word: "undated", savedAt: "" }), word({ word: "dated", savedAt: "2026-09-01T10:00:00.000Z" })],
    SPINE
  );

  assert.deepEqual(
    entries.map((e) => e.section_heading),
    ["dated", "undated"]
  );
});

test("a word saved before the app kept chapters lands in the last group, and keeps an empty place", () => {
  // An older version saved neither the chapter nor the anchor. Nothing may be invented for it: `^p-001` used
  // to be written here and it named the first paragraph of the chapter, which the reader never read (RD-04).
  const [entry] = vocabularyEntries([word({ chapterFile: "", anchor: "" })], SPINE);

  assert.equal(entry.chapter_file, "");
  assert.equal(entry.chapter_title, NO_CHAPTER_TITLE);
  assert.equal(entry.anchor, null);
  assert.ok(entry.chapter_order > 1, "the unknown group must sort after every real chapter");
});

test("a word whose chapter the book no longer has lands in the last group and keeps its chapter name", () => {
  const [entry] = vocabularyEntries([word({ chapterFile: "ch-99.md" })], SPINE);

  assert.equal(entry.chapter_file, "ch-99.md");
  assert.equal(entry.chapter_title, NO_CHAPTER_TITLE);
  assert.ok(entry.chapter_order > 1, "a chapter the book does not have cannot claim a reading order");
});

test("a book with no chapters yet still lists its words", () => {
  const entries = vocabularyEntries([word()], []);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].chapter_title, NO_CHAPTER_TITLE);
});

test("two words never share an id, because the drawer draws a list by id", () => {
  const entries = vocabularyEntries([word({ word: "one" }), word({ word: "two" })], SPINE);

  assert.equal(new Set(entries.map((e) => e.id)).size, 2);
});

test("no word is given a colour, because a word is not a highlight", () => {
  const [entry] = vocabularyEntries([word()], SPINE);

  assert.equal(entry.color, null);
});
