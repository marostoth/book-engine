// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BookMeta } from "../../lib/types.ts";
import { useDialog } from "../../hooks/useDialog.ts";

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

/**
 * RD-13: the stream's paging keys are its own only while nothing else holds the focus.
 *
 * The stream listens on `window` for Space, Shift+Space, J and K. It cancelled them wherever the focus was, unless it
 * was in a text field. A focused button acts on Space when the key comes up, and a cancelled Space never does, so
 * while the Dip Sampler was open Space pressed no button of the app: not the top navigation, not the stream's own
 * "Read Chapter", not a button of a dialog opened over it. It took Ctrl+K too, which is search, and scrolled up.
 */

/** Where the stream was asked to scroll, one entry per `scrollBy`. jsdom lays nothing out, so it has no `scrollBy`. */
const scrolled: number[] = [];
const hadScrollBy = Object.getOwnPropertyDescriptor(Element.prototype, "scrollBy");

beforeEach(() => {
  scrolled.length = 0;
  Element.prototype.scrollBy = function (options?: ScrollToOptions | number) {
    scrolled.push(typeof options === "object" ? (options.top ?? 0) : 0);
  } as Element["scrollBy"];
});

afterEach(() => {
  if (hadScrollBy) Object.defineProperty(Element.prototype, "scrollBy", hadScrollBy);
  else delete (Element.prototype as Partial<Element>).scrollBy;
});

/** The app around the stream: a button of the top navigation and a select, drawn outside the stream as App.tsx does. */
function Page({ showStream = true }: { showStream?: boolean }) {
  return (
    <>
      <button type="button">Practice</button>
      <select aria-label="Theme">
        <option>Paper</option>
        <option>Nord</option>
      </select>
      {showStream && <DipStream bookMeta={book("wealth-of-nations", ["ch-01"])} onReadFullChapter={() => {}} />}
    </>
  );
}

/** A dialog of the app, open, with one button. `useDialog` puts the focus on that button. */
function OpenDialog() {
  const { panelProps } = useDialog({ isOpen: true, onClose: () => {}, label: "Practice" });
  return (
    <div {...panelProps}>
      <button type="button">Again</button>
    </div>
  );
}

async function openStream(): Promise<void> {
  fetchChapter.mockImplementation(() => Promise.resolve(chapterText("It opens", "and it closes")));
  render(<Page />);
  await settleAll();
}

/** True when something cancelled the key, which is what stops a focused button from being pressed by it. */
function cancels(target: Element, key: string, init: Partial<KeyboardEventInit> = {}): boolean {
  return !fireEvent.keyDown(target, { key, ...init });
}

/** Takes the focus off whatever holds it, so it is on the page itself. */
function focusNothing(): void {
  (document.activeElement as HTMLElement | null)?.blur();
  assert.ok(document.activeElement === document.body, "sight check: the focus must be on the page itself");
}

test("Space on a focused button of the app presses the button, and does not page the stream", async () => {
  await openStream();
  const practice = screen.getByRole("button", { name: "Practice" });
  practice.focus();

  assert.equal(
    cancels(practice, " "),
    false,
    "the stream cancelled Space on a focused button of the top navigation, so the button was never pressed (RD-13)"
  );
  assert.equal(cancels(practice, " ", { shiftKey: true }), false, "the stream cancelled Shift+Space on the button");
  assert.deepEqual(scrolled, [], "the stream paged while a button of the app held the focus");
});

test("Space on the stream's own Read Chapter button presses it", async () => {
  await openStream();
  const read = screen.getByRole("button", { name: /Read Chapter/ });
  read.focus();

  assert.equal(cancels(read, " "), false, "the stream cancelled Space on its own Read Chapter button (RD-13)");
  assert.deepEqual(scrolled, [], "the stream paged while its own button held the focus");
});

test("J and K leave a focused select alone", async () => {
  await openStream();
  const select = screen.getByRole("combobox", { name: "Theme" });
  select.focus();

  for (const key of ["j", "k"]) {
    assert.equal(cancels(select, key), false, `the stream cancelled ${key} on a focused select, which picks by letter`);
  }
  assert.deepEqual(scrolled, [], "the stream paged while a select held the focus");
});

test("a key held with Ctrl, Cmd or Alt is someone else's shortcut", async () => {
  await openStream();
  focusNothing();

  const shortcuts: [string, Partial<KeyboardEventInit>][] = [
    ["k", { ctrlKey: true }],
    ["k", { metaKey: true }],
    ["j", { altKey: true }],
    [" ", { ctrlKey: true }],
  ];
  for (const [key, held] of shortcuts) {
    assert.equal(cancels(document.body, key, held), false, `the stream cancelled ${JSON.stringify({ key, ...held })}`);
  }
  assert.deepEqual(scrolled, [], "the stream paged on Ctrl+K, which opens search, so one press did both");
});

test("with the focus on the stream or on nothing, Space, Shift+Space, J and K page it", async () => {
  await openStream();
  const stream = screen.getByLabelText("Inspectional Dip Stream");
  const keys: [string, Partial<KeyboardEventInit>][] = [
    [" ", {}],
    [" ", { shiftKey: true }],
    ["j", {}],
    ["k", {}],
  ];

  stream.focus();
  for (const [key, held] of keys) assert.equal(cancels(stream, key, held), true, `${key} must page the stream`);
  focusNothing();
  for (const [key, held] of keys) assert.equal(cancels(document.body, key, held), true, `${key} must page it`);

  assert.deepEqual(scrolled, [380, -380, 220, -220, 380, -380, 220, -220], "the stream must page by these amounts");
});

test("the stream takes the focus when it opens, so Space pages it at once", async () => {
  fetchChapter.mockImplementation(() => Promise.resolve(chapterText("It opens", "and it closes")));
  const view = render(<Page showStream={false} />);
  // The reader opens the Dip Sampler with a click, and a clicked button keeps the focus.
  screen.getByRole("button", { name: "Practice" }).focus();

  view.rerender(<Page />);
  await settleAll();

  const stream = screen.getByLabelText("Inspectional Dip Stream");
  assert.ok(
    document.activeElement === stream,
    "the focus stayed on the button that opened the view, so Space presses that button and pages nothing"
  );
  assert.equal(cancels(stream, " "), true, "Space must page the stream that holds the focus");
  assert.deepEqual(scrolled, [380]);
});

test("the stream leaves the focus inside a dialog that is open when it opens", async () => {
  fetchChapter.mockImplementation(() => Promise.resolve(chapterText("It opens", "and it closes")));
  // One component for both drawings, so the dialog stays the same dialog when the stream appears beside it.
  function DialogOverStream({ showStream }: { showStream: boolean }) {
    return (
      <>
        <OpenDialog />
        {showStream && <DipStream bookMeta={book("wealth-of-nations", ["ch-01"])} onReadFullChapter={() => {}} />}
      </>
    );
  }
  const view = render(<DialogOverStream showStream={false} />);
  const again = screen.getByRole("button", { name: "Again" });
  assert.ok(document.activeElement === again, "sight check: the dialog must hold the focus");

  view.rerender(<DialogOverStream showStream={true} />);
  await settleAll();

  assert.ok(document.activeElement === again, "the stream took the focus out of an open dialog");
  assert.equal(cancels(again, " "), false, "the stream cancelled Space on a button of an open dialog");
  assert.deepEqual(scrolled, [], "the stream paged behind an open dialog");
});
