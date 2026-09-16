import type { IndexProblem, IndexSummary, RenamedBook } from "./types.ts";

/**
 * Search: the app brings the search index up to date when it opens, and again on "Rescan library" (DS-13).
 *
 * The index reads each book on its own, so a broken file never stops the other books (SI-02). Before this, one damaged
 * `_meta.json` or one chapter that was not UTF-8 text stopped the index for every book, and the error went only to the
 * console, without the name of the file.
 *
 * The app knows a book by its folder name (LC-02). A renamed book folder opens as a new book, so the notes and study
 * progress under its old name do not show. The index run names such a folder, and the error bar says the name to give
 * it back.
 */

/** What failed, when search could not be updated at all. */
export const SEARCH_NOT_UPDATED = "Search was not updated, so a new book may not show in search results.";

/**
 * Updates the search index. The files that the index could not read share one line in the error bar, each with its
 * reason, and the renamed book folders share another. Gives what the index did, or null when search was not updated.
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

  const renamed = summary.renamed_books.length;
  if (renamed > 0) {
    reportError(
      renamed === 1
        ? "A book folder has a new name, so the app does not show its notes and study progress."
        : `${renamed} book folders have a new name, so the app does not show their notes and study progress.`,
      summary.renamed_books.map(describeRename).join("; ")
    );
  }
  return summary;
}

/** A file and its reason, such as "books/hume/ch-04.md is not UTF-8 text". */
function describeProblem(problem: IndexProblem): string {
  return `${problem.file} ${problem.reason}`;
}

/** A renamed book folder and the name to give it back, such as "books/smith: rename it back to wealth-of-nations". */
function describeRename(book: RenamedBook): string {
  return `books/${book.folder}: rename it back to ${book.old_name}`;
}
