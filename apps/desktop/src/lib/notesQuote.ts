import type { NotesAutosave, NotesTarget } from "./notesAutosave";

/** The chapter notes: still loading, loaded, or failed to load. Only loaded notes can be edited and saved. */
export type NotesLoadState = "loading" | "ready" | "failed";

/** A quote the reader sent from the selection menu to their chapter notes. */
export interface InsertedQuote {
  quote: string;
  anchorId?: string;
}

/** The parts of the notes pane a quote needs. */
export interface QuotePane {
  /** Shows the notes with the quote in them. */
  show(notes: string): void;
  /** Tells the reader why the quote was not added. */
  refuse(message: string, detail: string): void;
}

/**
 * The block a quote adds to the chapter notes: a blank line, the quote, its paragraph anchor when it has
 * one, and an empty line for the reader's own thought.
 */
export function quoteBlock(quote: InsertedQuote): string {
  const anchor = quote.anchorId ? ` (#${quote.anchorId})` : "";
  return `\n\n> "${quote.quote}"${anchor}\n\n- Reflection: \n`;
}

/**
 * Adds a quote the reader sent to the end of their chapter notes and saves them at once. A quote is a
 * click, not typing, so it does not wait for the typing pause. The quote used to change the text on screen
 * only: it reached the vault after the next keystroke, and without one it was lost at the next chapter
 * change (DS-08).
 *
 * A quote waits while the notes are read from the disk, because adding it to text that is not the file's
 * would save that text over the file. Nothing happens on screen either, so the notes that arrive cannot
 * wipe the quote; the pane asks again when they are there. Notes that failed to load never take a quote,
 * because the pane is locked. The reader is told instead.
 */
export function addQuoteToNotes(
  loadState: NotesLoadState,
  notes: string,
  quote: InsertedQuote | null,
  target: NotesTarget,
  autosave: NotesAutosave,
  pane: QuotePane
): void {
  if (!quote || loadState === "loading") return;
  if (loadState === "failed") {
    pane.refuse(
      "The quote was not added to your notes.",
      "Your notes for this chapter did not load, and adding to text that is not in the file would overwrite it."
    );
    return;
  }
  const withQuote = notes + quoteBlock(quote);
  pane.show(withQuote);
  autosave.change(target, withQuote);
  autosave.flush();
}
