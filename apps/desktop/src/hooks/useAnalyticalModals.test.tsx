// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useAnalyticalModals } from "./useAnalyticalModals.ts";

/**
 * TL-11: the four openers of the analytical windows name the one thing they read.
 *
 * Each of them stages the paragraph on screen when it is opened from a button, and each of them worked that out
 * through one small helper, `placeOnScreen`. The helper was made afresh on every drawing, so the four could not
 * name it: they named the two values the helper reads instead, by hand. That list was right, and nothing checked
 * that it stayed right. A third value read inside the helper would have left all four openers staging the place
 * the reader was at when the chapter opened, for as long as the chapter stayed open.
 *
 * The helper is made once for a place now, and the four name the helper. These tests hold both halves of what
 * that promises: the openers do not change while the place does not, and they DO change when it does.
 */

/** What one drawing of the hook gave back, so two drawings can be compared. */
type Opened = ReturnType<typeof useAnalyticalModals>;

/**
 * Draws the hook, and gives back every drawing in order.
 *
 * The drawings are recorded from the body, on purpose: this test is about which FUNCTION a drawing hands out, not
 * about what reaches the screen, and React hands out a function during the drawing.
 */
function drawHook(): { drawings: Opened[]; show: (chapterFile?: string, anchor?: string) => void } {
  const drawings: Opened[] = [];
  const Probe: React.FC<{ chapterFile?: string; anchor?: string }> = ({ chapterFile, anchor }) => {
    drawings.push(useAnalyticalModals({ currentChapterFile: chapterFile, currentAnchor: anchor }));
    return null;
  };
  const view = render(<Probe />);
  return {
    drawings,
    show: (chapterFile?: string, anchor?: string) => view.rerender(<Probe chapterFile={chapterFile} anchor={anchor} />),
  };
}

const OPENERS = ["openTermModal", "openArgumentModal", "openCritiqueModal", "openInquiryModal"] as const;

afterEach(cleanup);

test("the four openers are the same functions while the reader stays on one paragraph", () => {
  const { drawings, show } = drawHook();
  show("ch-02.md", "p-014");
  show("ch-02.md", "p-014");
  show("ch-02.md", "p-014");

  const [, first, second, third] = drawings;
  for (const opener of OPENERS) {
    assert.equal(
      first[opener],
      second[opener],
      `${opener} was made afresh for a drawing that changed nothing. The windows are held still by their own ` +
        `props, so a new function here draws all of them again on every keystroke (RD-06).`
    );
    assert.equal(second[opener], third[opener], `${opener} was made afresh on the third drawing`);
  }
});

test("a window opened after the reader moved stages the paragraph the reader is on now", () => {
  const { drawings, show } = drawHook();
  show("ch-02.md", "p-014");
  show("ch-02.md", "p-099");
  const afterMoving = drawings[drawings.length - 1];

  act(() => afterMoving.openTermModal());
  const staged = drawings[drawings.length - 1].stagedCitation;
  assert.deepEqual(
    staged,
    { chapterFile: "ch-02.md", anchor: "p-099", quote: "" },
    "the term window staged the paragraph the reader had LEFT. A note would then point at the wrong place in the book."
  );
});

test("the four openers are new functions once the reader moves, so none of them keeps the old paragraph", () => {
  const { drawings, show } = drawHook();
  show("ch-02.md", "p-014");
  show("ch-02.md", "p-099");

  const [, before, after] = drawings;
  for (const opener of OPENERS) {
    assert.notEqual(
      before[opener],
      after[opener],
      `${opener} stayed the same function after the reader moved to another paragraph, so it still stages the old one`
    );
  }
});

test("a window opened on a selection stages that selection, not the paragraph on screen", () => {
  const { drawings, show } = drawHook();
  show("ch-02.md", "p-014");

  const quoted = { chapterFile: "ch-02.md", anchor: "p-031", quote: "the division of labour" };
  act(() => drawings[drawings.length - 1].openArgumentModal(quoted));
  assert.deepEqual(
    drawings[drawings.length - 1].stagedCitation,
    quoted,
    "the argument window threw away the reader's selection and staged the paragraph on screen instead"
  );
});

test("closing every window is one function that is never made again", () => {
  const { drawings, show } = drawHook();
  show("ch-02.md", "p-014");
  show("ch-07.md", "p-002");

  const [, before, after] = drawings;
  assert.equal(
    before.closeModals,
    after.closeModals,
    "closeModals was made afresh when the chapter changed. Five calls in useAnalyticalSession name it, and every " +
      "one of them would be made afresh as well (TL-11)."
  );
});
