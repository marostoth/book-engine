import type { IndexProblem, IndexSummary } from "./types.ts";

/**
 * Search: the app brings the search index up to date when it opens, and again on "Rescan library" (DS-13).
 *
 * The index reads each book on its own, so a broken file never stops the other books (SI-02). Before this, one damaged
 * `_meta.json` or one chapter that was not UTF-8 text stopped the index for every book, and the error went only to the
 * console, without the name of the file.
 */

/** What failed, when search could not be updated at all. */
export const SEARCH_NOT_UPDATED = "Search was not updated, so a new book may not show in search results.";

/**
 * Updates the search index. The files that the index could not read share one line in the error bar, each with its
 * reason. Gives what the index did, or null when search was not updated.
 */
export async function updateSearch(
  indexVault: () => Promise<IndexSummary>,
  reportError: (action: string, error: unknown) => void
): Promise<IndexSummary | null> {
  let summary: IndexSummary;
  try {
    summary = await indexVault();
  } catch (error) {
    reportError(SEARCH_NOT_UPDATED, error);
    return null;
  }

  const count = summary.problems.length;
  if (count > 0) {
    reportError(
      count === 1
        ? "Search could not read 1 file, so search results from it can be old or missing."
        : `Search could not read ${count} files, so search results from them can be old or missing.`,
      summary.problems.map(describeProblem).join("; ")
    );
  }
  return summary;
}

/** A file and its reason, such as "books/hume/ch-04.md is not UTF-8 text". */
function describeProblem(problem: IndexProblem): string {
  return `${problem.file} ${problem.reason}`;
}
