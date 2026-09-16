/** The notes file a text belongs to. */
export interface NotesTarget {
  bookId: string;
  notesFile: string;
}

/** Saves the chapter notes shortly after the reader stops typing. */
export interface NotesAutosave {
  /** Holds `text` for `target` and saves it when the typing stops. */
  change(target: NotesTarget, text: string): void;
  /** Saves what is waiting right now. The notes pane calls it when the chapter closes. */
  flush(): void;
  /** True while a text is waiting to be saved. */
  isPending(): boolean;
}

/**
 * Autosave for the chapter notes.
 *
 * A keystroke waits `delayMs` for the next one, so fast typing makes one save, not one per letter.
 * The text is held together with the notes file it was typed in, and `flush` saves it into that file
 * even when the reader has already left the chapter. Waiting for the timer instead lost the last words
 * when the app closed, and the notes pane used to keep its text across a chapter change, so a save could
 * put one chapter's notes into another chapter's file (DS-07).
 */
export function createNotesAutosave(delayMs: number, save: (target: NotesTarget, text: string) => void): NotesAutosave {
  let pending: { target: NotesTarget; text: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const saveNow = () => {
    timer = null;
    const due = pending;
    pending = null;
    if (due) save(due.target, due.text);
  };

  return {
    change(target, text) {
      pending = { target, text };
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(saveNow, delayMs);
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      saveNow();
    },
    isPending() {
      return pending !== null;
    },
  };
}
