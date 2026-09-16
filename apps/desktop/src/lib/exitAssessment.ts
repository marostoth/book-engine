import type { ExitAssessmentPayload } from "./types.ts";
import { createLoadGuard } from "./readerLoads.ts";

/**
 * The reader's exit assessment of the open book (DS-09).
 *
 * The assessment is read from `vault/notes/<book-id>/inspectional.json` when a book opens, and a saved assessment shows
 * at once. It used to come with the book file (`_meta.json`), which an import writes again, and a save changed the
 * book object in place with no state update, so "Inspectional Assessment Completed" showed only after a reload.
 */

/** What the app knows about the exit assessment of one book. */
export type ExitAssessmentState =
  | { bookId: string; status: "loading" }
  | { bookId: string; status: "loaded"; assessment: ExitAssessmentPayload | null }
  | { bookId: string; status: "unreadable" };

/** The two vault calls the exit assessment needs. */
export interface ExitAssessmentStore {
  getInspectionalExitAssessment(bookId: string): Promise<ExitAssessmentPayload | null>;
  saveInspectionalExitAssessment(bookId: string, assessment: ExitAssessmentPayload): Promise<void>;
}

export interface ExitAssessmentKeeper {
  /** A book opened, or no book is open (`""`): reads its assessment. Only the answer for the newest book shows. */
  bookOpened(bookId: string): Promise<void>;
  /** Saves the assessment of a book and shows it. Rejects when it was not saved, so the form keeps the answers. */
  save(bookId: string, assessment: ExitAssessmentPayload): Promise<void>;
}

/** Why a save is refused when the saved assessment could not be read. */
export const UNREADABLE_ASSESSMENT =
  "The saved exit assessment of this book could not be read, and a save would write over it.";

/** Keeps the exit assessment of the open book, and never saves over an assessment that could not be read. */
export function createExitAssessmentKeeper(
  store: ExitAssessmentStore,
  show: (state: ExitAssessmentState | null) => void,
  reportError: (action: string, err: unknown) => void
): ExitAssessmentKeeper {
  const loads = createLoadGuard();
  let current: ExitAssessmentState | null = null;
  let reading: Promise<void> = Promise.resolve();

  const set = (state: ExitAssessmentState | null) => {
    current = state;
    show(state);
  };
  /** The state of a book, or null when another book is open. */
  const stateOf = (bookId: string): ExitAssessmentState | null => (current?.bookId === bookId ? current : null);

  return {
    bookOpened(bookId) {
      const isNewest = loads.start();
      if (!bookId) {
        set(null);
        reading = Promise.resolve();
        return reading;
      }
      set({ bookId, status: "loading" });
      reading = store.getInspectionalExitAssessment(bookId).then(
        (assessment) => {
          if (isNewest()) set({ bookId, status: "loaded", assessment });
        },
        (err) => {
          if (!isNewest()) return;
          set({ bookId, status: "unreadable" });
          reportError("Your exit assessment of this book could not be read, so a new one is not saved over it.", err);
        }
      );
      return reading;
    },

    async save(bookId, assessment) {
      if (stateOf(bookId)?.status === "loading") {
        await reading;
      }
      const state = stateOf(bookId);
      if (!state) {
        throw new Error("Another book was opened before the exit assessment was saved.");
      }
      if (state.status !== "loaded") {
        throw new Error(UNREADABLE_ASSESSMENT);
      }
      await store.saveInspectionalExitAssessment(bookId, assessment);
      if (stateOf(bookId)) {
        set({ bookId, status: "loaded", assessment });
      }
    },
  };
}
