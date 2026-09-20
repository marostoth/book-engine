/**
 * Saving what the reader typed when the window closes.
 *
 * Every saver in the app waits a moment before it writes, so fast typing makes one save and not one per letter.
 * Each of them saved what was waiting in a React unmount cleanup, and that cleanup never runs when the window
 * closes: the webview is destroyed, not unmounted. So a reader who finished a sentence and closed the window lost
 * it, however long the app had been open (DS-17).
 *
 * The window asks first now. `on_window_event` in `src-tauri/src/lib.rs` holds the close back, sends the page one
 * event, and closes when the page answers or when the wait runs out. Every saver adds itself here, `saveAll` runs
 * all of them and waits for the vault to answer, and only then is the window told it can close.
 *
 * A saver gives back a promise, and that is the point: a saver that starts a save and does not wait for it is the
 * same loss with more steps, because the webview is gone before the vault answers.
 */

/**
 * Saves what is waiting, now.
 *
 * Give back the promise of the save. `saveAll` waits for it, so the window stays open until the vault has answered.
 * A saver that has nothing waiting gives back anything else, and costs nothing.
 */
export type SaveWhatIsWaiting = () => unknown;

/** The savers that run before the window closes. */
export interface SaversBeforeClose {
  /** Adds a saver, and gives back the function that takes it out again. */
  add(save: SaveWhatIsWaiting): () => void;
  /** Runs every saver and waits for all of them. One that fails does not stop the others. */
  saveAll(): Promise<void>;
  /** How many savers are waiting. A test reads it; nothing in the app does. */
  count(): number;
}

/**
 * Makes an empty set of savers.
 *
 * `saveAll` never fails. A saver that throws, and a save the vault refuses, are both handled where the save is
 * made, and a failure must not stop the other savers or keep the window open for ever.
 */
export function createSaversBeforeClose(): SaversBeforeClose {
  const savers = new Set<SaveWhatIsWaiting>();

  return {
    add(save) {
      savers.add(save);
      return () => {
        savers.delete(save);
      };
    },
    async saveAll() {
      // A copy of the set, because a saver may add or take out a saver while it runs.
      const running = [...savers].map((save) => {
        try {
          return Promise.resolve(save());
        } catch (err) {
          return Promise.reject(err);
        }
      });
      await Promise.allSettled(running);
    },
    count() {
      return savers.size;
    },
  };
}

/**
 * The savers of the reader window.
 *
 * One window, one set. `hooks/useSaveBeforeClose.ts` is how a part of the app adds itself, and `App.tsx` starts the
 * listener that runs them.
 */
export const saversBeforeClose = createSaversBeforeClose();

/** Tells the reader that the window could not be closed. */
type ReportError = (action: string, cause: unknown) => void;

/**
 * Saves everything that is waiting when the window asks, and then lets the window close.
 *
 * The order is the whole point: the window is told last, after the vault has answered. It is told even when a save
 * failed, because a reader who cannot close the window is worse off than a reader who lost one sentence, and the
 * failure is already shown in the error bar by the saver itself. The window closes on its own if this answer never
 * comes, so a page that hangs cannot lock the app open.
 */
export async function saveWhenTheWindowCloses(
  listen: (onClosing: () => void) => Promise<() => void>,
  savers: SaversBeforeClose,
  letTheWindowClose: () => Promise<void>,
  reportError: ReportError
): Promise<() => void> {
  return listen(() => {
    void (async () => {
      await savers.saveAll();
      try {
        await letTheWindowClose();
      } catch (err) {
        reportError("The window did not close. Your work is saved; close it again.", err);
      }
    })();
  });
}
