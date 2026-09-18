import { test } from "vitest";
import assert from "node:assert/strict";
import type { BookMeta, ChapterMeta, HighlightItem } from "./types.ts";
import {
  createLoadGuard,
  highlightsSource,
  loadBookOnto,
  loadChapterOnto,
  type BookSource,
  type ChapterSource,
} from "./readerLoads.ts";
import type { Bookmark } from "./readingPlace.ts";

/** A promise this test resolves by hand, so a slow disk can be played out step by step. */
function slowRead<T>() {
  let answer!: (value: T) => void;
  let fail!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    answer = resolve;
    fail = reject;
  });
  return { promise, answer, fail };
}

/** Lets every answer that is already waiting reach the screen. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function chapter(n: number): ChapterMeta {
  return {
    id: `ch-0${n}`,
    title: `Chapter ${n}`,
    file_path: `ch-0${n}.md`,
    order: n,
    word_count: 1000,
    anchor_count: 10,
    footnotes_count: 0,
  };
}

function book(bookId: string, spine: ChapterMeta[]): BookMeta {
  return {
    book_id: bookId,
    title: bookId,
    author: "Anon",
    language: "en",
    total_words: 1000,
    total_chapters: spine.length,
    toc: [],
    spine,
  };
}

function highlight(id: string): HighlightItem {
  return { id, exact: id, prefix: "", suffix: "", createdAt: "2026-09-16T00:00:00Z" };
}

/** The vault reads of a book: its meta, and a bookmark that is missing unless one is given. */
function bookSource(
  fetchBookMeta: (bookId: string) => Promise<BookMeta>,
  fetchBookmark: (bookId: string) => Promise<Bookmark | null> = async () => null
): BookSource {
  return { fetchBookMeta, fetchBookmark };
}

/** A reader screen that records what the loads put on it. */
function screen() {
  const state = {
    markdown: "",
    markdownFrom: null as string | null,
    highlights: [] as HighlightItem[],
    highlightsFrom: null as string | null,
    clears: 0,
    bookId: null as string | null,
    openChapter: null as string | null,
    openAnchor: undefined as string | undefined,
    bookmarkRead: null as boolean | null,
    errors: [] as string[],
  };
  return {
    state,
    clear() {
      state.markdown = "";
      state.markdownFrom = null;
      state.highlights = [];
      state.highlightsFrom = null;
      state.clears += 1;
    },
    showMarkdown(markdown: string, source: { bookId: string; chapterFile: string }) {
      state.markdown = markdown;
      state.markdownFrom = `${source.bookId}/${source.chapterFile}`;
    },
    showHighlights(items: HighlightItem[], source: string) {
      state.highlights = items;
      state.highlightsFrom = source;
    },
    showBook(loaded: BookMeta, opening: { chapter: ChapterMeta | null; anchor?: string }, bookmarkRead: boolean) {
      state.bookId = loaded.book_id;
      state.openChapter = opening.chapter?.file_path ?? null;
      state.openAnchor = opening.anchor;
      state.bookmarkRead = bookmarkRead;
    },
    report(message: string) {
      state.errors.push(message);
    },
  };
}

test("a chapter that answers late changes nothing after the reader moved on", async () => {
  const one = { text: slowRead<string>(), marks: slowRead<HighlightItem[]>() };
  const two = { text: slowRead<string>(), marks: slowRead<HighlightItem[]>() };
  const source: ChapterSource = {
    fetchChapter: (_book, file) => (file === "ch-01.md" ? one.text.promise : two.text.promise),
    getChapterHighlights: (_book, file) => (file === "ch-01.md" ? one.marks.promise : two.marks.promise),
  };
  const view = screen();
  const guard = createLoadGuard();
  const adler = book("adler", []);

  const first = loadChapterOnto(source, guard, adler, chapter(1), view, view.report);
  const second = loadChapterOnto(source, guard, adler, chapter(2), view, view.report);

  two.text.answer("the words of chapter two");
  two.marks.answer([highlight("hl-two")]);
  await second;

  // Chapter one was busy all this time. Its answer arrives now, and belongs to a chapter that is closed.
  one.text.answer("the words of chapter one");
  one.marks.answer([highlight("hl-one-a"), highlight("hl-one-b")]);
  await first;
  await settle();

  assert.equal(view.state.markdown, "the words of chapter two", "the open chapter's words must stay");
  assert.deepEqual(
    view.state.highlights.map((item) => item.id),
    ["hl-two"],
    "the open chapter's highlights must stay"
  );
  assert.equal(view.state.highlightsFrom, "adler/ch-02.md", "the highlights must belong to the open chapter");
  assert.deepEqual(view.state.errors, [], "a dropped answer must not be reported to the reader");
});

test("the chapter on screen is emptied the moment another chapter opens", async () => {
  const two = { text: slowRead<string>(), marks: slowRead<HighlightItem[]>() };
  const source: ChapterSource = {
    fetchChapter: (_book, file) => (file === "ch-01.md" ? Promise.resolve("the words of chapter one") : two.text.promise),
    getChapterHighlights: (_book, file) =>
      file === "ch-01.md" ? Promise.resolve([highlight("hl-one")]) : two.marks.promise,
  };
  const view = screen();
  const guard = createLoadGuard();
  const adler = book("adler", []);

  await loadChapterOnto(source, guard, adler, chapter(1), view, view.report);
  assert.equal(view.state.markdown, "the words of chapter one");

  const second = loadChapterOnto(source, guard, adler, chapter(2), view, view.report);

  assert.equal(view.state.markdown, "", "chapter one's words must not be shown under chapter two");
  assert.deepEqual(view.state.highlights, [], "chapter one's highlights must not be shown under chapter two");
  assert.equal(view.state.highlightsFrom, null, "no highlights belong to the screen while they load");

  two.text.answer("the words of chapter two");
  two.marks.answer([]);
  await second;
  assert.equal(view.state.markdown, "the words of chapter two");
});

test("a chapter that fails late does not report an error for a chapter that is closed", async () => {
  const one = slowRead<string>();
  const source: ChapterSource = {
    fetchChapter: (_book, file) => (file === "ch-01.md" ? one.promise : Promise.resolve("two")),
    getChapterHighlights: () => Promise.resolve([]),
  };
  const view = screen();
  const guard = createLoadGuard();
  const adler = book("adler", []);

  const first = loadChapterOnto(source, guard, adler, chapter(1), view, view.report);
  await loadChapterOnto(source, guard, adler, chapter(2), view, view.report);

  one.fail(new Error("the disk is gone"));
  await first;
  await settle();

  assert.deepEqual(view.state.errors, [], "the reader must not be told about the chapter they left");
  assert.equal(view.state.markdown, "two", "the open chapter must stay on screen");
});

test("the open chapter's own failure is reported and leaves the screen empty", async () => {
  const source: ChapterSource = {
    fetchChapter: () => Promise.reject(new Error("no such file")),
    getChapterHighlights: () => Promise.reject(new Error("no such file")),
  };
  const view = screen();
  await loadChapterOnto(source, createLoadGuard(), book("adler", []), chapter(1), view, view.report);

  assert.deepEqual(view.state.errors, [
    'Could not load the chapter "Chapter 1".',
    'Could not load the highlights of "Chapter 1".',
  ]);
  assert.equal(view.state.markdown, "");
  assert.equal(view.state.highlightsFrom, null, "highlights that did not load must belong to no chapter");
});

test("a book that answers late changes nothing after the reader picked another book", async () => {
  const adler = slowRead<BookMeta>();
  const fetchBookMeta = (bookId: string) =>
    bookId === "adler" ? adler.promise : Promise.resolve(book("hume", [chapter(1)]));
  const view = screen();
  const guard = createLoadGuard();

  const first = loadBookOnto(bookSource(fetchBookMeta), guard, "adler", view, view.report);
  await loadBookOnto(bookSource(fetchBookMeta), guard, "hume", view, view.report);

  adler.answer(book("adler", [chapter(9)]));
  await first;
  await settle();

  assert.equal(view.state.bookId, "hume", "the book the reader picked last must stay on screen");
  assert.equal(view.state.openChapter, "ch-01.md", "the chapter must belong to that book");
  assert.deepEqual(view.state.errors, []);
});

test("a book with no chapters opens without a chapter", async () => {
  const view = screen();
  await loadBookOnto(bookSource(async () => book("empty", [])), createLoadGuard(), "empty", view, view.report);

  assert.equal(view.state.bookId, "empty");
  assert.equal(view.state.openChapter, null);
});

test("a book and a chapter share one guard, so a book switch drops the chapter that is loading", async () => {
  const one = slowRead<string>();
  const source: ChapterSource = {
    fetchChapter: () => one.promise,
    getChapterHighlights: () => new Promise<HighlightItem[]>(() => {}),
  };
  const view = screen();
  const guard = createLoadGuard();

  const chapterLoad = loadChapterOnto(source, guard, book("adler", []), chapter(1), view, view.report);
  await loadBookOnto(bookSource(async () => book("hume", [chapter(1)])), guard, "hume", view, view.report);

  one.answer("the words of an Adler chapter");
  await settle();

  assert.equal(view.state.markdown, "", "an Adler chapter must not show up inside Hume");
  assert.equal(view.state.bookId, "hume");
  void chapterLoad;
});

test("the newest load stays the newest one however many older ones answer", async () => {
  const guard = createLoadGuard();
  const first = guard.start();
  const second = guard.start();
  const third = guard.start();

  assert.equal(first(), false);
  assert.equal(second(), false);
  assert.equal(third(), true);
  assert.equal(third(), true, "the check may be read more than once");
  assert.equal(first(), false, "an older load is never the newest one again");
});

test("two guards do not mix", () => {
  const reader = createLoadGuard();
  const other = createLoadGuard();
  const readerLoad = reader.start();
  other.start();

  assert.equal(readerLoad(), true, "a load somewhere else must not drop the reader's load");
});

test("the chapter a list of highlights came from names the book and the file", () => {
  assert.equal(highlightsSource("adler", "ch-01.md"), "adler/ch-01.md");
});

// DS-11: a book opens where the reader stopped, not at chapter 1.

test("a book opens at the chapter and the paragraph where the reader stopped", async () => {
  const view = screen();
  const hume = book("hume", [chapter(1), chapter(2), chapter(3)]);
  const source = bookSource(
    async () => hume,
    async () => ({ chapterFile: "ch-03.md", anchor: "^p-012", savedAt: "2026-09-16T08:00:00.000Z" })
  );

  await loadBookOnto(source, createLoadGuard(), "hume", view, view.report);

  assert.equal(view.state.openChapter, "ch-03.md", "the book must open at the chapter the reader stopped in");
  assert.equal(view.state.openAnchor, "^p-012", "and show the paragraph the reader stopped at");
  assert.equal(view.state.bookmarkRead, true);
  assert.deepEqual(view.state.errors, []);
});

test("a bookmark that cannot be read still opens the book, at its first chapter, and says why", async () => {
  const view = screen();
  const source = bookSource(
    async () => book("hume", [chapter(1), chapter(2)]),
    async () => {
      throw new Error("vault/notes/hume/bookmark.json is damaged and was left as it is");
    }
  );

  await loadBookOnto(source, createLoadGuard(), "hume", view, view.report);

  assert.equal(view.state.bookId, "hume", "a bookmark must never keep a book closed");
  assert.equal(view.state.openChapter, "ch-01.md");
  assert.equal(view.state.openAnchor, undefined);
  assert.equal(view.state.bookmarkRead, false, "the place in this book must not be saved over the damaged bookmark");
  assert.deepEqual(view.state.errors, [
    'Where you stopped reading in "hume" could not be read, so the book opens at its first chapter.',
  ]);
});

test("a slow bookmark of a book the reader left changes nothing", async () => {
  const adlerPlace = slowRead<Bookmark | null>();
  const source = bookSource(
    async (bookId) => book(bookId, [chapter(1), chapter(2)]),
    (bookId) => (bookId === "adler" ? adlerPlace.promise : Promise.resolve(null))
  );
  const view = screen();
  const guard = createLoadGuard();

  const first = loadBookOnto(source, guard, "adler", view, view.report);
  await loadBookOnto(source, guard, "hume", view, view.report);

  adlerPlace.answer({ chapterFile: "ch-02.md", anchor: "^p-040" });
  await first;
  await settle();

  assert.equal(view.state.bookId, "hume");
  assert.equal(view.state.openChapter, "ch-01.md", "Adler's place must not move the reader inside Hume");
  assert.equal(view.state.openAnchor, undefined);
});

test("the words of a chapter name the chapter they belong to", async () => {
  const view = screen();
  const source: ChapterSource = {
    fetchChapter: async () => "the words of chapter two",
    getChapterHighlights: async () => [],
  };

  await loadChapterOnto(source, createLoadGuard(), book("hume", []), chapter(2), view, view.report);

  assert.equal(view.state.markdownFrom, "hume/ch-02.md", "a place read from these words is saved for this chapter");
});
