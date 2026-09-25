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

/** The Save to Vocab button, once the dictionary has answered and the button can be pressed. */
async function saveButton(): Promise<HTMLButtonElement> {
  const button = (await screen.findByText("Save to Vocab")).closest("button");
  assert.ok(button, "Save to Vocab is not on a button");
  await vi.waitFor(() => assert.equal(button.disabled, false, "the button stays off after the dictionary answered"));
  return button;
}

/** Lets every answer that is waiting arrive. One `await` is only one microtask, and a fake's answer needs more. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  cleanup();
  lookupDictionaryTerm.mockReset();
  saveBookVocabulary.mockReset();
});

const QUORUM: DictionaryEntry = {
  word: "quorum",
  definition: "The smallest number of members who must be present for a meeting to act.",
};

test("a word cannot be saved while the dictionary is still looking it up (RD-17)", async () => {
  let answer: (entry: DictionaryEntry | null) => void = () => {};
  lookupDictionaryTerm.mockReturnValue(new Promise((resolve) => (answer = resolve)));
  saveBookVocabulary.mockResolvedValue(undefined);
  openPopover();

  const button = (await screen.findByText("Save to Vocab")).closest("button");
  assert.ok(button, "Save to Vocab is not on a button");
  await screen.findByText("Looking up lexicon...");
  assert.equal(button.disabled, true, "the button can be pressed before the dictionary answered");

  fireEvent.click(button);
  await settle();
  assert.equal(saveBookVocabulary.mock.calls.length, 0, "a word was saved before its meaning was known");

  answer(QUORUM);
  await screen.findByText(QUORUM.definition);
  fireEvent.click(await saveButton());
  await screen.findByText("Saved to Vocab");

  assert.equal(saveBookVocabulary.mock.calls.length, 1);
  assert.equal(saveBookVocabulary.mock.calls[0][1].definition, QUORUM.definition);
});

test("a word the dictionary does not hold can still be saved, as the popover says (RD-17)", async () => {
  lookupDictionaryTerm.mockResolvedValue(null);
  saveBookVocabulary.mockResolvedValue(undefined);
  openPopover();

  await screen.findByText(/No exact definition found/);
  fireEvent.click(await saveButton());
  await screen.findByText("Saved to Vocab");

  assert.equal(saveBookVocabulary.mock.calls[0][1].definition, "Vocabulary term: quorum");
});

test("a lookup that failed does not keep the word from being saved (RD-17)", async () => {
  lookupDictionaryTerm.mockRejectedValue(new Error("the dictionary could not be opened"));
  saveBookVocabulary.mockResolvedValue(undefined);
  openPopover();

  fireEvent.click(await saveButton());
  await screen.findByText("Saved to Vocab");

  assert.equal(saveBookVocabulary.mock.calls.length, 1);
});

test("saving a word says so, so an open list of words can load them again", async () => {
  const heard: string[] = [];
  const leave = onVocabularySaved((bookId) => heard.push(bookId));
  lookupDictionaryTerm.mockResolvedValue(null);
  saveBookVocabulary.mockResolvedValue(undefined);
  openPopover();

  fireEvent.click(await saveButton());
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

  fireEvent.click(await saveButton());
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
