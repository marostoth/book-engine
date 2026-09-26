// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HIT_END, HIT_START } from "../lib/searchSnippet.ts";
import type { SearchResult } from "../lib/types.ts";

/**
 * SEC-01 in a real page (TL-03). Book text reaches the search window, and a book may hold HTML as an example, so
 * a snippet drawn as HTML would run a script from inside a book. The window used to do exactly that with
 * `dangerouslySetInnerHTML`.
 *
 * `lib/searchSnippet.test.ts` already checks the pieces, and it renders them to a string with
 * `renderToStaticMarkup`. A string is not a page: escaping can be right in the string and still wrong once a
 * browser reads it. This test mounts the real window in a real DOM and asks the document itself whether an
 * element was ever made.
 */

const searchVault = vi.fn<(query: string) => Promise<SearchResult[]>>();
vi.mock("../lib/api.ts", () => ({ searchVault: (query: string) => searchVault(query) }));

const { OmniSearchModal } = await import("./OmniSearchModal.tsx");

/** A result whose snippet is the text of a book, with the found words between the two hit marks. */
function result(snippet: string): SearchResult {
  return {
    book_id: "html-and-css",
    chapter_id: "ch-02",
    chapter_title: "Images",
    chapter_file: "ch-02.md",
    anchor: "p-014",
    snippet,
    rank: -1.2,
  };
}

/** Opens the search window and types a word into it. */
function searchFor(word: string) {
  render(<OmniSearchModal isOpen onClose={() => {}} books={[]} onSelectResult={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: word } });
}

afterEach(() => {
  cleanup();
  searchVault.mockReset();
});

test("a tag in the text of a book shows as text, and the window never makes that element", async () => {
  const hostile = `Write a picture as <img src=x onerror="alert(1)"> in your ${HIT_START}page${HIT_END}.`;
  searchVault.mockResolvedValue([result(hostile)]);
  searchFor("page");

  await screen.findByText(/Write a picture as/);

  assert.ok(document.querySelector("img") === null, "the book's text made a real <img> element in the window");
  assert.ok(document.querySelector("[onerror]") === null, "an onerror handler reached the page");
  assert.ok(
    document.body.textContent?.includes('<img src=x onerror="alert(1)">'),
    "the tag was swallowed instead of being shown to the reader as the text of the book"
  );
});

test("the words that were found are marked, and the rest of the snippet is not", async () => {
  searchVault.mockResolvedValue([result(`the division of ${HIT_START}labour${HIT_END} in a nation`)]);
  searchFor("labour");

  const marks = await screen.findAllByText("labour");
  assert.equal(marks.length, 1, "the found word was drawn more than once");
  assert.equal(marks[0].tagName, "MARK", "the found word is not in a <mark>, so nothing shows the reader where it is");
  assert.equal(document.querySelectorAll("mark").length, 1, "something other than the hit was marked");
});

test("the hit marks themselves never reach the reader", async () => {
  searchVault.mockResolvedValue([result(`a ${HIT_START}rent${HIT_END} of land`)]);
  searchFor("rent");

  await screen.findByText("rent");
  const shown = document.body.textContent ?? "";
  assert.equal(shown.includes(HIT_START), false, "the start mark U+E000 is on screen as a character");
  assert.equal(shown.includes(HIT_END), false, "the end mark U+E001 is on screen as a character");
});

test("a search too short to run asks for more letters and calls no backend", async () => {
  searchFor("a");

  assert.ok(await screen.findByText(/Type at least/), "a one-letter search did not ask the reader for more letters");
  assert.equal(searchVault.mock.calls.length, 0, "a one-letter search reached the backend");
});
