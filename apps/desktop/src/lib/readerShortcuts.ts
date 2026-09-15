/**
 * Reader keyboard shortcuts. Two window keydown listeners read keys: the App listener (App.tsx), which is
 * always on, and the elementary canvas listener (useElementaryMechanics.ts), which is on while the Reader
 * shows. Each shortcut belongs to one listener, so one key press runs it once.
 */

/** The parts of a keydown event that choose a shortcut. */
export interface ShortcutKey {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** The key went to an input, a textarea, or an editable element, where it types text. */
  inTextEntry: boolean;
}

export type AppShortcut = "search" | "togglePacer" | "guide";
export type ElementaryCanvasShortcut = "slowerPacer" | "fasterPacer";

/**
 * Shortcuts of the App listener. Ctrl+K or Cmd+K (search) works everywhere. Alt+P (pacer) and ? or F1
 * (Field Guide) do nothing in text entry. Alt+P has no other handler: App opens the elementary level when
 * the pacer starts from another level.
 */
export function appShortcut(key: ShortcutKey): AppShortcut | null {
  if ((key.ctrlKey || key.metaKey) && key.key.toLowerCase() === "k") return "search";
  if (key.inTextEntry) return null;
  if (key.altKey && key.key.toLowerCase() === "p") return "togglePacer";
  if (key.key === "?" || key.key === "F1") return "guide";
  return null;
}

/** Shortcuts of the elementary canvas listener: [ and ] change the pacer speed, only in the elementary level. */
export function elementaryCanvasShortcut(key: ShortcutKey, level: string): ElementaryCanvasShortcut | null {
  if (key.inTextEntry || level !== "elementary") return null;
  if (key.key === "[") return "slowerPacer";
  if (key.key === "]") return "fasterPacer";
  return null;
}

/** Reads a keydown event for `appShortcut` and `elementaryCanvasShortcut`. */
export function shortcutKey(event: KeyboardEvent): ShortcutKey {
  const target = event.target as HTMLElement | null;
  return {
    key: event.key,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    inTextEntry: target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable === true,
  };
}
