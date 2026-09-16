import type { Bookmark, LastBookmark } from "../readingPlace.ts";
import { callBackend } from "./clientBase.ts";

/** Where the reader stopped in a book, from `vault/notes/<book-id>/bookmark.json`, or null when they have not read it (DS-11). */
export async function fetchBookmark(bookId: string): Promise<Bookmark | null> {
  return callBackend<Bookmark | null>("get_bookmark", { bookId }, (dev) => dev.fetchBookmark(bookId));
}

/** Saves where the reader is in a book: the chapter, and the paragraph in the middle of the screen. */
export async function persistBookmark(bookId: string, chapterFile: string, anchor?: string): Promise<void> {
  return callBackend<void>("save_bookmark", { bookId, chapterFile, anchor: anchor ?? null }, (dev) =>
    dev.persistBookmark(bookId, chapterFile, anchor)
  );
}

/** The newest bookmark of all books, which names the book the app opens with, or null. */
export async function fetchLastBookmark(): Promise<LastBookmark | null> {
  return callBackend<LastBookmark | null>("get_last_bookmark", undefined, (dev) => dev.fetchLastBookmark());
}
