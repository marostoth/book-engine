import test from "node:test";
import assert from "node:assert/strict";
import type { BookMeta, BookMetadata, ChapterMeta, SearchResult } from "./types.ts";
import { resolveLocation, searchResultBookTitle, searchResultLocation } from "./readerLocation.ts";

function chapter(id: string, title: string): ChapterMeta {
  return { id, title, file_path: `${id}.md`, order: Number(id.slice(-2)), word_count: 1000, anchor_count: 10, footnotes_count: 0 };
}

function book(book_id: string, title: string, spine: ChapterMeta[]): BookMeta {
  return { book_id, title, author: "", language: "en", total_words: 0, total_chapters: spine.length, toc: [], spine };
}

// Two books with the same chapter file names, as every imported book has.
const sample = book("sample", "Principles of Distributed Systems", [
  chapter("ch-01", "Consistency Models"),
  chapter("ch-02", "Consensus"),
]);
const wealth = book("wealth-of-nations", "An Inquiry into the Nature and Causes of the Wealth of Nations", [
  chapter("ch-01", "Of the Division of Labour"),
  chapter("ch-02", "Of the Principle which gives Occasion to the Division of Labour"),
  chapter("ch-03", "That the Division of Labour is Limited by the Extent of the Market"),
]);
const library: Record<string, BookMeta> = { [sample.book_id]: sample, [wealth.book_id]: wealth };

// A search hit as `search_vault` returns it.
function hit(bookId: string, chapterFile: string, anchor = "^p-001"): SearchResult {
  return { book_id: bookId, chapter_id: chapterFile.replace(".md", ""), chapter_title: "", chapter_file: chapterFile, anchor, snippet: "\uE000labour\uE001", rank: -1 };
}

// Opens a hit the way the search window does and records which books had to be loaded.
async function openHit(result: SearchResult, openBook: BookMeta | null) {
  const loaded: string[] = [];
  const target = await resolveLocation(searchResultLocation(result), openBook, async (bookId) => {
    loaded.push(bookId);
    return library[bookId];
  });
  return { loaded, bookId: target.book.book_id, chapterTitle: target.chapter?.title };
}

test("a hit in sample/ch-01.md opens that chapter of sample, not ch-01.md of the open Wealth of Nations", async () => {
  assert.deepEqual(await openHit(hit("sample", "ch-01.md"), wealth), {
    loaded: ["sample"],
    bookId: "sample",
    chapterTitle: "Consistency Models",
  });
});

test("a hit in the open book opens its chapter without loading a book", async () => {
  assert.deepEqual(await openHit(hit("wealth-of-nations", "ch-02.md"), wealth), {
    loaded: [],
    bookId: "wealth-of-nations",
    chapterTitle: "Of the Principle which gives Occasion to the Division of Labour",
  });
});

test("a chapter file the hit's book does not have: first chapter of that book, or the current chapter when it is open", async () => {
  assert.deepEqual(await openHit(hit("sample", "ch-03.md"), wealth), { loaded: ["sample"], bookId: "sample", chapterTitle: "Consistency Models" });
  assert.deepEqual(await openHit(hit("sample", "ch-03.md"), sample), { loaded: [], bookId: "sample", chapterTitle: undefined });
});

test("each search hit keeps its anchor and shows the title of its own book", () => {
  const books: BookMetadata[] = [sample, wealth].map((b) => ({ id: b.book_id, title: b.title, author: b.author, chapter_count: b.spine.length, total_words: 0 }));
  assert.deepEqual(searchResultLocation(hit("sample", "ch-01.md", "^p-004")), { bookId: "sample", chapterFile: "ch-01.md", anchor: "^p-004" });
  assert.equal(searchResultLocation(hit("sample", "ch-01.md", "")).anchor, undefined);
  assert.equal(searchResultBookTitle(hit("sample", "ch-01.md"), books), "Principles of Distributed Systems");
  assert.equal(searchResultBookTitle(hit("wealth-of-nations", "ch-01.md"), books), "An Inquiry into the Nature and Causes of the Wealth of Nations");
  assert.equal(searchResultBookTitle(hit("deleted-book", "ch-01.md"), books), "deleted-book");
});
