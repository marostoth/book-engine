import type { BookMetadata } from "./types.ts";

/**
 * "Rescan library": books you import while the app is open.
 *
 * The app reads the library and builds the search index once, when it starts. So a book imported while the app was
 * open stayed out of the book list and out of search until the next start (DS-13). A rescan reads the library again
 * and updates the search index.
 */

/** The backend calls that a rescan makes. */
export interface LibraryBackend {
  fetchLibraryBooks(): Promise<BookMetadata[]>;
  indexVault(): Promise<{ chapters_indexed: number; paragraphs_indexed: number }>;
}

/** What one rescan found. */
export interface LibraryRescan {
  /** The books in the vault now, or null when the library could not be read. */
  books: BookMetadata[] | null;
  /** The titles of the books that the list did not show before the rescan. */
  newTitles: string[];
  /** False when search could not be updated. */
  searchUpdated: boolean;
}

/** The "Rescan library" button of the book list: what it runs and what it shows. */
export interface LibraryRescanControl {
  /** Starts a rescan. */
  run: () => void;
  /** True while a rescan runs. */
  running: boolean;
  /** What the last rescan found, or "" before the first one. */
  note: string;
}

/**
 * Reads the library again and shows it with `showBooks`, then updates search. The list does not wait for search, which
 * can take a while in a large vault. A failure goes to `reportError`, and the other half still runs. A library that
 * could not be read leaves the list on screen as it is.
 */
export async function rescanLibrary(
  backend: LibraryBackend,
  shownBooks: readonly BookMetadata[],
  showBooks: (books: BookMetadata[]) => void,
  reportError: (action: string, error: unknown) => void
): Promise<LibraryRescan> {
  let books: BookMetadata[] | null = null;
  try {
    books = await backend.fetchLibraryBooks();
    showBooks(books);
  } catch (error) {
    reportError("Could not read your library again, so the book list did not change.", error);
  }

  let searchUpdated = false;
  try {
    await backend.indexVault();
    searchUpdated = true;
  } catch (error) {
    reportError("Search was not updated, so a new book may not show in search results.", error);
  }

  const shownIds = new Set(shownBooks.map((book) => book.id));
  const newTitles = (books ?? []).filter((book) => !shownIds.has(book.id)).map((book) => book.title);
  return { books, newTitles, searchUpdated };
}

/**
 * One short line for the book list: the new books, and that search is updated. A part that failed is left out.
 *
 * The line does not count chapters. The index reads a chapter with no paragraphs again on every run, such as a part
 * title, so a count would name a chapter when nothing changed.
 */
export function rescanSummary(result: LibraryRescan): string {
  const parts: string[] = [];
  if (result.books) {
    const count = result.newTitles.length;
    parts.push(
      count === 0 ? "No new books." : `Found ${count} new ${count === 1 ? "book" : "books"}: ${result.newTitles.join(", ")}.`
    );
  }
  if (result.searchUpdated) {
    parts.push("Search updated.");
  }
  return parts.join(" ");
}
