/**
 * Says that a word was saved, so a screen showing the saved words can load them again (RD-10).
 *
 * WHY THIS IS NOT A PROP. `LexiconPopover` used to take an `onSavedVocabulary` callback and nothing ever
 * passed one, so a saved word never reached any screen. Passing one down means `App.tsx` gives it to `Reader`
 * and `Reader` gives it to the popover, and `ReaderProps` is held at 21 props by
 * `tests/test_frontend_stays_tidy.py`: that number may go down, never up. Prop drilling through `App.tsx` is
 * what RD-09 found, so a 22nd prop to carry one word from a popover to a drawer is the same fault again.
 *
 * So the popover says a word was saved and whoever cares listens. Neither `App.tsx` nor `Reader` learns
 * anything about vocabulary.
 */

type Listener = (bookId: string) => void;

const listeners = new Set<Listener>();

/** Listens for a saved word. Gives back the function that stops listening. */
export function onVocabularySaved(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tells every listener that a word of this book was saved. */
export function vocabularyWasSaved(bookId: string): void {
  for (const listener of [...listeners]) {
    listener(bookId);
  }
}
