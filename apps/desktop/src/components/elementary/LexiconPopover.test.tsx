// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DictionaryEntry, VocabularyEntry } from "../../lib/types.ts";

/**
 * The popover must tell somebody that a word was saved. It used to take an `onSavedVocabulary` callback and
 * nothing ever passed one, so a saved word reached no screen at all (RD-10). The replacement is
 * `lib/vocabularySaves.ts`, and this test is what proves the popover really calls it: the drawer's own test
 * calls the notifier by hand, so it would stay green with this half missing.
 */

const lookupDictionaryTerm = vi.fn<(word: string) => Promise<DictionaryEntry | null>>();
const saveBookVocabulary = vi.fn<(bookId: string, entry: VocabularyEntry) => Promise<void>>();

vi.mock("../../lib/api.ts", () => ({
  lookupDictionaryTerm: (word: string) => lookupDictionaryTerm(word),
  saveBookVocabulary: (bookId: string, entry: VocabularyEntry) => saveBookVocabulary(bookId, entry),
}));

const { LexiconPopover } = await import("./LexiconPopover.tsx");
const { onVocabularySaved } = await import("../../lib/vocabularySaves.ts");

function openPopover() {
  render(
    <LexiconPopover
      word="quorum"
      anchor="^p-005"
      bookId="a-book"
      chapterFile="ch-02.md"
      position={{ x: 100, y: 100 }}
      onClose={() => {}}
    />
  );
}

afterEach(() => {
  cleanup();
  lookupDictionaryTerm.mockReset();
  saveBookVocabulary.mockReset();
});

test("saving a word says so, so an open list of words can load them again", async () => {
  const heard: string[] = [];
  const leave = onVocabularySaved((bookId) => heard.push(bookId));
  lookupDictionaryTerm.mockResolvedValue(null);
  saveBookVocabulary.mockResolvedValue(undefined);
  openPopover();

  fireEvent.click(await screen.findByText("Save to Vocab"));
  await screen.findByText("Saved to Vocab");
  leave();

  assert.deepEqual(heard, ["a-book"]);
});

test("a save that failed says nothing, so no screen claims a word it does not have", async () => {
  const heard: string[] = [];
  const leave = onVocabularySaved((bookId) => heard.push(bookId));
  lookupDictionaryTerm.mockResolvedValue(null);
  saveBookVocabulary.mockRejectedValue(new Error("the vault is not writable"));
  openPopover();

  fireEvent.click(await screen.findByText("Save to Vocab"));
  await vi.waitFor(() => assert.equal(saveBookVocabulary.mock.calls.length, 1));
  leave();

  assert.deepEqual(heard, []);
});

test("the button says where the word goes in plain words, not by naming a file", async () => {
  lookupDictionaryTerm.mockResolvedValue(null);
  openPopover();

  const button = await screen.findByTitle(/Keep this word/);

  assert.ok(!button.title.includes("/"), `the button title names a path: ${button.title}`);
  assert.ok(!button.title.includes(".json"), `the button title names a file: ${button.title}`);
});
