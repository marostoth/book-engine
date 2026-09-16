import test from "node:test";
import assert from "node:assert/strict";
import type { IndexProblem, IndexSummary } from "./types.ts";
import { updateSearch } from "./searchIndex.ts";

/**
 * SI-02: the index reads each book on its own, so a broken file never stops the other books. The files that it could
 * not read show in the error bar, with the name of the file and the reason. The app updates search when it opens and
 * on "Rescan library", and both go through `updateSearch`.
 */

function summary(problems: IndexProblem[] = []): IndexSummary {
  return { chapters_indexed: 3, paragraphs_indexed: 120, problems, duration_ms: 40 };
}

/** The error bar: what failed, and the detail under it. */
function fakeErrorBar() {
  const errors: { action: string; detail: string }[] = [];
  return {
    errors,
    reportError: (action: string, error: unknown) => {
      errors.push({ action, detail: String(error) });
    },
  };
}

const damagedMeta: IndexProblem = {
  file: "books/wealth-of-nations/_meta.json",
  reason: "is not valid JSON (EOF while parsing a list at line 1 column 53)",
};
const oldCodePage: IndexProblem = { file: "books/hume/ch-04.md", reason: "is not UTF-8 text" };

test("a file that search could not read shows in the error bar, with its name and the reason", async () => {
  const bar = fakeErrorBar();

  const result = await updateSearch(async () => summary([damagedMeta]), bar.reportError);

  assert.deepEqual(bar.errors, [
    {
      action: "Search could not read 1 file, so search results from it can be old or missing.",
      detail: "books/wealth-of-nations/_meta.json is not valid JSON (EOF while parsing a list at line 1 column 53)",
    },
  ]);
  assert.deepEqual(result, summary([damagedMeta]), "the other books were still indexed");
});

test("files that search could not read share one line in the error bar", async () => {
  const bar = fakeErrorBar();

  await updateSearch(async () => summary([damagedMeta, oldCodePage]), bar.reportError);

  assert.deepEqual(bar.errors, [
    {
      action: "Search could not read 2 files, so search results from them can be old or missing.",
      detail:
        "books/wealth-of-nations/_meta.json is not valid JSON (EOF while parsing a list at line 1 column 53); " +
        "books/hume/ch-04.md is not UTF-8 text",
    },
  ]);
});

test("search that read every file shows nothing in the error bar", async () => {
  const bar = fakeErrorBar();

  const result = await updateSearch(async () => summary(), bar.reportError);

  assert.deepEqual(bar.errors, []);
  assert.deepEqual(result, summary());
});

test("search that could not be updated shows in the error bar", async () => {
  const bar = fakeErrorBar();

  const result = await updateSearch(async () => {
    throw "Failed to index vault: database is locked";
  }, bar.reportError);

  assert.deepEqual(bar.errors, [
    {
      action: "Search was not updated, so a new book may not show in search results.",
      detail: "Failed to index vault: database is locked",
    },
  ]);
  assert.equal(result, null);
});
