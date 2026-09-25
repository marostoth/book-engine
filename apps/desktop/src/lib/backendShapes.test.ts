import { test } from "vitest";
import assert from "node:assert/strict";
import {
  bookMetaFrom,
  highlightsFrom,
  isHighlight,
  isRecord,
  readableHighlightsFrom,
  vocabularyFrom,
} from "./backendShapes.ts";

/** A book file with everything the app reads. Each test takes this and breaks one thing. */
function goodBook(): Record<string, unknown> {
  return {
    book_id: "a-book",
    title: "A Book",
    author: "A Writer",
    language: "en",
    total_words: 120,
    total_chapters: 1,
    toc: [{ id: "ch-01", title: "One", href: "ch-01.md", level: 1 }],
    spine: [
      {
        id: "ch-01",
        title: "One",
        file_path: "ch-01.md",
        order: 0,
        word_count: 120,
        anchor_count: 3,
        footnotes_count: 0,
      },
    ],
    inspectional_blueprint: { pivotal_chapters: ["ch-01"], synthetic_index_clusters: [] },
  };
}

function goodHighlight(): Record<string, unknown> {
  return { id: "h1", exact: "the words", prefix: "before ", suffix: " after", createdAt: "2026-09-19T10:00:00Z" };
}

// ---------------------------------------------------------------- a book file

test("a good book file is read, and a field the app does not check is kept", () => {
  const meta = bookMetaFrom(JSON.stringify(goodBook()), "a-book");
  assert.equal(meta.book_id, "a-book");
  assert.equal(meta.spine.length, 1);
  assert.equal(meta.spine[0].file_path, "ch-01.md");
  // The checks ask only for what the app reads. Everything else must travel through untouched, or a book from an
  // older import loses its blueprint on the way in.
  assert.equal(meta.inspectional_blueprint?.pivotal_chapters?.[0], "ch-01");
});

test("a book file with no spine is refused, and the message names the book", () => {
  const broken = goodBook();
  delete broken.spine;
  assert.throws(
    () => bookMetaFrom(JSON.stringify(broken), "dalton-mind-over-markets"),
    /dalton-mind-over-markets.*spine/s,
    "a book with no chapters used to reach the reader, and failed later with a message that named no file"
  );
});

test("a book file that is not JSON is refused by name", () => {
  assert.throws(() => bookMetaFrom("{not json", "a-book"), /a-book.*not readable JSON/s);
});

test("a book file with no title is refused", () => {
  const broken = goodBook();
  delete broken.title;
  assert.throws(
    () => bookMetaFrom(JSON.stringify(broken), "a-book"),
    /a-book.*has no title/s,
    "a book with no title reaches every screen that shows a book name, and shows nothing there"
  );
});

test("a book file with no book_id is refused", () => {
  const broken = goodBook();
  delete broken.book_id;
  assert.throws(() => bookMetaFrom(JSON.stringify(broken), "a-book"), /has no book_id/);
});

test("a book file that holds a list instead of an object is refused", () => {
  assert.throws(() => bookMetaFrom("[]", "a-book"), /not an object/);
});

test("a chapter with no file_path is refused, and the message says which chapter", () => {
  const broken = goodBook();
  (broken.spine as Record<string, unknown>[])[0].file_path = 42;
  assert.throws(() => bookMetaFrom(JSON.stringify(broken), "a-book"), /chapter 1 has no file_path/);
});

test("a chapter with no word count still opens the book, with a zero", () => {
  const thin = goodBook();
  delete (thin.spine as Record<string, unknown>[])[0].word_count;
  const meta = bookMetaFrom(JSON.stringify(thin), "a-book");
  assert.equal(meta.spine[0].word_count, 0, "a missing count must not stop a whole book from opening");
});

test("a book file with no author still opens, and says so", () => {
  const thin = goodBook();
  delete thin.author;
  assert.equal(bookMetaFrom(JSON.stringify(thin), "a-book").author, "Unknown author");
});

test("a book file with no total_chapters counts its own chapters", () => {
  const thin = goodBook();
  delete thin.total_chapters;
  assert.equal(bookMetaFrom(JSON.stringify(thin), "a-book").total_chapters, 1);
});

// ---------------------------------------------------------------- saved highlights

test("a damaged highlight rejects the list, so the next highlight cannot save over it", () => {
  const mixed = [goodHighlight(), { id: "h2", exact: "only this" }, { ...goodHighlight(), id: "h3" }];
  assert.throws(
    () => highlightsFrom(mixed, "The saved highlights of ch-01.md"),
    /ch-01\.md: 1 of 3 saved highlights cannot be read/,
    "the list on screen is what the next highlight saves, so a dropped entry was erased from the vault (TL-14)"
  );
});

test("a list whose every entry names a field another way is rejected, not emptied", () => {
  // What a field renamed on one side of the seam looks like: every entry is wrong in the same way
  const drifted = [goodHighlight(), { ...goodHighlight(), id: "h2" }].map(({ createdAt, ...rest }) => ({
    ...rest,
    created_at: createdAt,
  }));
  assert.throws(() => highlightsFrom(drifted, "test"), /2 of 2 saved highlights cannot be read/);
});

test("a highlight list that is not a list is rejected", () => {
  assert.throws(() => highlightsFrom(null, "test"), /not a list/);
  assert.throws(() => highlightsFrom("[]", "test"), /not a list/);
  assert.throws(() => highlightsFrom({ 0: goodHighlight() }, "test"), /not a list/);
});

test("a list of good highlights is given back whole, and an empty list stays empty", () => {
  const good = [goodHighlight(), { ...goodHighlight(), id: "h2", anchor: "^p-002", color: "blue" }];
  assert.deepEqual(highlightsFrom(good, "test"), good);
  assert.deepEqual(highlightsFrom([], "test"), []);
});

test("a list that is only read drops a damaged highlight and keeps every good one", () => {
  const mixed = [goodHighlight(), { id: "h2", exact: "only this" }, { ...goodHighlight(), id: "h3" }];
  assert.deepEqual(
    readableHighlightsFrom(mixed, "test").map((h) => h.id),
    ["h1", "h3"],
    "one bad entry used to reach the reader and throw while the chapter was being drawn (RD-09)"
  );
  assert.deepEqual(readableHighlightsFrom(null, "test"), []);
});

test("isHighlight says no to a string, a null and a list", () => {
  assert.equal(isHighlight("h1"), false);
  assert.equal(isHighlight(null), false);
  assert.equal(isHighlight([goodHighlight()]), false);
  assert.equal(isHighlight(goodHighlight()), true);
});

test("isRecord says no to a list and to null", () => {
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord({}), true);
});

/** A saved word with everything the drawer reads. Each test takes this and breaks one thing. */
function goodWord(): Record<string, unknown> {
  return {
    word: "quorum",
    definition: "The smallest number of people who may decide.",
    chapterFile: "ch-02.md",
    anchor: "^p-005",
    savedAt: "2026-09-18T10:00:00.000Z",
  };
}

test("one damaged word is dropped and the good words are kept", () => {
  const kept = vocabularyFrom([goodWord(), "not a word", { word: 7 }, goodWord()], "test");

  assert.equal(kept.length, 2, "a damaged word must not lose the reader every other word of the book");
});

test("a word with no meaning is kept, with an empty meaning", () => {
  const noMeaning = goodWord();
  delete noMeaning.definition;

  const [kept] = vocabularyFrom([noMeaning], "test");

  assert.equal(kept.word, "quorum");
  assert.equal(kept.definition, "");
});

test("a word saved before the app kept chapters is kept, with no chapter and no anchor", () => {
  const old = { word: "quorum", definition: "A meaning." };

  const [kept] = vocabularyFrom([old], "test");

  assert.equal(kept.chapterFile, "");
  assert.equal(kept.anchor, "");
  assert.equal(kept.savedAt, "");
});

test("a word with no word at all is dropped, because nothing could be shown for it", () => {
  assert.equal(vocabularyFrom([{ definition: "A meaning." }], "test").length, 0);
  assert.equal(vocabularyFrom([{ word: "   " }], "test").length, 0);
});

test("a word list that is not a list gives an empty list, never a crash", () => {
  assert.deepEqual(vocabularyFrom(null, "test"), []);
  assert.deepEqual(vocabularyFrom("[]", "test"), []);
  assert.deepEqual(vocabularyFrom({ 0: goodWord() }, "test"), []);
});
