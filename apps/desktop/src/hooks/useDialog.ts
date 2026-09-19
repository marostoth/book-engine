import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * One keyboard rule for every dialog of the app (RD-07).
 *
 * The app had 14 hand-built dialogs and 14 answers to the keyboard. Escape closed 6 of them; the chapter gate and the
 * 7 windows you type into ignored it. No dialog said `role="dialog"`, so a screen reader never announced one. No
 * dialog held the focus, so Tab walked out of the dialog and into the page behind it. Worse, 5 of the 6 that did
 * answer Escape listened on `window`, so a single Escape closed the notes drawer and the practice window together.
 *
 * What a dialog gets here:
 *
 * - **Escape closes it**, and only the one on top. Dialogs stack, and each key belongs to the last one opened.
 * - **Tab stays inside it.** Focus moves to the first control when it opens and back to the opener when it shuts.
 * - **A screen reader is told.** `role="dialog"`, `aria-modal`, and either the id of the heading or a plain name.
 * - **Typing is not thrown away.** With `protectTyping`, the first Escape after the reader types only warns; the
 *   dialog shows `askedToDiscard` and waits for a second Escape. Any other key clears the warning, because the
 *   reader is still working. The 7 form dialogs use this: none of them closes on a stray backdrop click either.
 *
 * A dialog keeps its own `onKeyDown` for its own keys (the lightbox zoom, the practice ratings). Those belong on the
 * panel, not on `window`: the focus is inside the panel, and a key must not reach a dialog that is not on top.
 */

/** The dialogs open right now, oldest first. Only the last one answers a key, so one Escape closes one dialog. */
const stack: string[] = [];

/**
 * True while any dialog is open.
 *
 * Something outside a dialog must not answer a key that belongs to the dialog on top. The reader's selection menu
 * asks this before it takes Escape or Tab for itself.
 */
export function aDialogIsOpen(): boolean {
  return stack.length > 0;
}

/** What a reader can reach with Tab. A negative tabindex and a disabled control are not among them. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * The controls inside a panel, in the order Tab walks them.
 *
 * Nothing here asks whether a control is on screen. A dialog panel is laid out with `position: fixed`, so its
 * `offsetParent` is null in a real browser as well as in a test, and a check for that would find no controls at all.
 */
function focusableInside(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true"
  );
}

/** Holds Tab inside the panel: it wraps at both ends, and it comes back in when the focus has been lost outside. */
function keepFocusInside(event: KeyboardEvent, panel: HTMLElement | null): void {
  if (!panel) return;
  const reachable = focusableInside(panel);
  if (reachable.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = reachable[0];
  const last = reachable[reachable.length - 1];
  const at = document.activeElement;
  if (at instanceof HTMLElement && panel.contains(at)) {
    if (!event.shiftKey && at === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && at === first) {
      event.preventDefault();
      last.focus();
    }
    return;
  }
  event.preventDefault();
  (event.shiftKey ? last : first).focus();
}

interface DialogOptions {
  isOpen: boolean;
  onClose: () => void;
  /**
   * True for a dialog the reader types into. The first Escape after they type raises `askedToDiscard` instead of
   * closing, so one stray key cannot throw away a half-written note.
   */
  protectTyping?: boolean;
  /** A name for a dialog with no heading of its own, such as the search window. */
  label?: string;
}

/** What the panel of a dialog must carry. Spread it on the panel element, never on the backdrop. */
export interface DialogPanelProps {
  ref: React.Ref<HTMLDivElement>;
  role: "dialog";
  "aria-modal": true;
  "aria-labelledby"?: string;
  "aria-label"?: string;
  tabIndex: -1;
  onInput: React.FormEventHandler<HTMLDivElement>;
}

export interface Dialog {
  /** Spread on the panel element of the dialog. */
  panelProps: DialogPanelProps;
  /** Put on the heading that names the dialog. Undefined when the dialog was given a plain `label` instead. */
  titleId: string | undefined;
  /** Closes the dialog and clears any discard warning. The X button and the backdrop use this, not `onClose`. */
  close: () => void;
  /** True after one Escape on a dialog the reader has typed in. Show the line that asks for a second Escape. */
  askedToDiscard: boolean;
}

export function useDialog({ isOpen, onClose, protectTyping = false, label }: DialogOptions): Dialog {
  const panel = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const headingId = useId();
  /** True once the reader has typed in this dialog since it opened. A ref, so a keystroke does not redraw. */
  const typed = useRef(false);
  /** What had the focus before the dialog opened, so Escape can give it back. */
  const cameFrom = useRef<HTMLElement | null>(null);
  const [askedToDiscard, setAskedToDiscard] = useState(false);

  const close = useCallback(() => {
    setAskedToDiscard(false);
    onClose();
  }, [onClose]);

  // Take the place on top of the stack, take the focus, and give both back on the way out.
  useEffect(() => {
    if (!isOpen) return;
    stack.push(dialogId);
    typed.current = false;
    cameFrom.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const opened = panel.current;
    if (opened) (focusableInside(opened)[0] ?? opened).focus();
    return () => {
      const at = stack.lastIndexOf(dialogId);
      if (at >= 0) stack.splice(at, 1);
      cameFrom.current?.focus();
      cameFrom.current = null;
    };
  }, [isOpen, dialogId]);

  // One listener per dialog, on the document and in the capture phase, so it answers before the page does. Each one
  // stands down unless its dialog is the last of the stack.
  useEffect(() => {
    if (!isOpen) return;
    const answer = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== dialogId) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (protectTyping && typed.current && !askedToDiscard) {
          setAskedToDiscard(true);
          return;
        }
        close();
        return;
      }
      // Any other key means the reader went back to work, so the warning is stale and the next Escape asks again.
      if (askedToDiscard) setAskedToDiscard(false);
      if (event.key === "Tab") keepFocusInside(event, panel.current);
    };
    document.addEventListener("keydown", answer, true);
    return () => document.removeEventListener("keydown", answer, true);
  }, [isOpen, dialogId, close, protectTyping, askedToDiscard]);

  const noteTyping = useCallback(() => {
    typed.current = true;
  }, []);

  return {
    panelProps: {
      ref: panel,
      role: "dialog",
      "aria-modal": true,
      ...(label ? { "aria-label": label } : { "aria-labelledby": headingId }),
      tabIndex: -1,
      onInput: noteTyping,
    },
    titleId: label ? undefined : headingId,
    close,
    askedToDiscard,
  };
}
