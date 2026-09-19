import React from "react";

/**
 * The line a form dialog shows after the first Escape, when the reader has typed something (RD-07).
 *
 * The 7 dialogs you type into used to ignore Escape, and they still do not close on a stray backdrop click, because
 * a half-written term or critique must not vanish. Escape closes them now, but it asks first: this line appears, and
 * a second Escape throws the words away. Any other key clears it, so the reader can simply carry on typing.
 *
 * `role="status"` tells a screen reader to read the line out when it appears, without moving the focus.
 */
export const DiscardNotice: React.FC = () => (
  <div
    role="status"
    className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
  >
    Press Escape again to discard what you have written.
  </div>
);
