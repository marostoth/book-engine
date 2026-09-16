import type { DictionaryEntry, VocabularyEntry } from "../types.ts";
import { callBackend } from "./clientBase.ts";

/** Cleans a word for the dictionary: trims it, removes non-letters at both ends, and makes it lowercase. */
export function sanitizeLexiconWord(word: string): string {
  return word.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "").toLowerCase();
}

/**
 * Queries the offline dictionary cache for a word definition, pronunciation,
 * part of speech, and etymology. Automatically cleans punctuation and whitespace.
 * Gives null for a word that the dictionary does not have.
 */
export async function lookupDictionaryTerm(word: string): Promise<DictionaryEntry | null> {
  const cleanWord = sanitizeLexiconWord(word);
  if (!cleanWord) return null;

  return callBackend<DictionaryEntry | null>("lookup_dictionary_term", { word: cleanWord }, (dev) =>
    dev.lookupDictionaryTerm(cleanWord)
  );
}

/**
 * Persists a vocabulary entry to `vault/notes/<book-id>/vocabulary.json` via Tauri IPC.
 * In the browser dev build, the stand-in keeps it in localStorage with deduplication.
 */
export async function saveBookVocabulary(bookId: string, entry: VocabularyEntry): Promise<void> {
  return callBackend<void>("save_book_vocabulary", { bookId, entry }, (dev) => dev.saveBookVocabulary(bookId, entry));
}
