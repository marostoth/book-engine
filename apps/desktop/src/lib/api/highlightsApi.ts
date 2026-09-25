import type { HighlightItem } from "../types.ts";
import { highlightsFrom } from "../backendShapes.ts";
import { callBackend } from "./clientBase.ts";

/**
 * The saved highlights of a chapter, from `vault/notes/<book-id>/<chapter>-highlights.json`.
 * A chapter that still keeps them in the old notes comment is moved over by the backend.
 *
 * Every entry is checked. One that cannot be read rejects the list, because the next highlight saves the list on
 * screen over the file and would erase an entry dropped here (TL-14).
 */
export async function getChapterHighlights(bookId: string, chapterFile: string): Promise<HighlightItem[]> {
  const answer = await callBackend<unknown>(
    "get_chapter_highlights",
    { bookId, chapterFile },
    (dev) => dev.getChapterHighlights(bookId, chapterFile)
  );
  return highlightsFrom(answer, `The saved highlights of ${chapterFile}`);
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
