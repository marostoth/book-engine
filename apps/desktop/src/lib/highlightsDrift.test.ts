import { test } from "vitest";
import assert from "node:assert/strict";
import contract from "./seamContract.json";
import type { BookMeta, ChapterMeta, HighlightItem } from "./types.ts";
import { createLoadGuard, loadChapterOnto } from "./readerLoads.ts";

// A field renamed on one side of the seam made every saved highlight of a chapter fail its check (TL-14). The check
// dropped them with a line in the console, the chapter showed no highlights, and the next highlight the reader made
// saved a list of one over the file: every highlight of the chapter was gone from the vault.
//
// Now such a list does not load. The chapter shows no highlights, the reader is told, and the highlights belong to no
// chapter, which is what stops `handleAddHighlight` (`hooks/useBookSession.ts`) from saving over the file.

// The Tauri window of the app, with a backend whose answer to `get_chapter_highlights` each test sets
let answer: unknown = [];
Object.assign(globalThis, {
  window: {
    __TAURI_INTERNALS__: {
      invoke: async (cmd: string) => (cmd === "get_chapter_highlights" ? answer : "the words"),
    },
  },
  localStorage: { getItem: () => null, setItem: () => undefined },
});
const api = await import("./api.ts");

const chapter: ChapterMeta = {
  id: "ch-02",
  title: "Chapter 2",
  file_path: "ch-02.md",
  order: 2,
  word_count: 400,
  anchor_count: 12,
  footnotes_count: 0,
};
const book: BookMeta = {
  book_id: "wealth",
  title: "wealth",
  author: "Anon",
  language: "en",
  total_words: 400,
  total_chapters: 1,
  toc: [],
  spine: [chapter],
};

/** Loads the chapter with the app's own highlight reader, and records what reached the screen. */
async function openTheChapter() {
  const seen = { highlights: [] as HighlightItem[], from: null as string | null, errors: [] as string[] };
  await loadChapterOnto(
    { fetchChapter: async () => "the words", getChapterHighlights: api.getChapterHighlights },
    createLoadGuard(),
    book,
    chapter,
    {
      clear: () => undefined,
      showMarkdown: () => undefined,
      showHighlights: (items, source) => {
        seen.highlights = items;
        seen.from = source;
      },
    },
    (message) => seen.errors.push(message)
  );
  return seen;
}

/** The example highlight of the contract, as a backend whose field names drifted would send it. */
function drifted(id: string): Record<string, unknown> {
  const { createdAt, ...rest } = contract.HighlightItem;
  return { ...rest, id, created_at: createdAt };
}

test("highlights whose field names drifted do not load, so no save can go over them", async () => {
  answer = [drifted("hl-1"), drifted("hl-2")];

  const seen = await openTheChapter();

  assert.equal(seen.from, null, "highlights that did not load must belong to no chapter, or the next save erases them");
  assert.deepEqual(seen.highlights, []);
  assert.deepEqual(seen.errors, ['Could not load the highlights of "Chapter 2".'], "the reader must be told");
});

test("one damaged highlight among good ones stops the load, and the good ones are not saved over it", async () => {
  answer = [contract.HighlightItem, { id: "hl-2", exact: "only this" }];

  const seen = await openTheChapter();

  assert.equal(seen.from, null);
  assert.equal(seen.errors.length, 1);
});

// --- and the control, which must stay green ---

test("highlights as Rust writes them load and belong to the chapter", async () => {
  answer = [contract.HighlightItem];

  const seen = await openTheChapter();

  assert.deepEqual(seen.highlights, [contract.HighlightItem]);
  assert.equal(seen.from, "wealth/ch-02.md");
  assert.deepEqual(seen.errors, []);
});
