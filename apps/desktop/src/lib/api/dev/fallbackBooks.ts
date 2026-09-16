import type { BookMetadata, IndexSummary, SearchResult } from "../../types.ts";
import { FALLBACK_CHAPTERS, FALLBACK_META, fallbackSearchVault } from "./mockData.ts";

/** Browser stand-in for `get_library_books`. */
export function fetchLibraryBooks(): BookMetadata[] {
  return [
    {
      id: "sample",
      title: "Principles of Distributed Systems",
      author: "Leslie Lamport & Friends",
      chapter_count: 2,
      total_words: 458,
    },
    {
      id: "wealth-of-nations",
      title: "An Inquiry into the Nature and Causes of the Wealth of Nations",
      author: "Adam Smith",
      chapter_count: 37,
      total_words: 387438,
    },
  ];
}

/** Browser stand-in for `load_book_meta`, which gives the text of the book's `_meta.json`. */
export function loadBookMetaJson(): string {
  return JSON.stringify(FALLBACK_META);
}

/** Browser stand-in for `load_chapter`: a sample chapter for every chapter file. */
export function fetchChapter(chapterFile: string): string {
  return FALLBACK_CHAPTERS[chapterFile] || FALLBACK_CHAPTERS["ch-01.md"];
}

/** Browser stand-in for `load_notes`: browser storage, or sample notes. */
export function fetchNotes(bookId: string, notesFile: string): string {
  const stored = localStorage.getItem(`notes_${bookId}_${notesFile}`);
  if (stored) return stored;
  return `# Reflections: ${bookId}\n\n## Key Takeaways\n\n- Linearizability creates the illusion of single-copy atomic operations.\n- Vector clocks track partial ordering without global wall clocks.\n\n## Questions\n\n- How does Raft handle network partitions during leader election?\n`;
}

/** Browser stand-in for `save_notes`: browser storage. */
export function persistNotes(bookId: string, notesFile: string, content: string): void {
  localStorage.setItem(`notes_${bookId}_${notesFile}`, content);
}

/** Browser stand-in for `search_vault`: a plain text search of the sample chapters. */
export function searchVault(query: string): SearchResult[] {
  return fallbackSearchVault(query);
}

/** Browser stand-in for `index_vault`: the sample books never change, and every file can be read. */
export function indexVault(): IndexSummary {
  return { chapters_indexed: 2, paragraphs_indexed: 20, problems: [], renamed_books: [], duration_ms: 0 };
}

/** Browser stand-in for `get_vault_path`: no vault folder, so book images keep their relative paths. */
export function getVaultPath(): string {
  return "";
}
