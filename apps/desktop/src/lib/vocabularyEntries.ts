import type { AggregatedNoteItem, ChapterMeta, VocabularyEntry } from "./types.ts";

/**
 * Saved words become drawer entries, so the notes drawer groups, searches and jumps to them with the code it
 * already has for highlights and notes (RD-10).
 *
 * The word goes in `section_heading` and its meaning in `text`, because the drawer searches both. The chapter
 * title and the reading order come from the book's spine: a word carries only the file name of its chapter.
 */

/** The group for a word whose chapter this book does not have, or that was saved before the app kept one. */
export const NO_CHAPTER_TITLE = "Chapter not known";

/**
 * Sorts after every real chapter. A chapter order is a small count, so this is far past the last of them and
 * still a plain number, which keeps the drawer's own sort untouched.
 */
const NO_CHAPTER_ORDER = Number.MAX_SAFE_INTEGER;

export function vocabularyEntries(words: VocabularyEntry[], spine: ChapterMeta[]): AggregatedNoteItem[] {
  const chapters = new Map(spine.map((chapter) => [chapter.file_path, chapter]));

  // Newest first. A word saved by an older version has no time at all, and sorts last rather than being lost.
  const newestFirst = [...words].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));

  return newestFirst.map((saved) => {
    const chapter = chapters.get(saved.chapterFile);

    return {
      id: `word:${saved.word.trim().toLowerCase()}`,
      item_type: "word",
      chapter_file: saved.chapterFile,
      chapter_title: chapter ? chapter.title : NO_CHAPTER_TITLE,
      chapter_order: chapter ? chapter.order : NO_CHAPTER_ORDER,
      // An empty anchor stays empty. Never a made-up one such as `^p-001`, which names a paragraph the reader
      // never read (RD-04).
      anchor: saved.anchor || null,
      text: saved.definition,
      color: null,
      section_heading: saved.word,
      created_at: saved.savedAt || null,
    };
  });
}
