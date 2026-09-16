import test from "node:test";
import assert from "node:assert/strict";
import type { BookMetadata, IndexProblem, IndexSummary } from "./types.ts";
import { rescanLibrary, rescanSummary, type LibraryBackend } from "./libraryRescan.ts";

/**
 * DS-13: a book you import while the app is open shows after "Rescan library", in the book list and in search.
 *
 * The app reads the library and builds the search index once, when it starts. The book list needs a DOM, which this
 * repo has no test library for, so these tests cover the rescan that the button runs.
 */

function book(id: string, title: string): BookMetadata {
  return { id, title, author: "Anon", chapter_count: 3, total_words: 1000 };
}

const adler = book("adler", "How to Read a Book");
const hume = book("hume", "A Treatise of Human Nature");
const smith = book("smith", "The Wealth of Nations");

/**
 * A backend whose vault has `library`, and whose index reads `chapters` and could not read the files in `problems`.
 * It records its calls in order.
 */
function fakeBackend(library: BookMetadata[] | Error, chapters: number | Error, problems: IndexProblem[] = []) {
  const calls: string[] = [];
  const backend: LibraryBackend = {
    fetchLibraryBooks: async () => {
      calls.push("fetchLibraryBooks");
      if (library instanceof Error) throw library;
      return library;
    },
    indexVault: async () => {
      calls.push("indexVault");
      if (chapters instanceof Error) throw chapters;
      return { chapters_indexed: chapters, paragraphs_indexed: chapters * 40, problems, renamed_books: [], duration_ms: 12 };
    },
  };
  return { backend, calls };
}

/** What the rescan puts on the screen: the book lists it shows and the errors it reports. */
function fakeScreen() {
  const shown: BookMetadata[][] = [];
  const errors: { action: string; detail: string }[] = [];
  return {
    shown,
    errors,
    showBooks: (books: BookMetadata[]) => {
      shown.push(books);
    },
    reportError: (action: string, error: unknown) => {
      errors.push({ action, detail: String(error) });
    },
  };
}

test("a book imported while the app is open shows in the list after a rescan", async () => {
  const { backend } = fakeBackend([adler, hume, smith], 37);
  const screen = fakeScreen();

  const result = await rescanLibrary(backend, [adler, hume], screen.showBooks, screen.reportError);

  assert.deepEqual(screen.shown, [[adler, hume, smith]], "the list gets the new book");
  assert.deepEqual(result.newTitles, ["The Wealth of Nations"]);
  assert.deepEqual(screen.errors, []);
});

test("a rescan also updates search, and says what it found", async () => {
  const { backend, calls } = fakeBackend([adler, hume, smith], 37);
  const screen = fakeScreen();

  const result = await rescanLibrary(backend, [adler, hume], screen.showBooks, screen.reportError);

  assert.deepEqual(calls, ["fetchLibraryBooks", "indexVault"], "the list first, then search");
  assert.equal(result.searchUpdated, true);
  assert.equal(rescanSummary(result), "Found 1 new book: The Wealth of Nations. Search updated.");
});

test("two new books are named in one line", async () => {
  const { backend } = fakeBackend([adler, hume, smith], 40);
  const screen = fakeScreen();

  const result = await rescanLibrary(backend, [adler], screen.showBooks, screen.reportError);

  assert.equal(
    rescanSummary(result),
    "Found 2 new books: A Treatise of Human Nature, The Wealth of Nations. Search updated."
  );
});

test("a rescan that finds nothing new says so", async () => {
  // The index reads a chapter with no paragraphs again on every run, like ch-03 of the real Wealth of Nations.
  const { backend, calls } = fakeBackend([adler, hume], 1);
  const screen = fakeScreen();

  const result = await rescanLibrary(backend, [adler, hume], screen.showBooks, screen.reportError);

  assert.deepEqual(calls, ["fetchLibraryBooks", "indexVault"], "it still reads the vault");
  assert.deepEqual(screen.shown, [[adler, hume]]);
  assert.equal(rescanSummary(result), "No new books. Search updated.", "the note never counts chapters");
});

test("a book that is no longer in the vault leaves the list", async () => {
  const { backend } = fakeBackend([adler], 0);
  const screen = fakeScreen();

  const result = await rescanLibrary(backend, [adler, hume], screen.showBooks, screen.reportError);

  assert.deepEqual(screen.shown, [[adler]], "the list shows what the vault has");
  assert.deepEqual(result.newTitles, []);
});

test("a library that cannot be read keeps the list on screen, and search is still updated", async () => {
  const { backend, calls } = fakeBackend(new Error("Access is denied."), 2);
  const screen = fakeScreen();

  const result = await rescanLibrary(backend, [adler, hume], screen.showBooks, screen.reportError);

  assert.deepEqual(screen.shown, [], "the list on screen stays");
  assert.deepEqual(screen.errors, [
    { action: "Could not read your library again, so the book list did not change.", detail: "Error: Access is denied." },
  ]);
  assert.deepEqual(calls, ["fetchLibraryBooks", "indexVault"]);
  assert.equal(result.books, null);
  assert.equal(rescanSummary(result), "Search updated.");
});

test("search that cannot be updated is reported, and the new book still shows", async () => {
  const { backend } = fakeBackend([adler, smith], new Error("database is locked"));
  const screen = fakeScreen();

  const result = await rescanLibrary(backend, [adler], screen.showBooks, screen.reportError);

  assert.deepEqual(screen.shown, [[adler, smith]]);
  assert.deepEqual(screen.errors, [
    {
      action: "Search was not updated, so a new book may not show in search results.",
      detail: "Error: database is locked",
    },
  ]);
  assert.equal(result.searchUpdated, false);
  assert.equal(rescanSummary(result), "Found 1 new book: The Wealth of Nations.");
});

test("the new book shows before search is done", async () => {
  let finishIndex: (summary: IndexSummary) => void = () => {};
  const backend: LibraryBackend = {
    fetchLibraryBooks: async () => [adler, smith],
    indexVault: () =>
      new Promise((resolve) => {
        finishIndex = resolve;
      }),
  };
  const screen = fakeScreen();

  const rescan = rescanLibrary(backend, [adler], screen.showBooks, screen.reportError);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(screen.shown, [[adler, smith]], "a large vault can take a while to index, and the list does not wait");
  finishIndex({ chapters_indexed: 5, paragraphs_indexed: 200, problems: [], renamed_books: [], duration_ms: 90 });
  assert.equal((await rescan).searchUpdated, true);
});

// SI-02: the index reads each book on its own, so a file it could not read never stops a rescan.
test("a rescan names the files that search could not read, and counts them in the note", async () => {
  const unread: IndexProblem = { file: "books/hume/ch-04.md", reason: "is not UTF-8 text" };
  const { backend } = fakeBackend([adler, hume, smith], 37, [unread]);
  const screen = fakeScreen();

  const result = await rescanLibrary(backend, [adler, hume], screen.showBooks, screen.reportError);

  assert.deepEqual(screen.errors, [
    {
      action: "Search could not read 1 file, so search results from it can be old or missing.",
      detail: "books/hume/ch-04.md is not UTF-8 text",
    },
  ]);
  assert.equal(
    rescanSummary(result),
    "Found 1 new book: The Wealth of Nations. Search updated, but it could not read 1 file."
  );
  assert.equal(
    rescanSummary({ ...result, newTitles: [], unreadFiles: 2 }),
    "No new books. Search updated, but it could not read 2 files."
  );
});

test("the browser dev build finds no new book", async () => {
  const { fetchLibraryBooks, indexVault } = await import("./api/dev/fallbackBooks.ts");
  const backend: LibraryBackend = {
    fetchLibraryBooks: async () => fetchLibraryBooks(),
    indexVault: async () => indexVault(),
  };
  const screen = fakeScreen();

  const result = await rescanLibrary(backend, fetchLibraryBooks(), screen.showBooks, screen.reportError);

  assert.equal(rescanSummary(result), "No new books. Search updated.", "the sample books never change");
});
