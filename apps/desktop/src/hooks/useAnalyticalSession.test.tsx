// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { AnalyticalStore, AuthorTerm } from "../lib/types/analytical.ts";

/**
 * TL-11 and DS-11: a change is saved only for a book whose notes actually read.
 *
 * `analytical.json` holds every term, argument, critique and inquiry the reader has written about a book, and a
 * save replaces the whole file. So a save made while the file did not read would erase all of it.
 *
 * The hook used to set `loadedBookId` to null inside the effect, BEFORE the fetch. That is one drawing after the
 * new book was already on screen, so for that drawing `loadedBookId` still named the book before it. It carries
 * the book it belongs to now, and whether that book's notes read, and both are worked out while drawing.
 */

const getAnalyticalData = vi.fn<(bookId: string) => Promise<AnalyticalStore>>();
const saveAnalyticalData = vi.fn<(bookId: string, data: AnalyticalStore) => Promise<void>>();

vi.mock("../lib/api/analyticalApi.ts", () => ({
  getAnalyticalData: (bookId: string) => getAnalyticalData(bookId),
  saveAnalyticalData: (bookId: string, data: AnalyticalStore) => saveAnalyticalData(bookId, data),
}));

const reported: string[] = [];
vi.mock("../lib/backendErrors.ts", () => ({
  reportBackendError: (message: string) => {
    reported.push(message);
  },
}));

const { useAnalyticalSession } = await import("./useAnalyticalSession.ts");

const term: AuthorTerm = {
  id: "term-1",
  term: "Division of Labour",
  authorDefinition: "The splitting of one trade into many.",
  citation: { chapterFile: "ch-03.md", anchor: "^p-0012", quote: "One worker draws the wire." },
};

function notesHolding(...terms: AuthorTerm[]): AnalyticalStore {
  return { terms, arguments: [], critiques: [], inquiries: [] };
}

/** A promise the test settles by hand, so a load can be held open while the hook is looked at. */
function later<T>() {
  let settle!: (value: T) => void;
  let fail!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

afterEach(() => {
  cleanup();
  getAnalyticalData.mockReset();
  saveAnalyticalData.mockReset();
  reported.length = 0;
});

test("a book whose notes did not read is never saved over", async () => {
  const asked = later<AnalyticalStore>();
  getAnalyticalData.mockReturnValue(asked.promise);

  const { result } = renderHook(() => useAnalyticalSession({ bookId: "wealth-of-nations" }));
  await act(async () => {
    asked.fail(new Error("analytical.json could not be read"));
  });

  await act(async () => {
    await result.current.saveTerm(term);
  });

  assert.equal(
    saveAnalyticalData.mock.calls.length,
    0,
    "the notes of this book did not read, and a save was sent anyway. It would have replaced every term, "
      + "argument, critique and inquiry the reader wrote about this book with almost nothing"
  );
  assert.ok(
    reported.some((message) => message.includes("not saved")),
    `nothing told the reader their change was dropped: ${JSON.stringify(reported)}`
  );
});

test("a book whose notes did read is saved", async () => {
  getAnalyticalData.mockResolvedValue(notesHolding());
  saveAnalyticalData.mockResolvedValue();

  const { result } = renderHook(() => useAnalyticalSession({ bookId: "wealth-of-nations" }));
  await waitFor(() => assert.equal(result.current.loading, false));

  await act(async () => {
    await result.current.saveTerm(term);
  });

  assert.equal(saveAnalyticalData.mock.calls.length, 1, "a change to a book that loaded was not saved at all");
  assert.equal(saveAnalyticalData.mock.calls[0][0], "wealth-of-nations");
  assert.deepEqual(
    saveAnalyticalData.mock.calls[0][1].terms.map((t) => t.id),
    ["term-1"]
  );
});

test("the notes of the book before this one are never shown under this one", async () => {
  getAnalyticalData.mockResolvedValue(notesHolding(term));
  const { result, rerender } = renderHook(({ bookId }) => useAnalyticalSession({ bookId }), {
    initialProps: { bookId: "wealth-of-nations" },
  });
  await waitFor(() => assert.equal(result.current.analyticalStore.terms.length, 1));

  // The reader opens another book. Its notes are still on their way.
  const second = later<AnalyticalStore>();
  getAnalyticalData.mockReturnValue(second.promise);
  rerender({ bookId: "mind-over-markets" });

  assert.deepEqual(
    result.current.analyticalStore.terms,
    [],
    "the terms of the book before this one are on screen under the new book's name"
  );
  assert.equal(result.current.loading, true, "the app does not say the new book's notes are still coming");
});

test("a book whose notes did not read shows no notes, rather than the last book's", async () => {
  getAnalyticalData.mockResolvedValue(notesHolding(term));
  const { result, rerender } = renderHook(({ bookId }) => useAnalyticalSession({ bookId }), {
    initialProps: { bookId: "wealth-of-nations" },
  });
  await waitFor(() => assert.equal(result.current.analyticalStore.terms.length, 1));

  const second = later<AnalyticalStore>();
  getAnalyticalData.mockReturnValue(second.promise);
  rerender({ bookId: "mind-over-markets" });
  await act(async () => {
    second.fail(new Error("analytical.json could not be read"));
  });

  assert.deepEqual(result.current.analyticalStore.terms, [], "a failed read shows the notes of another book");
  assert.equal(result.current.loading, false, "a failed read leaves the app saying it is still loading, for ever");
});

test("with no book open nothing is loading and there are no notes", () => {
  const { result } = renderHook(() => useAnalyticalSession({ bookId: null }));
  assert.equal(result.current.loading, false, "the app says it is loading notes for a book that is not open");
  assert.deepEqual(result.current.analyticalStore.terms, []);
  assert.equal(getAnalyticalData.mock.calls.length, 0, "the backend was asked for the notes of no book");
});
