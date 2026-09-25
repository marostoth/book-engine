// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CardSchedule, PracticeCardItem, ReaderPreferences, StudyPreferences } from "../lib/types.ts";
import { DEFAULT_PREFERENCES } from "../lib/preferences.ts";
import { SettingsContext } from "./useSettings.ts";
import { LibraryContext, type Library } from "./useLibrary.ts";
import { NO_DATA } from "../lib/analyticsText.ts";

/**
 * RD-14: the Practice badge and the practice window show only the cards of the open book.
 *
 * The deck used to keep the cards of the book the reader had just left until the new ones came, and a sync of a real
 * book reads every card against its chapter file first. In that gap the badge showed the other book's number, and the
 * window showed the other book's cards under the new book's title.
 *
 * These tests wire the hook to the real top bar and the real practice window, the way `App.tsx` does. Only the calls
 * to the backend are held, and the error bar is counted. TL-11 tested the two windows; this is the gap between them.
 */

const syncPracticeDeck = vi.fn<(bookId: string) => Promise<void>>();
const getDueCards = vi.fn<(bookId: string) => Promise<PracticeCardItem[]>>();
const submitReview = vi.fn<(cardId: string, rating: number) => Promise<CardSchedule>>();
const reportBackendError = vi.fn();

vi.mock("../lib/api.ts", () => ({
  syncPracticeDeck: (bookId: string) => syncPracticeDeck(bookId),
  getDueCards: (bookId: string) => getDueCards(bookId),
  submitReview: (cardId: string, rating: number) => submitReview(cardId, rating),
}));
vi.mock("../lib/backendErrors.ts", () => ({
  reportBackendError: (action: string, error: unknown) => reportBackendError(action, error),
}));

const { usePracticeDeck } = await import("./usePracticeDeck.ts");
const { TopNav } = await import("../components/TopNav.tsx");
const { PracticeModal } = await import("../components/PracticeModal.tsx");

const WEALTH = "wealth-of-nations";
const FEDERALIST = "the-federalist";

/** What `getDueCards` answers for each book. A function, so every call gets its own answer. */
let dueCardsOf: Record<string, () => Promise<PracticeCardItem[]>> = {};

afterEach(() => {
  cleanup();
  syncPracticeDeck.mockReset();
  getDueCards.mockReset();
  submitReview.mockReset();
  reportBackendError.mockReset();
  dueCardsOf = {};
});

function setUp() {
  syncPracticeDeck.mockResolvedValue(undefined);
  getDueCards.mockImplementation((bookId) => dueCardsOf[bookId]());
  submitReview.mockImplementation(async (cardId) => ({
    card_id: cardId,
    state: 2,
    stability: 3,
    difficulty: 5,
    due: 0,
    last_review: 0,
    reps: 1,
    interval_days: 3,
  }));
}

/** A promise the test settles by hand, so a load can be held open while the page is looked at. */
function later<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

/** A cloze card of `book`. Its chapter file names the book, so the window shows whose card it is. */
function card(book: string, n: number): PracticeCardItem {
  return {
    card_id: `${book}-${n}`,
    book_id: book,
    chapter_file: `${book}-ch-0${n}.md`,
    anchor: "",
    item_type: "cloze",
    prompt: `Sentence ${n} holds the answer here.`,
    answer: "answer",
    state: 0,
    stability: 0,
    difficulty: 0,
    due: 0,
    last_review: 0,
    reps: 0,
  };
}

function settings(practiceMode: StudyPreferences["practiceMode"] = "verbatim"): ReaderPreferences {
  return { ...DEFAULT_PREFERENCES, study: { ...DEFAULT_PREFERENCES.study, practiceMode } };
}

/** The deck, the top bar and the practice window, wired as `App.tsx` and `AppModals.tsx` wire them. */
function Reader({ bookId, preferences }: { bookId: string; preferences: ReaderPreferences }) {
  const deck = usePracticeDeck(bookId, preferences);
  const library: Library = {
    activeBookId: bookId,
    bookMeta: null,
    availableBooks: [],
    selectBook: () => {},
    rescan: { run: () => {}, running: false, note: "" },
  };
  return (
    <SettingsContext.Provider value={{ settings: preferences, change: () => {} }}>
      <LibraryContext.Provider value={library}>
        <TopNav
          chapterTitle="Reading"
          progressPercent={0}
          sidebarOpen={false}
          onToggleSidebar={() => {}}
          theme="paper"
          onThemeChange={() => {}}
          viewMode="reading"
          onViewModeChange={() => {}}
          onOpenSearch={() => {}}
          dueCardsCount={deck.dueCardsCount}
          onOpenPractice={() => deck.setPracticeModalOpen(true)}
          onResyncDeck={deck.refreshPracticeCards}
        />
        <PracticeModal
          isOpen={deck.practiceModalOpen}
          onClose={() => deck.setPracticeModalOpen(false)}
          bookId={bookId}
          cards={deck.dueCards}
          onReviewSubmitted={deck.handleReviewSubmitted}
        />
      </LibraryContext.Provider>
    </SettingsContext.Provider>
  );
}

function openReader(bookId: string, preferences = settings()) {
  const view = render(<Reader bookId={bookId} preferences={preferences} />);
  return (nextBook: string, nextPreferences = preferences) =>
    view.rerender(<Reader bookId={nextBook} preferences={nextPreferences} />);
}

/** Lets the held calls answer, and React draw what they gave. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The Practice button of the top bar: "Practice" and the number on its badge, such as "Practice2". */
function practiceButton(): string {
  return screen.getByTitle("Open Extractive Practice Suite").textContent ?? "";
}

function openPractice() {
  fireEvent.click(screen.getByTitle("Open Extractive Practice Suite"));
}

/** The chapter files of the cards shown now. The window shows the chapter file of the card it asks. */
function cardShownFrom(book: string): boolean {
  return screen.queryByText(new RegExp(`^${book}-ch-`)) !== null;
}

/** The Sync Deck button of the settings, such as "Sync Deck (2)". */
function syncDeckButton(): HTMLElement {
  fireEvent.click(screen.getByTitle("Reader Preferences & Learning Levels"));
  const tab = screen
    .getAllByRole("button")
    .find((button) => button.textContent === "Practice" && button.title !== "Open Extractive Practice Suite");
  assert.ok(tab, "the settings have no Practice tab, so this test reads nothing");
  fireEvent.click(tab);
  const sync = screen.getByText(/^Sync Deck/).closest("button");
  assert.ok(sync, "the Practice tab has no Sync Deck button, so this test reads nothing");
  return sync;
}

function rateTheShownCardGood() {
  fireEvent.click(screen.getByText("Show Answer"));
  fireEvent.click(screen.getByText("Good"));
}

test("after a switch, the badge and the window show nothing of the book left until the new cards come", async () => {
  setUp();
  dueCardsOf[WEALTH] = () => Promise.resolve([card(WEALTH, 1), card(WEALTH, 2)]);
  const switchTo = openReader(WEALTH);
  await settle();
  assert.equal(practiceButton(), "Practice2", "the first book's cards did not arrive, so this test reads nothing");

  const federalistCards = later<PracticeCardItem[]>();
  dueCardsOf[FEDERALIST] = () => federalistCards.promise;
  switchTo(FEDERALIST);
  await settle();
  assert.deepEqual(getDueCards.mock.calls.at(-1), [FEDERALIST], "the switch asked for no cards");

  assert.equal(practiceButton(), "Practice", "the badge shows the number of the book the reader left");
  openPractice();
  assert.equal(cardShownFrom(WEALTH), false, "the window shows a card of the book the reader left");
  assert.ok(screen.queryByText("No Cards Due for Review!") === null, "the window says no card is due before it knows");
  assert.ok(screen.queryByText("Loading Your Cards…"), "the window does not say the cards are on their way");

  federalistCards.settle([card(FEDERALIST, 9)]);
  await settle();
  assert.equal(practiceButton(), "Practice1");
  assert.ok(cardShownFrom(FEDERALIST), "the new book's card did not arrive in the open window");
});

test("a session started on one book is not carried on to the next", async () => {
  setUp();
  dueCardsOf[WEALTH] = () => Promise.resolve([card(WEALTH, 1), card(WEALTH, 2)]);
  dueCardsOf[FEDERALIST] = () => Promise.resolve([card(FEDERALIST, 9)]);
  const switchTo = openReader(WEALTH);
  await settle();
  openPractice();
  rateTheShownCardGood();
  await settle();
  assert.equal(submitReview.mock.calls.length, 1, "no card was rated, so this test reads nothing");
  assert.ok(cardShownFrom(WEALTH), "the second card of the first book is not shown, so this test reads nothing");

  // A session keeps its own copy of the cards after the first rating. That copy belongs to the book it came from.
  switchTo(FEDERALIST);
  await settle();

  assert.equal(cardShownFrom(WEALTH), false, "the window goes on with the cards of the book the reader left");
  assert.ok(cardShownFrom(FEDERALIST), "the window does not show the open book's card");
});

test("a Sync Deck answer for the book left never lands on the book now open", async () => {
  setUp();
  dueCardsOf[WEALTH] = () => Promise.resolve([card(WEALTH, 1)]);
  const switchTo = openReader(WEALTH);
  await settle();
  assert.equal(practiceButton(), "Practice1", "the first book's cards did not arrive, so this test reads nothing");

  const lateWealth = later<PracticeCardItem[]>();
  dueCardsOf[WEALTH] = () => lateWealth.promise;
  fireEvent.click(syncDeckButton());
  await settle();
  assert.equal(getDueCards.mock.calls.length, 2, "Sync Deck did not ask again");
  assert.equal(practiceButton(), "Practice", "the badge shows the last count while the deck syncs");

  dueCardsOf[FEDERALIST] = () => Promise.resolve([card(FEDERALIST, 9)]);
  switchTo(FEDERALIST);
  await settle();
  assert.equal(practiceButton(), "Practice1", "the new book's cards did not arrive, so this test reads nothing");

  lateWealth.settle([card(WEALTH, 1), card(WEALTH, 2), card(WEALTH, 3)]);
  await settle();
  assert.equal(practiceButton(), "Practice1", "the late answer for the book left replaced the open book's cards");
  openPractice();
  assert.equal(cardShownFrom(WEALTH), false, "the window shows a card of the book the reader left");
});

test("Sync Deck shows a dash, not 0, while the cards are not known", async () => {
  setUp();
  dueCardsOf[WEALTH] = () => new Promise(() => {});
  openReader(WEALTH);
  await settle();
  assert.equal(getDueCards.mock.calls.length, 1, "the deck asked for no cards, so this test reads nothing");

  assert.equal(syncDeckButton().textContent, `Sync Deck (${NO_DATA})`);
});

test("cards that did not load are not 'no cards due'", async () => {
  setUp();
  dueCardsOf[WEALTH] = () => Promise.reject(new Error("index.db is locked"));
  openReader(WEALTH);
  await settle();
  assert.equal(reportBackendError.mock.calls.length, 1, "the load did not fail, so this test reads nothing");

  assert.equal(practiceButton(), "Practice");
  openPractice();
  assert.ok(screen.queryByText("No Cards Due for Review!") === null, "a failed load claims no card is due");
  assert.ok(screen.queryByText("Your Cards Did Not Load"), "the window does not say the cards did not load");
});

test("another practice mode shows nothing of the last mode's cards until its own come", async () => {
  setUp();
  dueCardsOf[WEALTH] = () => Promise.resolve([card(WEALTH, 1), card(WEALTH, 2)]);
  const change = openReader(WEALTH);
  await settle();
  assert.equal(practiceButton(), "Practice2", "the first cards did not arrive, so this test reads nothing");

  dueCardsOf[WEALTH] = () => new Promise(() => {});
  change(WEALTH, settings("mcq_scenario"));
  await settle();
  assert.equal(getDueCards.mock.calls.length, 2, "the new mode asked for no cards");

  assert.equal(practiceButton(), "Practice", "the badge shows the count of the last mode's cards");
});

test("the cards that came are shown, a rating takes one off the badge, and a real 0 is still 0", async () => {
  // The control: this passes before and after RD-14.
  setUp();
  dueCardsOf[WEALTH] = () => Promise.resolve([card(WEALTH, 1), card(WEALTH, 2)]);
  const switchTo = openReader(WEALTH);
  await settle();
  assert.equal(practiceButton(), "Practice2");
  openPractice();
  assert.ok(cardShownFrom(WEALTH));
  rateTheShownCardGood();
  await settle();
  assert.equal(practiceButton(), "Practice1");
  fireEvent.click(screen.getByTitle("Close Practice Session (Esc)"));

  dueCardsOf[FEDERALIST] = () => Promise.resolve([]);
  switchTo(FEDERALIST);
  await settle();
  assert.equal(practiceButton(), "Practice");
  assert.equal(syncDeckButton().textContent, "Sync Deck (0)");
  fireEvent.click(screen.getByTitle("Reader Preferences & Learning Levels"));
  openPractice();
  assert.ok(screen.queryByText("No Cards Due for Review!"), "a book with no card due does not say so");
});
