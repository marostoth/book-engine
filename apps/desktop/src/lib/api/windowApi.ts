import { callBackend, isTauri } from "./clientBase.ts";

/**
 * The event the window sends the page when the reader closes it.
 *
 * `src-tauri/src/lib.rs` sends it and waits. The same name is written there, and `lib/savingBeforeClose.test.tsx`
 * checks that the two are still the same word.
 */
export const SAVE_BEFORE_CLOSE_EVENT = "save-before-close";

/**
 * Hears the window asking the page to save what is waiting.
 *
 * Outside the app there is no window to ask, so nothing is heard and nothing breaks: `npm run dev` in a browser
 * has no close to hold back.
 */
export async function listenForWindowClose(onClosing: () => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen(SAVE_BEFORE_CLOSE_EVENT, () => onClosing());
}

/** Tells the window that everything the reader typed is saved, and it can close now. */
export async function letTheWindowClose(): Promise<void> {
  return callBackend<void>("let_the_window_close", undefined, () => undefined);
}
