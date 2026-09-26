// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Sidebar } from "../Sidebar.tsx";
import { LibraryContext, type Library } from "../../hooks/useLibrary.ts";
import { bookMetaFrom } from "../../lib/backendShapes.ts";
import { NO_DATA } from "../../lib/analyticsText.ts";
import type { BookMeta, ReadingLevelMode } from "../../lib/types.ts";

/**
 * TL-20: the import measured a reading grade, the words per sentence and the minutes to read of every book, Rust
 * carried them, TypeScript declared them, and the audit failed a book without them. No screen showed one of them.
 *
 * Each book here goes through `bookMetaFrom`, as a book file does in the app, so a check that drops the measures on
 * the way in fails here too, not only in its own test.
 */

/** A book file as the import writes it, with the measures given, or none. */
function bookFile(measures?: Record<string, unknown>): BookMeta {
  const file: Record<string, unknown> = {
    book_id: "wealth-of-nations",
    title: "The Wealth of Nations",
    author: "Adam Smith",
    total_words: 75200,
    total_chapters: 1,
    toc: [],
    spine: [{ id: "ch-01", title: "Of the Division of Labour", file_path: "ch-01.md", word_count: 75200 }],
  };
  if (measures) file.elementary_metrics = measures;
  return bookMetaFrom(JSON.stringify(file), "wealth-of-nations");
}

/** Draws the sidebar at a level, with the open book given, as `App.tsx` does. */
function drawSidebar(level: ReadingLevelMode, bookMeta: BookMeta | null) {
  const library: Library = {
    activeBookId: bookMeta?.book_id ?? "",
    bookMeta,
    availableBooks: [],
    selectBook: () => {},
    rescan: { run: () => {}, running: false, note: "" },
  };
  render(
    <LibraryContext.Provider value={library}>
      <Sidebar isOpen onToggle={() => {}} activeChapterId="ch-01" onSelectChapter={() => {}} activeLevel={level} />
    </LibraryContext.Provider>
  );
}

/** The words of the measures, or null when the sidebar shows none. Text, never an element (a DOM compare is slow). */
function measuresShown(): string | null {
  return screen.queryByLabelText("How this book reads")?.textContent ?? null;
}

afterEach(cleanup);

test("at the elementary level the sidebar shows the grade, the sentence and the time the import measured", () => {
  drawSidebar(
    "elementary",
    bookFile({ flesch_kincaid_grade: 10.63, avg_sentence_length_words: 19.51, estimated_reading_minutes: 376 })
  );
  const shown = measuresShown();
  assert.ok(shown, "the sidebar shows no reading measures at the elementary level");
  assert.match(shown, /10\.6/, `no reading grade in "${shown}"`);
  assert.match(shown, /19\.5 words/, `no sentence length in "${shown}"`);
  assert.match(shown, /6 h 16 min/, `no time to read in "${shown}"`);
});

test("at the other levels the sidebar leaves the measures out", () => {
  const book = bookFile({ flesch_kincaid_grade: 10.63, avg_sentence_length_words: 19.51, estimated_reading_minutes: 376 });
  for (const level of ["inspectional", "analytical", "syntopical"] as const) {
    drawSidebar(level, book);
    assert.equal(measuresShown(), null, `the measures show at the ${level} level`);
    cleanup();
  }
});

test("a book with no measures shows a dash for each, never a 0", () => {
  drawSidebar("elementary", bookFile());
  const shown = measuresShown();
  assert.ok(shown, "a book from an older import shows no row at all, so the reader cannot tell it was not measured");
  assert.equal(shown.split(NO_DATA).length - 1, 3, `not three dashes in "${shown}"`);
  assert.doesNotMatch(shown, /\d/, `a number shows for a book with no measures: "${shown}"`);
});

test("before a book is open the sidebar shows no measures", () => {
  drawSidebar("elementary", null);
  assert.equal(measuresShown(), null);
});
