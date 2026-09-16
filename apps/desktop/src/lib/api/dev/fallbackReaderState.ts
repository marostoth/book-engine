import type { ReaderPreferences } from "../../types";
import type { Bookmark, LastBookmark } from "../../readingPlace";
import { PREFERENCES_STORAGE_KEY } from "../../preferences";

/** Browser storage key prefix for the bookmark of one book. */
const BOOKMARK_KEY = "bookmark_";

/** Browser stand-in for `get_preferences`. */
export function fetchPreferences(): Record<string, unknown> | null {
  const saved = localStorage.getItem(PREFERENCES_STORAGE_KEY);
  return saved ? (JSON.parse(saved) as Record<string, unknown>) : null;
}

/** Browser stand-in for `save_preferences`. */
export function persistPreferences(preferences: ReaderPreferences): void {
  localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
}

/** Browser stand-in for `get_bookmark`. */
export function fetchBookmark(bookId: string): Bookmark | null {
  const saved = localStorage.getItem(BOOKMARK_KEY + bookId);
  return saved ? (JSON.parse(saved) as Bookmark) : null;
}

/** Browser stand-in for `save_bookmark`. */
export function persistBookmark(bookId: string, chapterFile: string, anchor?: string): void {
  const bookmark: Bookmark = { chapterFile, savedAt: new Date().toISOString(), ...(anchor ? { anchor } : {}) };
  localStorage.setItem(BOOKMARK_KEY + bookId, JSON.stringify(bookmark));
}

/** Browser stand-in for `get_last_bookmark`. */
export function fetchLastBookmark(): LastBookmark | null {
  let newest: LastBookmark | null = null;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(BOOKMARK_KEY)) continue;
    const bookId = key.slice(BOOKMARK_KEY.length);
    const bookmark = fetchBookmark(bookId);
    if (bookmark && (!newest || (bookmark.savedAt ?? "") > (newest.savedAt ?? ""))) {
      newest = { ...bookmark, bookId };
    }
  }
  return newest;
}
