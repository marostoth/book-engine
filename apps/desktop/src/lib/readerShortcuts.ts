/**
 * Reader keyboard shortcuts. Four window keydown listeners read keys: the App listener (App.tsx), which is
 * always on, the elementary canvas listener (useElementaryMechanics.ts), which is on while the Reader shows,
 * the dip stream listener (DipStream.tsx), which is on while the Dip Sampler shows, and the pacer listener
 * (usePacerDrag.ts), which is on while the pacer runs with keyboard scrubbing. Each shortcut belongs to one
 * listener, so one key press runs it once.
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
export type PacerShortcut = "lineUp" | "lineDown" | "chunkBack" | "chunkForward";

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

/**
 * Shortcuts of the pacer listener: the arrows step the running pacer by a line or by a few words. An element that
 * answers the arrows itself keeps them, and so does anything in an open dialog, which the pacer is behind. The
 * pacer used to take them from a select, from the tabs of the reading guide and from every dialog. A plain button
 * answers no arrow, so the pacer still steps after its Start button is clicked. Ctrl, Cmd or Alt is another shortcut.
 */
export function pacerShortcut(key: ShortcutKey, focusKeepsTheArrows: boolean): PacerShortcut | null {
  if (focusKeepsTheArrows || key.inTextEntry || key.ctrlKey || key.metaKey || key.altKey) return null;
  const steps: Record<string, PacerShortcut> = {
    ArrowUp: "lineUp",
    ArrowDown: "lineDown",
    ArrowLeft: "chunkBack",
    ArrowRight: "chunkForward",
  };
  return steps[key.key] ?? null;
}

/** The roles whose elements move by the arrows: a tab set, a list, a menu, a slider, a grid, a tree. */
const MOVES_BY_ARROWS = new Set([
  "tab", "tablist", "listbox", "option", "menu", "menubar", "menuitem", "menuitemcheckbox", "menuitemradio",
  "radio", "radiogroup", "slider", "spinbutton", "combobox", "grid", "gridcell", "tree", "treeitem",
]);

/** The element uses the arrow keys itself: a field moves its caret, a select its choice, a tab to the next tab. */
export function answersArrows(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement || target.isContentEditable) return true;
  if (["", "true", "plaintext-only"].includes(target.getAttribute("contenteditable") ?? "false")) return true;
  return MOVES_BY_ARROWS.has(target.getAttribute("role") ?? "");
}

/** Reads a keydown event for the four listeners. */
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
