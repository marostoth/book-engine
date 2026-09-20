/** The notes file a text belongs to. */
export interface NotesTarget {
  bookId: string;
  notesFile: string;
}

/** Saves the chapter notes shortly after the reader stops typing. */
export interface NotesAutosave {
  /** Holds `text` for `target` and saves it when the typing stops. */
  change(target: NotesTarget, text: string): void;
  /**
   * Saves what is waiting right now, and gives back that save.
   *
   * The notes pane calls it when the chapter closes, and the window calls it before it closes. The window waits
   * for what comes back: a save that was only started is lost with the webview (DS-17).
   */
  flush(): Promise<void>;
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
export function createNotesAutosave(delayMs: number, save: (target: NotesTarget, text: string) => unknown): NotesAutosave {
  let pending: { target: NotesTarget; text: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const saveNow = (): unknown => {
    timer = null;
    const due = pending;
    pending = null;
    return due ? save(due.target, due.text) : undefined;
  };

  return {
    change(target, text) {
      pending = { target, text };
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(saveNow, delayMs);
    },
    async flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      await saveNow();
    },
    isPending() {
      return pending !== null;
    },
  };
}
