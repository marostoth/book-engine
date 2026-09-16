import test, { mock } from "node:test";
import assert from "node:assert/strict";
import type { BookMeta, ChapterMeta } from "./types.ts";
import {
  BROWSER_BOOK_KEY,
  createBookmarkKeeper,
  createPlaceWatcher,
  openingPlace,
  paragraphAtMiddle,
  readBrowserBookId,
  startingBookId,
  type ChapterRef,
} from "./readingPlace.ts";

/**
 * DS-11: the app opens each book where the reader stopped, and opens the book the reader read last.
 *
 * The reader screen needs a DOM, which this repo has no test library for, so these tests cover the rules the screen is
 * built on: where a book opens, which book opens, which paragraph is the place, and when the place is saved.
 */

function chapter(n: number): ChapterMeta {
  return {
    id: `ch-0${n}`,
    title: `Chapter ${n}`,
    file_path: `ch-0${n}.md`,
    order: n,
    word_count: 1000,
    anchor_count: 10,
    footnotes_count: 0,
  };
}

function book(bookId: string, chapters: number): BookMeta {
  const spine = Array.from({ length: chapters }, (_, index) => chapter(index + 1));
  return {
    book_id: bookId,
    title: bookId,
    author: "Anon",
    language: "en",
    total_words: 1000,
    total_chapters: spine.length,
    toc: [],
    spine,
    created_at: "2026-09-16T00:00:00Z",
  };
}

const library = [{ id: "adler" }, { id: "hume" }, { id: "smith" }];

test("a book opens at the chapter and the paragraph where the reader stopped", () => {
  const opening = openingPlace(book("hume", 5), { chapterFile: "ch-04.md", anchor: "^p-031" });

  assert.equal(opening.chapter?.file_path, "ch-04.md", "not chapter 1");
  assert.equal(opening.anchor, "^p-031");
});

test("a book the reader has not read opens at its first chapter, at the top", () => {
  assert.deepEqual(openingPlace(book("hume", 5), null), { chapter: chapter(1) });
});

test("a saved chapter the book no longer has opens the first chapter, not a paragraph of another chapter", () => {
  const opening = openingPlace(book("hume", 2), { chapterFile: "ch-09.md", anchor: "^p-031" });

  assert.deepEqual(opening, { chapter: chapter(1) });
});

test("a saved place in either anchor form opens at that paragraph, and anything else opens the chapter at the top", () => {
  assert.equal(openingPlace(book("hume", 2), { chapterFile: "ch-02.md", anchor: "p-007" }).anchor, "^p-007");
  assert.deepEqual(openingPlace(book("hume", 2), { chapterFile: "ch-02.md", anchor: "top" }), { chapter: chapter(2) });
});

test("a book with no chapters opens without a chapter", () => {
  assert.deepEqual(openingPlace(book("empty", 0), { chapterFile: "ch-01.md" }), { chapter: null });
});

test("the app opens the book the reader read last, even when browser storage names another one", () => {
  const last = { bookId: "smith", chapterFile: "ch-11.md", savedAt: "2026-09-16T21:00:00.000Z" };

  assert.equal(startingBookId(library, last, "adler"), "smith");
});

test("a release build or a new PC has no browser storage, and still opens the book read last", () => {
  const last = { bookId: "hume", chapterFile: "ch-02.md", savedAt: "2026-09-16T21:00:00.000Z" };

  assert.equal(startingBookId(library, last, null), "hume");
});

test("before any bookmark exists, the book browser storage remembers from an older version opens", () => {
  assert.equal(startingBookId(library, null, "smith"), "smith");
});

test("a book that left the library is passed over, then the first book opens", () => {
  const gone = { bookId: "plato", chapterFile: "ch-01.md" };

  assert.equal(startingBookId(library, gone, "aristotle"), "adler");
  assert.equal(startingBookId([], gone, "plato"), null, "an empty library opens no book");
});

test("the open book an older version kept in browser storage is read, and a storage that fails reads as none", () => {
  assert.equal(readBrowserBookId(() => ({ getItem: (key) => (key === BROWSER_BOOK_KEY ? "hume" : null) })), "hume");
  assert.equal(readBrowserBookId(() => ({ getItem: () => "" })), null);
  assert.equal(
    readBrowserBookId(() => {
      throw new Error("storage is blocked");
    }),
    null
  );
});

test("the place is the lowest paragraph that starts at or above the middle of the screen", () => {
  const paragraphs = [
    { anchor: "p-001", top: -900 },
    { anchor: "p-002", top: -300 },
    { anchor: "p-003", top: 120 },
    { anchor: "p-004", top: 390 },
    { anchor: "p-005", top: 820 },
  ];

  assert.equal(paragraphAtMiddle(paragraphs, 400), "^p-004", "saved in the form the Markdown uses");
  assert.equal(paragraphAtMiddle(paragraphs, 390), "^p-004", "a paragraph that starts on the line counts");
  assert.equal(paragraphAtMiddle([...paragraphs].reverse(), 400), "^p-004", "the order of the list does not matter");
});

test("when every paragraph starts below the middle, the place is the first paragraph", () => {
  assert.equal(paragraphAtMiddle([{ anchor: "p-002", top: 700 }, { anchor: "p-001", top: 500 }], 400), "^p-001");
});

test("a screen with no anchored paragraph has no place", () => {
  assert.equal(paragraphAtMiddle([], 400), undefined);
  assert.equal(paragraphAtMiddle([{ anchor: null, top: 10 }, { anchor: "figure-1", top: 20 }], 400), undefined);
});

test("closing and opening a book again and again keeps the same place", () => {
  // Paragraph boxes in the chapter, in pixels from its top. The reader shows 800 pixels.
  const heights = [120, 340, 60, 500, 90, 210, 1400, 75, 260, 180];
  let y = 0;
  const chapterBoxes = heights.map((height, index) => {
    const box = { anchor: `p-${String(index + 1).padStart(3, "0")}`, top: y, height };
    y += height + 24;
    return box;
  });
  const screenHeight = 800;
  const lowestScroll = y - screenHeight;
  const placeAt = (scrollTop: number) =>
    paragraphAtMiddle(
      chapterBoxes.map((box) => ({ anchor: box.anchor, top: box.top - scrollTop })),
      screenHeight / 2
    );
  // The reader scrolls a paragraph to the middle of the screen when a book opens (`block: "center"`), as far as the
  // top and the end of the chapter allow.
  const openAt = (anchor: string) => {
    const box = chapterBoxes.find((candidate) => `^${candidate.anchor}` === anchor)!;
    return Math.min(lowestScroll, Math.max(0, box.top + box.height / 2 - screenHeight / 2));
  };

  for (const scrollTop of [0, 150, 777, 1300, 2000, 2600]) {
    const place = placeAt(scrollTop)!;
    let reopened = place;
    for (let round = 0; round < 5; round += 1) {
      reopened = placeAt(openAt(reopened))!;
    }
    assert.equal(reopened, place, `the place read at ${scrollTop} px must not creep up or down`);
  }
});

const humeTwo: ChapterRef = { bookId: "hume", chapterFile: "ch-02.md" };
const humeThree: ChapterRef = { bookId: "hume", chapterFile: "ch-03.md" };

/** A place watcher whose middle paragraph the test sets, and which records what it reports. */
function watcher(delayMs = 1000) {
  const reports: string[] = [];
  let middle: string | undefined = "^p-001";
  const watch = createPlaceWatcher(
    delayMs,
    () => middle,
    (place, anchor) => reports.push(`${place.bookId}/${place.chapterFile}#${anchor ?? ""}`)
  );
  return { watch, reports, setMiddle: (anchor: string | undefined) => (middle = anchor) };
}

test("a long scroll saves the place once, after the reader stops", (t) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => mock.timers.reset());
  const { watch, reports, setMiddle } = watcher();
  watch.shown(humeTwo);

  for (let step = 1; step <= 20; step += 1) {
    setMiddle(`^p-0${10 + step}`);
    watch.moved();
    mock.timers.tick(100);
  }
  assert.deepEqual(reports, [], "nothing is saved while the reader is still scrolling");

  mock.timers.tick(1000);
  assert.deepEqual(reports, ["hume/ch-02.md#^p-030"], "one save, with the paragraph where the scrolling stopped");
});

test("the place names the chapter whose words were on screen, not a chapter still loading", (t) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => mock.timers.reset());
  const { watch, reports, setMiddle } = watcher();

  watch.shown(humeTwo);
  setMiddle("^p-045");
  watch.moved();
  // The reader picks chapter three. Its words have not arrived, so chapter two's words are still on screen.
  mock.timers.tick(1000);
  assert.deepEqual(reports, ["hume/ch-02.md#^p-045"], "a paragraph of chapter two must never be saved as chapter three");

  watch.shown(humeThree);
  setMiddle("^p-001");
  watch.moved();
  mock.timers.tick(1000);
  assert.deepEqual(reports, ["hume/ch-02.md#^p-045", "hume/ch-03.md#^p-001"]);
});

test("no place is saved while no chapter's words are on screen", (t) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => mock.timers.reset());
  const { watch, reports } = watcher();

  watch.moved();
  mock.timers.tick(1000);
  watch.shown(null);
  watch.moved();
  mock.timers.tick(1000);

  assert.deepEqual(reports, []);
});

test("leaving the reader saves the waiting place at once, and only once", (t) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => mock.timers.reset());
  const { watch, reports, setMiddle } = watcher();
  watch.shown(humeTwo);

  setMiddle("^p-017");
  watch.moved();
  watch.flush();
  assert.deepEqual(reports, ["hume/ch-02.md#^p-017"]);

  mock.timers.tick(1000);
  watch.flush();
  assert.deepEqual(reports, ["hume/ch-02.md#^p-017"], "a place that was saved is not saved again");
});

test("a book whose bookmark could not be read keeps it: no place is saved over it until it reads again", async () => {
  const saves: string[] = [];
  const keeper = createBookmarkKeeper(
    async (bookId, chapterFile, anchor) => {
      saves.push(`${bookId}/${chapterFile}#${anchor ?? ""}`);
    },
    () => assert.fail("nothing failed")
  );

  keeper.bookOpened("hume", false);
  keeper.save(humeTwo, "^p-003");
  keeper.save({ bookId: "adler", chapterFile: "ch-01.md" }, "^p-001");
  assert.deepEqual(saves, ["adler/ch-01.md#^p-001"], "only the book whose bookmark was read may be saved");

  keeper.bookOpened("hume", true);
  keeper.save(humeTwo, "^p-003");
  assert.deepEqual(saves, ["adler/ch-01.md#^p-001", "hume/ch-02.md#^p-003"]);
});

test("a book opened from a search hit, whose bookmark was not read, saves its place", async () => {
  const saves: string[] = [];
  const keeper = createBookmarkKeeper(
    async (bookId, chapterFile) => {
      saves.push(`${bookId}/${chapterFile}`);
    },
    () => assert.fail("nothing failed")
  );

  keeper.save(humeThree, "^p-020");

  assert.deepEqual(saves, ["hume/ch-03.md"]);
});

test("a place that was not saved is reported", async () => {
  const reported: string[] = [];
  const keeper = createBookmarkKeeper(
    async () => {
      throw new Error("the vault is not reachable");
    },
    (action) => reported.push(action)
  );

  keeper.save(humeTwo, "^p-003");
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(reported, ["Where you stopped reading was not saved."]);
});
