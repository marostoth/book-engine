import { useState } from "react";

/**
 * A value that names one thing and is the same value every drawing while it is the same thing.
 *
 * An object is not one, and the type says so. See the warning on `belongsTo` below.
 */
type Named = string | number | boolean | bigint | null | undefined;

/**
 * Puts a piece of state back to its start when the thing it belongs to changes (TL-11).
 *
 * The practice and gatekeeper windows hold the answer the reader is typing. When the next card arrives, that answer
 * belongs to the card before it and has to go. Both windows used to clear it inside an effect, so React drew the new
 * card with the old answer still in the box and cleared it on a second drawing. `react-hooks/set-state-in-effect`
 * says so, and a reader on a slow machine could see the wrong answer under the new question.
 *
 * This is React's own answer, from "You Might Not Need an Effect": compare the value while drawing, and set the
 * state there. React throws that first drawing away before it reaches the screen, so the new card is never drawn
 * with the old answer at all. It is not an effect, so there is nothing to clean up and no second drawing.
 *
 * A `key` is the better answer whenever the state is all in one child, and most of TL-11 uses one. This is for the
 * other shape: state that sits beside other state a `key` must not touch. Rebuilding the practice window on every
 * card would throw away the session that walks them.
 *
 * ```ts
 * useStartAgainWhen(currentCard?.card_id, () => {
 *   setUserAnswer("");
 *   setRevealed(false);
 * });
 * ```
 *
 * @param belongsTo What the state belongs to: a card id, a chapter name, a number. Compared with `Object.is`, so
 *   the type refuses an object on purpose. A fresh object on every drawing would start the state again on every
 *   drawing, and React stops a component that does that with "Too many re-renders" - the window would go blank.
 * @param startAgain Called while drawing, once, on the drawing where `belongsTo` changed. Set state in it and
 *   nothing else: it must not write to anything outside this component.
 */
export function useStartAgainWhen<T extends Named>(belongsTo: T, startAgain: () => void): void {
  const [drawnFor, setDrawnFor] = useState(belongsTo);
  if (!Object.is(drawnFor, belongsTo)) {
    setDrawnFor(belongsTo);
    startAgain();
  }
}
