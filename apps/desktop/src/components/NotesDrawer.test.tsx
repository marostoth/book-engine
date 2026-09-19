// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AggregatedNoteItem, BookMeta, VocabularyEntry } from "../lib/types.ts";

/**
 * RD-10 in a real page. A word saved while reading was written to the vault and shown on no screen at all: the
 * command to read the words back was never registered, and the drawer knew nothing about them.
 *
 * `lib/vocabularyEntries.test.ts` checks the mapping on its own. This test mounts the real drawer, because the
 * question "can the reader see their words" is one only a page can answer.
 */

const getAllBookNotes = vi.fn<(bookId: string) => Promise<AggregatedNoteItem[]>>();
const getBookVocabulary = vi.fn<(bookId: string) => Promise<VocabularyEntry[]>>();

vi.mock("../lib/api.ts", () => ({
  getAllBookNotes: (bookId: string) => getAllBookNotes(bookId),
  getBookVocabulary: (bookId: string) => getBookVocabulary(bookId),
  exportBookSummary: () => Promise.resolve("summary-export.md"),
}));

const { NotesDrawer } = await import("./NotesDrawer.tsx");
const { vocabularyWasSaved } = await import("../lib/vocabularySaves.ts");

function book(): BookMeta {
  return {
    book_id: "a-book",
    title: "A Book",
    author: "A Writer",
    language: "en",
    total_words: 200,
    total_chapters: 2,
    toc: [],
    spine: [
      { id: "ch-01", title: "One", file_path: "ch-01.md", order: 0, word_count: 100, anchor_count: 3, footnotes_count: 0 },
      { id: "ch-02", title: "Two", file_path: "ch-02.md", order: 1, word_count: 100, anchor_count: 3, footnotes_count: 0 },
    ],
  };
}

function highlight(): AggregatedNoteItem {
  return {
    id: "h1",
    item_type: "highlight",
    chapter_file: "ch-01.md",
    chapter_title: "One",
    chapter_order: 0,
    anchor: "^p-002",
    text: "A sentence the reader marked.",
  };
}

function savedWord(over: Partial<VocabularyEntry> = {}): VocabularyEntry {
  return {
    word: "quorum",
    definition: "The smallest number of people who may decide.",
    chapterFile: "ch-02.md",
    anchor: "^p-005",
    savedAt: "2026-09-18T10:00:00.000Z",
    ...over,
  };
}

function openDrawer(onNavigate: (chapterFile: string, anchor?: string) => void = () => {}) {
  render(<NotesDrawer isOpen onClose={() => {}} bookMeta={book()} onNavigateToAnchor={onNavigate} />);
}

afterEach(() => {
  cleanup();
  getAllBookNotes.mockReset();
  getBookVocabulary.mockReset();
});

test("a saved word is on screen with its meaning, beside the highlights of the same book", async () => {
  getAllBookNotes.mockResolvedValue([highlight()]);
  getBookVocabulary.mockResolvedValue([savedWord()]);
  openDrawer();

  await screen.findByText("quorum");

  assert.equal(screen.queryAllByText("The smallest number of people who may decide.").length, 1);
  assert.equal(screen.queryAllByText("A sentence the reader marked.", { exact: false }).length, 1);
});

test("the counts of each kind are on screen, so the reader knows how many words they have", async () => {
  getAllBookNotes.mockResolvedValue([highlight()]);
  getBookVocabulary.mockResolvedValue([savedWord({ word: "one" }), savedWord({ word: "two" })]);
  openDrawer();

  await screen.findByText("Words (2)");

  assert.equal(screen.queryAllByText("Highlights (1)").length, 1);
  assert.equal(screen.queryAllByText("Notes (0)").length, 1);
});

test("the Words filter shows the words and nothing else", async () => {
  getAllBookNotes.mockResolvedValue([highlight()]);
  getBookVocabulary.mockResolvedValue([savedWord()]);
  openDrawer();

  await screen.findByText("quorum");
  fireEvent.click(screen.getByText("Words (1)"));

  assert.equal(screen.queryAllByText("quorum").length, 1, "the word went away with the filter that asked for it");
  assert.equal(screen.queryAllByText("A sentence the reader marked.", { exact: false }).length, 0);
});

test("a click on a word opens its chapter at the paragraph it was read at", async () => {
  const went: Array<[string, string | undefined]> = [];
  getAllBookNotes.mockResolvedValue([]);
  getBookVocabulary.mockResolvedValue([savedWord()]);
  openDrawer((chapterFile, anchor) => went.push([chapterFile, anchor]));

  const word = await screen.findByText("quorum");
  fireEvent.click(word);

  assert.deepEqual(went, [["ch-02.md", "^p-005"]]);
});

test("a word saved before the app kept chapters is still listed, and asks to open nothing", async () => {
  const went: string[] = [];
  getAllBookNotes.mockResolvedValue([]);
  getBookVocabulary.mockResolvedValue([savedWord({ chapterFile: "", anchor: "" })]);
  openDrawer((chapterFile) => went.push(chapterFile));

  const word = await screen.findByText("quorum");
  fireEvent.click(word);

  assert.deepEqual(went, [], "a word with no chapter must not send the reader to an empty chapter name");
});

test("a word saved while the drawer is open appears in it", async () => {
  getAllBookNotes.mockResolvedValue([]);
  getBookVocabulary.mockResolvedValueOnce([]).mockResolvedValue([savedWord()]);
  openDrawer();

  await screen.findByText("Words (0)");
  vocabularyWasSaved("a-book");

  await screen.findByText("quorum");
});

test("a word saved in another book does not reload this one", async () => {
  getAllBookNotes.mockResolvedValue([]);
  getBookVocabulary.mockResolvedValue([]);
  openDrawer();

  await screen.findByText("Words (0)");
  vocabularyWasSaved("another-book");

  assert.equal(getBookVocabulary.mock.calls.length, 1);
});

test("words that cannot be read are said so, and the highlights still show", async () => {
  getAllBookNotes.mockResolvedValue([highlight()]);
  getBookVocabulary.mockRejectedValue(new Error("vocabulary.json is not valid JSON"));
  openDrawer();

  await screen.findByText(/could not be read/);

  assert.equal(
    screen.queryAllByText("A sentence the reader marked.", { exact: false }).length,
    1,
    "a damaged vocabulary file lost the reader their highlights"
  );
  assert.equal(screen.queryAllByText("Words (0)").length, 1);
});
