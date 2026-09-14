import { DictionaryEntry, VocabularyEntry } from "../types";
import { isTauri, tauriInvoke } from "./clientBase";
import {
  sanitizeLexiconWord,
  fallbackLookupDictionaryTerm,
  fallbackSaveVocabulary,
} from "./fallbackLexicon";

export { sanitizeLexiconWord } from "./fallbackLexicon";

/**
 * Queries the offline dictionary cache for a word definition, pronunciation,
 * part of speech, and etymology. Automatically cleans punctuation and whitespace.
 */
export async function lookupDictionaryTerm(word: string): Promise<DictionaryEntry | null> {
  const cleanWord = sanitizeLexiconWord(word);
  if (!cleanWord) return null;

  if (isTauri) {
    try {
      const result = await tauriInvoke<DictionaryEntry | null>("lookup_dictionary_term", {
        word: cleanWord,
      });
      if (result) return result;
    } catch (e) {
      console.warn("Tauri lookup_dictionary_term failed, falling back to mock:", e);
    }
  }

  return fallbackLookupDictionaryTerm(cleanWord);
}

/**
 * Persists a vocabulary entry to `vault/notes/<book-id>/vocabulary.json` via Tauri IPC.
 * In browser development mode, falls back to localStorage with deduplication.
 */
export async function saveBookVocabulary(bookId: string, entry: VocabularyEntry): Promise<void> {
  if (isTauri) {
    try {
      await tauriInvoke<void>("save_book_vocabulary", { bookId, entry });
      return;
    } catch (e) {
      console.warn("Tauri save_book_vocabulary failed, falling back to mock:", e);
    }
  }

  fallbackSaveVocabulary(bookId, entry);
}
