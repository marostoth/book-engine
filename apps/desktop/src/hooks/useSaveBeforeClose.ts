import { useEffect, useRef } from "react";
import { saversBeforeClose, type SaveWhatIsWaiting } from "../lib/savingBeforeClose.ts";

/**
 * Saves what this part of the app is holding when the reader closes the window (DS-17).
 *
 * `save` may be a new function on every drawing. The newest one is kept in a ref and the saver itself is added once,
 * so a reader who types for an hour adds one saver, not one per keystroke. The ref is written in an effect and read
 * only when the window closes, which is long after any drawing.
 */
export function useSaveBeforeClose(save: SaveWhatIsWaiting): void {
  const latest = useRef(save);
  useEffect(() => {
    latest.current = save;
  }, [save]);
  useEffect(() => saversBeforeClose.add(() => latest.current()), []);
}
