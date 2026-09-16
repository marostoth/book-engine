import { HighlightItem } from "../../types";
import { parseHighlightsFromNotes } from "../../highlights";
import { getFallbackBookNoteFiles } from "./fallbackNotes";

/** Browser storage key for the highlights of one chapter. */
function key(bookId: string, chapterFile: string): string {
  return `highlights_${bookId}_${chapterFile}`;
}

/** Browser stand-in for `get_chapter_highlights`, seeded from the sample notes comment. */
export function getChapterHighlights(bookId: string, chapterFile: string): HighlightItem[] {
  const saved = localStorage.getItem(key(bookId, chapterFile));
  if (saved) {
    return JSON.parse(saved) as HighlightItem[];
  }
  const notes = getFallbackBookNoteFiles(bookId).find((file) => file.chapter_file === chapterFile);
  return notes ? parseHighlightsFromNotes(notes.content) : [];
}

/** Browser stand-in for `save_chapter_highlights`. */
export function saveChapterHighlights(
  bookId: string,
  chapterFile: string,
  highlights: HighlightItem[]
): void {
  localStorage.setItem(key(bookId, chapterFile), JSON.stringify(highlights));
}
