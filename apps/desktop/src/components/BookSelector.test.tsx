// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BookSelector } from "./BookSelector.tsx";
import type { LibraryRescanControl } from "../lib/libraryRescan.ts";
import type { BookMetadata } from "../lib/types.ts";

/**
 * The first component test of this app (TL-03). Until now every frontend test was of a plain function, so 62
 * components and 7 hooks had no test at all: nothing opened a popover, clicked a button or read what a reader
 * would see. `lib/libraryRescan.test.ts` proves what a rescan does; only a test like this one proves that the
 * button is reachable, runs it once, and says what happened (DS-13, SI-05).
 */

const BOOKS: BookMetadata[] = [
  { id: "wealth-of-nations", title: "The Wealth of Nations", author: "Adam Smith", chapter_count: 5, total_words: 900 },
  { id: "adler", title: "How to Read a Book", author: "Mortimer Adler", chapter_count: 21, total_words: 700 },
];

/** The rescan control the book list is given, with `run` recorded. */
function rescanControl(over: Partial<LibraryRescanControl> = {}): LibraryRescanControl {
  return { run: vi.fn(), running: false, note: "", ...over };
}

/** Draws the book list and opens its popover, which is closed until the reader clicks the name of the book. */
function openTheList(rescan?: LibraryRescanControl) {
  render(
    <BookSelector
      currentBookId="wealth-of-nations"
      currentTitle="The Wealth of Nations"
      currentAuthor="Adam Smith"
      books={BOOKS}
      onSelectBook={() => {}}
      libraryRescan={rescan}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /The Wealth of Nations/ }));
}

afterEach(cleanup);

test("the list is closed until the reader clicks the book, and then it holds every book", () => {
  render(
    <BookSelector
      currentBookId="wealth-of-nations"
      currentTitle="The Wealth of Nations"
      currentAuthor="Adam Smith"
      books={BOOKS}
      onSelectBook={() => {}}
    />
  );
  assert.ok(screen.queryByText("How to Read a Book") === null, "the other book shows before the list is opened");

  fireEvent.click(screen.getByRole("button", { name: /The Wealth of Nations/ }));
  assert.ok(screen.getByText("How to Read a Book"), "the other book is missing from the open list");
});

test("clicking a book in the list reports that book and closes the list", () => {
  const chosen: string[] = [];
  render(
    <BookSelector
      currentBookId="wealth-of-nations"
      currentTitle="The Wealth of Nations"
      currentAuthor="Adam Smith"
      books={BOOKS}
      onSelectBook={(id) => chosen.push(id)}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /The Wealth of Nations/ }));
  fireEvent.click(screen.getByText("How to Read a Book"));

  assert.deepEqual(chosen, ["adler"], "the book the reader clicked was not reported");
  assert.ok(screen.queryByText("How to Read a Book") === null, "the list stayed open after a book was chosen");
});

test("the rescan button is in the open list, and one click runs one rescan", () => {
  const rescan = rescanControl();
  openTheList(rescan);

  const button = screen.getByRole("button", { name: /Rescan library/ });
  assert.equal(button.hasAttribute("disabled"), false, "the button is disabled before any rescan runs");

  fireEvent.click(button);
  assert.equal((rescan.run as ReturnType<typeof vi.fn>).mock.calls.length, 1, "one click did not run one rescan");
});

test("a running rescan says so and cannot be started a second time", () => {
  const rescan = rescanControl({ running: true, note: "No new books. Search updated." });
  openTheList(rescan);

  const button = screen.getByRole("button", { name: /Rescanning/ });
  assert.ok(button.hasAttribute("disabled"), "a second rescan can be started while the first one runs");

  fireEvent.click(button);
  assert.equal((rescan.run as ReturnType<typeof vi.fn>).mock.calls.length, 0, "a disabled button still ran a rescan");

  assert.equal(
    screen.getByRole("status").textContent,
    "",
    "the note of the last rescan is shown while a new one runs, which would be the wrong answer"
  );
});

test("what the rescan found is announced, not only drawn", () => {
  openTheList(rescanControl({ note: "Found 1 new book: Mind Over Markets. Search updated." }));

  // `role="status"` is what makes a screen reader say the line. Reading the text alone would pass without it,
  // and a reader who cannot see the list would never learn that their new book arrived.
  const status = screen.getByRole("status");
  assert.equal(status.textContent, "Found 1 new book: Mind Over Markets. Search updated.");
});

test("a build with no rescan control draws no rescan button", () => {
  openTheList(undefined);
  assert.ok(screen.queryByRole("button", { name: /Rescan/ }) === null, "a rescan button showed with nothing behind it");
});
