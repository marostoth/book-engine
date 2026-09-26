// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SearchResult } from "../lib/types.ts";

/**
 * TL-11: an answer belongs to the question it answers, and nothing else is ever shown.
 *
 * Twelve loads used to reset their state inside an effect, before the fetch: `setLoading(true)`,
 * `setLoadState("loading")`, `setLoadedBookId(null)`. An effect runs after the drawing it belongs to has reached
 * the screen, so each of them left one drawing where the page had already moved on and the state had not.
 *
 * Each piece of state carries the request it answers now, and "loading" is what the component reads when that
 * request is not the current one. These are the two places where the old shape could do real harm.
 */

const searchVault = vi.fn<(query: string) => Promise<SearchResult[]>>();
const fetchNotes = vi.fn<(bookId: string, notesFile: string) => Promise<string>>();
const persistNotes = vi.fn(() => Promise.resolve());

vi.mock("../lib/api.ts", () => ({
  searchVault: (query: string) => searchVault(query),
  fetchNotes: (bookId: string, notesFile: string) => fetchNotes(bookId, notesFile),
  persistNotes: () => persistNotes(),
}));

const { OmniSearchModal } = await import("./OmniSearchModal.tsx");
const { NotesPane } = await import("./NotesPane.tsx");

/** A promise the test settles by hand, so a load can be held open while the page is looked at. */
function later<T>() {
  let settle!: (value: T) => void;
  let fail!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

function hit(snippet: string): SearchResult {
  return {
    book_id: "wealth-of-nations",
    chapter_id: "ch-02",
    chapter_title: "Of the Principle which gives Occasion to the Division of Labour",
    chapter_file: "ch-02.md",
    anchor: "p-014",
    snippet,
    rank: -1.2,
  };
}

afterEach(() => {
  cleanup();
  searchVault.mockReset();
  fetchNotes.mockReset();
});

// ------------------------------------------------------------------------------------------- the search window

/** The search window's debounce, in milliseconds. Typing waits this long before the backend is asked. */
const DEBOUNCE_MS = 150;

test("results found for one query are never shown under another", async () => {
  vi.useFakeTimers();
  try {
    searchVault.mockResolvedValue([hit("the division of labour")]);
    render(<OmniSearchModal isOpen onClose={() => {}} books={[]} onSelectResult={() => {}} />);
    const box = screen.getByPlaceholderText(/search/i);

    fireEvent.change(box, { target: { value: "labour" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);
    });
    assert.ok(screen.queryByText(/division of labour/), "the search found nothing, so this test reads nothing");

    // The reader types one more letter. The backend has not answered the longer query yet.
    searchVault.mockReturnValue(later<SearchResult[]>().promise);
    fireEvent.change(box, { target: { value: "labourers" } });

    assert.ok(
      screen.queryByText(/division of labour/) === null,
      "the hits for 'labour' are still on screen under a box that says 'labourers'"
    );
    assert.ok(screen.queryByText(/Querying/), "the window does not say it is still looking");
  } finally {
    vi.useRealTimers();
  }
});

test("a query cut back below the minimum takes its results off the screen at once", async () => {
  vi.useFakeTimers();
  try {
    searchVault.mockResolvedValue([hit("the division of labour")]);
    render(<OmniSearchModal isOpen onClose={() => {}} books={[]} onSelectResult={() => {}} />);
    const box = screen.getByPlaceholderText(/search/i);

    fireEvent.change(box, { target: { value: "labour" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);
    });
    assert.ok(screen.queryByText(/division of labour/), "the search found nothing, so this test reads nothing");

    fireEvent.change(box, { target: { value: "l" } });
    assert.ok(
      screen.queryByText(/division of labour/) === null,
      "one letter is not a search, and the hits of the last one are still under it"
    );
  } finally {
    vi.useRealTimers();
  }
});

// ----------------------------------------------------------------------------------------------- the notes pane

/** What the status button of the notes pane says right now. It is the one place the pane states its own state. */
function paneSays(): string {
  const button = document.querySelector<HTMLElement>('[title*="notes"], [title*="Loading"], [title*="Saved"]');
  return button?.textContent?.trim() ?? "(nothing)";
}

test("the notes pane is locked until the notes of THIS chapter have arrived", async () => {
  const first = later<string>();
  fetchNotes.mockReturnValue(first.promise);

  const page = render(
    <NotesPane bookId="wealth-of-nations" chapterFile="ch-01.md" insertedQuote={null} onClearInsertedQuote={() => {}} />
  );
  assert.equal(paneSays(), "Loading...", "the pane does not say it is loading, so this test reads nothing");

  await act(async () => {
    first.settle("The notes of chapter one.");
  });
  assert.equal(paneSays(), "Saved", "the pane never unlocked after its notes arrived");

  // The reader opens another chapter. App.tsx keys this pane by chapter, so it is built again; the test does the
  // same by hand, and the new chapter's notes are still on their way.
  const second = later<string>();
  fetchNotes.mockReturnValue(second.promise);
  page.rerender(
    <NotesPane
      key="ch-02.md"
      bookId="wealth-of-nations"
      chapterFile="ch-02.md"
      insertedQuote={null}
      onClearInsertedQuote={() => {}}
    />
  );

  assert.equal(
    paneSays(),
    "Loading...",
    "the pane is unlocked for typing while it still holds the chapter before this one, and a save now writes "
      + "one chapter's notes into the other chapter's file"
  );

  await act(async () => {
    second.settle("The notes of chapter two.");
  });
  assert.equal(paneSays(), "Saved");
});

test("a chapter whose notes did not load stays locked, and says so", async () => {
  const asked = later<string>();
  fetchNotes.mockReturnValue(asked.promise);
  render(
    <NotesPane bookId="wealth-of-nations" chapterFile="ch-01.md" insertedQuote={null} onClearInsertedQuote={() => {}} />
  );

  await act(async () => {
    asked.fail(new Error("the notes file could not be read"));
  });

  assert.equal(paneSays(), "Locked", "a pane whose notes did not read must never accept typing (DS-07)");
});

test("Try again says it is loading, on the same pane, without being built afresh", async () => {
  // App.tsx keys this pane by book and chapter, so a chapter change builds a new one and its state starts over.
  // "Try again" does NOT: it counts the attempt up on the pane already on screen. So this is the one path where
  // the load state has to be worked out from WHICH attempt finished, and not merely from whether any did. A
  // mutation that read `finished === null` instead went green until this test existed.
  const first = later<string>();
  fetchNotes.mockReturnValue(first.promise);
  render(
    <NotesPane bookId="wealth-of-nations" chapterFile="ch-01.md" insertedQuote={null} onClearInsertedQuote={() => {}} />
  );
  await act(async () => {
    first.fail(new Error("the notes file could not be read"));
  });
  assert.equal(paneSays(), "Locked", "the first load did not fail, so this test never reaches what it is about");

  const second = later<string>();
  fetchNotes.mockReturnValue(second.promise);
  await act(async () => {
    fireEvent.click(screen.getByText("Try again"));
  });

  assert.equal(
    paneSays(),
    "Loading...",
    "the pane still says Locked while it is reading the file again, so Try again looks like it did nothing"
  );
  assert.equal(fetchNotes.mock.calls.length, 2, "Try again did not read the file again at all");

  await act(async () => {
    second.settle("The notes of chapter one, read on the second try.");
  });
  assert.equal(paneSays(), "Saved", "the pane never unlocked after the second try worked");
});
