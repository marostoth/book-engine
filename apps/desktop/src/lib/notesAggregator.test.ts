import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BookMeta } from "./types.ts";
import { aggregateBookNotes, notesWrittenIn } from "./notesAggregator.ts";

/**
 * What the notes drawer shows of the reader's own notes, next to the old highlights comment (RD-18).
 *
 * The cases are in `notesDrawerCases.json`, which `src-tauri/src/vault/notes_drawer_tests.rs` reads too, so browser
 * dev mode and the app answer the same cases. Each case is a whole notes file and the notes it holds, as
 * `[heading, text, anchor]`.
 */

interface Case {
  case: string;
  notes: string;
  shows: [string, string, string | null][];
}

const { cases } = JSON.parse(readFileSync(new URL("./notesDrawerCases.json", import.meta.url), "utf8")) as {
  cases: Case[];
};

const BOOK: BookMeta = {
  book_id: "sample",
  title: "Sample",
  author: "Adam Smith",
  language: "en",
  total_words: 0,
  total_chapters: 1,
  toc: [],
  spine: [],
};

function shown(notes: string): [string, string, string | null][] {
  return notesWrittenIn(notes).map((note) => [note.heading, note.text, note.anchor ?? null]);
}

test("the cases file holds every case", () => {
  assert.ok(cases.length >= 7, "the cases file lost cases, so these tests prove less");
});

test("the drawer shows the notes the reader wrote in every case", () => {
  const wrong = cases
    .filter((each) => JSON.stringify(shown(each.notes)) !== JSON.stringify(each.shows))
    .map((each) => `${each.case}:\n  shows ${JSON.stringify(shown(each.notes))}\n  wants ${JSON.stringify(each.shows)}`);
  assert.equal(wrong.join("\n"), "");
});

test("the whole drawer shows the highlight once and no JSON", () => {
  const withNoHeading = cases.find((each) => each.case.startsWith("an old comment with no Highlights heading"));
  assert.ok(withNoHeading, "the case of a comment with no heading is gone");

  const entries = aggregateBookNotes(BOOK, [
    { file_name: "ch-01-notes.md", chapter_file: "ch-01.md", content: withNoHeading.notes },
  ]);

  const highlights = entries.filter((entry) => entry.type === "highlight").map((entry) => entry.text);
  assert.equal(highlights.length, 1, `one highlight is saved: ${JSON.stringify(highlights)}`);
  assert.ok(highlights[0].includes("-->"), "the highlight keeps its whole words");

  const notes = entries.filter((entry) => entry.type === "note").map((entry) => entry.text);
  assert.deepEqual(notes, ["Division raises output"]);
});
