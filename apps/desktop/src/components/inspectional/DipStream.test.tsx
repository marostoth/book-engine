// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { BookMeta } from "../../lib/types.ts";

/**
 * TL-11: the dip stream names the samples it already asked for.
 *
 * The view reads the first and last paragraph of every chapter that carries no sample of its own, and keeps what
 * arrives. It decided which chapters still needed reading from the samples it HELD, and never said it read them:
 * `react-hooks/exhaustive-deps` said so. Saying it would have made the whole read start over each time one sample
 * arrived, and each start cancels the reads still on their way. One chapter's sample would have restarted every
 * other chapter's read, over and over.
 *
 * What it needs is not "which samples do I hold" but "which reads have I started", and that is not drawn, so it
 * is a ref now. The same change fixed a second fault it was hiding: every entry was kept under the chapter id
 * alone, and two books both name their first chapter "ch-01".
 */

const fetchChapter = vi.fn<(bookId: string, filePath: string) => Promise<string>>();

vi.mock("../../lib/api.ts", () => ({
  fetchChapter: (bookId: string, filePath: string) => fetchChapter(bookId, filePath),
}));

const { DipStream } = await import("./DipStream.tsx");

/** A book whose chapters carry no sample of their own, so the view has to read every one of them. */
function book(bookId: string, chapterIds: string[]): BookMeta {
  return {
    book_id: bookId,
    title: bookId,
    author: "A Writer",
    language: "en",
    total_words: 100 * chapterIds.length,
    total_chapters: chapterIds.length,
    toc: [],
    spine: chapterIds.map((id, order) => ({
      id,
      title: `Chapter ${order + 1}`,
      file_path: `${id}.md`,
      order,
      word_count: 100,
      anchor_count: 2,
      footnotes_count: 0,
    })),
  };
}

/** A chapter file with one opening paragraph and one closing paragraph, each with its own anchor. */
function chapterText(opening: string, closing: string): string {
  return `# A Chapter\n\n${opening} ^p-001\n\n${closing} ^p-002\n`;
}

/** A promise the test settles by hand, so reads can be held open while the view is looked at. */
function later<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

/** Lets every settled promise run its `then`, and lets React draw what they set. */
async function settleAll(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  fetchChapter.mockReset();
});

test("a chapter is read once, however many other chapters' samples arrive", async () => {
  const reads = ["ch-01.md", "ch-02.md", "ch-03.md"].map(() => later<string>());
  let next = 0;
  fetchChapter.mockImplementation(() => reads[next++].promise);

  render(<DipStream bookMeta={book("wealth-of-nations", ["ch-01", "ch-02", "ch-03"])} onReadFullChapter={() => {}} />);
  await settleAll();
  assert.equal(fetchChapter.mock.calls.length, 3, "the view must read all three chapters that carry no sample");

  // One sample arrives. The other two are still on their way.
  reads[0].settle(chapterText("Labour was the first price", "and paid for everything"));
  await settleAll();
  assert.equal(
    fetchChapter.mock.calls.length,
    3,
    "one sample arriving started the reads again. Every read still on its way is cancelled when that happens, so " +
      "the view would read the same chapters over and over and never settle (TL-11)."
  );

  reads[1].settle(chapterText("The second chapter opens", "and the second chapter closes"));
  reads[2].settle(chapterText("The third chapter opens", "and the third chapter closes"));
  await settleAll();
  assert.equal(fetchChapter.mock.calls.length, 3, "a later sample arriving started the reads again");
  assert.ok(screen.getByText(/Labour was the first price/), "the sample that arrived must be on the page");
});

test("two books that name a chapter the same way do not share its sample", async () => {
  fetchChapter.mockImplementation((_bookId, filePath) =>
    Promise.resolve(chapterText(`Opening of ${_bookId} ${filePath}`, `Closing of ${_bookId} ${filePath}`))
  );

  const view = render(<DipStream bookMeta={book("wealth-of-nations", ["ch-01"])} onReadFullChapter={() => {}} />);
  await settleAll();
  assert.ok(screen.getByText(/Opening of wealth-of-nations ch-01.md/), "the first book's sample must be on the page");

  // The reader opens another book without leaving this view, and its first chapter has the same id.
  view.rerender(<DipStream bookMeta={book("the-federalist", ["ch-01"])} onReadFullChapter={() => {}} />);
  await settleAll();

  // `assert.ok(x === null)`, never `assert.equal(x, null)`: the value here is a page element, and node:assert
  // drags the whole of React's fiber graph into the message it builds for a failure. That takes minutes.
  assert.ok(
    screen.queryByText(/Opening of wealth-of-nations ch-01.md/) === null,
    "the second book's first chapter showed the FIRST book's opening words, because both are called ch-01"
  );
  assert.ok(
    screen.getByText(/Opening of the-federalist ch-01.md/),
    "the second book's first chapter was never read, because a chapter with that id had been read already"
  );
});

test("a chapter whose read failed is asked for again when the view opens the book afresh", async () => {
  fetchChapter.mockImplementation(() => Promise.reject(new Error("the vault is not there")));

  const view = render(<DipStream bookMeta={book("wealth-of-nations", ["ch-01"])} onReadFullChapter={() => {}} />);
  await settleAll();
  assert.equal(fetchChapter.mock.calls.length, 1, "the view must read the chapter once");

  // Another book, then back again. A chapter that never gave a sample must not be written off for good.
  view.rerender(<DipStream bookMeta={book("the-federalist", ["ch-09"])} onReadFullChapter={() => {}} />);
  await settleAll();
  fetchChapter.mockImplementation((bookId, filePath) =>
    Promise.resolve(chapterText(`Opening of ${bookId} ${filePath}`, `Closing of ${bookId} ${filePath}`))
  );
  view.rerender(<DipStream bookMeta={book("wealth-of-nations", ["ch-01"])} onReadFullChapter={() => {}} />);
  await settleAll();

  assert.ok(
    screen.getByText(/Opening of wealth-of-nations ch-01.md/),
    "a chapter whose read failed once was never asked for again, so it says 'unavailable' for as long as the app runs"
  );
});

test("a chapter whose sample already arrived is not read again when the reader comes back to the book", async () => {
  fetchChapter.mockImplementation((bookId, filePath) =>
    Promise.resolve(chapterText(`Opening of ${bookId} ${filePath}`, `Closing of ${bookId} ${filePath}`))
  );

  const view = render(<DipStream bookMeta={book("wealth-of-nations", ["ch-01"])} onReadFullChapter={() => {}} />);
  await settleAll();
  view.rerender(<DipStream bookMeta={book("the-federalist", ["ch-09"])} onReadFullChapter={() => {}} />);
  await settleAll();
  view.rerender(<DipStream bookMeta={book("wealth-of-nations", ["ch-01"])} onReadFullChapter={() => {}} />);
  await settleAll();

  assert.equal(
    fetchChapter.mock.calls.length,
    2,
    "a chapter whose sample the view already holds was read from disk again. Only a read that gave NO sample may " +
      "be given up on; giving up on the ones that worked too makes every book switch read the whole book again."
  );
  assert.ok(screen.getByText(/Opening of wealth-of-nations ch-01.md/), "the sample that arrived must still be shown");
});

test("a read still on its way when the reader opens another book is started again on the way back", async () => {
  const held = later<string>();
  fetchChapter.mockReturnValueOnce(held.promise);
  fetchChapter.mockImplementation((bookId, filePath) =>
    Promise.resolve(chapterText(`Opening of ${bookId} ${filePath}`, `Closing of ${bookId} ${filePath}`))
  );

  const view = render(<DipStream bookMeta={book("wealth-of-nations", ["ch-01"])} onReadFullChapter={() => {}} />);
  await settleAll();
  assert.equal(fetchChapter.mock.calls.length, 1, "the view must start reading the chapter");

  // The reader opens another book while that read is still on its way, then comes back. The read that was given
  // up on left no sample, so the chapter has to be asked for again.
  view.rerender(<DipStream bookMeta={book("the-federalist", ["ch-09"])} onReadFullChapter={() => {}} />);
  await settleAll();
  view.rerender(<DipStream bookMeta={book("wealth-of-nations", ["ch-01"])} onReadFullChapter={() => {}} />);
  await settleAll();

  assert.ok(
    screen.getByText(/Opening of wealth-of-nations ch-01.md/),
    "a chapter whose read was given up on was written off for good, so it says 'unavailable' for as long as the " +
      "app runs. Only a read that GAVE a sample may keep the chapter out of the set (TL-11)."
  );
});

test("a chapter that carries its own sample is never read from disk", async () => {
  fetchChapter.mockImplementation(() => Promise.resolve(chapterText("nothing", "here")));

  const carries = book("wealth-of-nations", ["ch-01"]);
  carries.spine[0].inspectional_sampling = {
    head_anchors: ["^p-001"],
    tail_anchors: ["^p-002"],
    head_text_preview: "The opening the import wrote",
    tail_text_preview: "The closing the import wrote",
  };

  render(<DipStream bookMeta={carries} onReadFullChapter={() => {}} />);
  await settleAll();

  assert.equal(fetchChapter.mock.calls.length, 0, "a chapter whose sample the import already wrote was read anyway");
  assert.ok(screen.getByText(/The opening the import wrote/), "the import's own sample must be the one on the page");
});
