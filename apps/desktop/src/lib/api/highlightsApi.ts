import type { HighlightItem } from "../types.ts";
import { callBackend } from "./clientBase.ts";

/**
 * The saved highlights of a chapter, from `vault/notes/<book-id>/<chapter>-highlights.json`.
 * A chapter that still keeps them in the old notes comment is moved over by the backend.
 */
export async function getChapterHighlights(bookId: string, chapterFile: string): Promise<HighlightItem[]> {
  return callBackend<HighlightItem[]>(
    "get_chapter_highlights",
    { bookId, chapterFile },
    (dev) => dev.getChapterHighlights(bookId, chapterFile)
  );
}

/**
 * Saves the highlights of a chapter. Only this file holds them, so a save of the chapter notes
 * can never erase a highlight, and this save never touches the notes (DS-05).
 */
export async function saveChapterHighlights(
  bookId: string,
  chapterFile: string,
  highlights: HighlightItem[]
): Promise<void> {
  return callBackend<void>(
    "save_chapter_highlights",
    { bookId, chapterFile, highlights },
    (dev) => dev.saveChapterHighlights(bookId, chapterFile, highlights)
  );
}
