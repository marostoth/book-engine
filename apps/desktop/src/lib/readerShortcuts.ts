/**
 * Reader keyboard shortcuts. Three window keydown listeners read keys: the App listener (App.tsx), which is
 * always on, the elementary canvas listener (useElementaryMechanics.ts), which is on while the Reader shows,
 * and the dip stream listener (DipStream.tsx), which is on while the Dip Sampler shows. Each shortcut belongs
 * to one listener, so one key press runs it once.
 */

/** The parts of a keydown event that choose a shortcut. */
export interface ShortcutKey {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  /** The key went to an input, a textarea, or an editable element, where it types text. */
  inTextEntry: boolean;
}

export type AppShortcut = "search" | "togglePacer" | "guide";
export type ElementaryCanvasShortcut = "slowerPacer" | "fasterPacer";
export type DipStreamShortcut = "pageDown" | "pageUp" | "stepDown" | "stepUp";

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

/**
 * Shortcuts of the dip stream listener: Space and Shift+Space page the stream, J and K step it. They are the
 * stream's only while the focus is on the stream or on nothing. A focused button is pressed by Space, a select
 * picks by letter, and a dialog holds the focus inside itself, so any control that holds the focus keeps every
 * key (RD-13). A key held with Ctrl, Cmd or Alt is another shortcut: Ctrl+K is search.
 */
export function dipStreamShortcut(key: ShortcutKey, focusIsOnTheStream: boolean): DipStreamShortcut | null {
  if (!focusIsOnTheStream || key.ctrlKey || key.metaKey || key.altKey) return null;
  if (key.key === " ") return key.shiftKey ? "pageUp" : "pageDown";
  if (key.key.toLowerCase() === "j") return "stepDown";
  if (key.key.toLowerCase() === "k") return "stepUp";
  return null;
}

/** Reads a keydown event for the three listeners. */
export function shortcutKey(event: KeyboardEvent): ShortcutKey {
  const target = event.target as HTMLElement | null;
  return {
    key: event.key,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    inTextEntry: target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable === true,
  };
}
