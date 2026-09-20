// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import React, { useRef } from "react";
import { usePacerDrag } from "./usePacerDrag.ts";
import type { LineBox } from "./useLinePacer.ts";

/**
 * TL-11: a drag that never moved is not a drag, and ends nothing.
 *
 * The pacer moves a chunk of words along one line at a time, and the reader can drag it. When a drag ends, the
 * pacer's clock is moved to where the drag left it.
 *
 * This hook used to be HANDED the line the pacer was on, read out of the pacer's own ref while the component was
 * drawing, and it kept a copy that an effect wrote again after every drawing. `react-hooks/refs` says a component
 * must not read a ref while drawing, because React does not draw again when a ref changes.
 *
 * The copy was there to answer "which line did this drag end on" when nothing had moved - and the answer it gave,
 * together with a progress left over from the drag BEFORE, moved the reader. A tap on the overlay, or a gesture
 * the browser cancelled, sent the pacer back to the start of the line or to wherever the last drag had ended.
 *
 * It ends only a drag that moved now, so nothing has to tell it which line the pacer is on.
 */

/** Three lines down a page, each 200 wide, 20 tall, with a 10 gap. */
const LINES: LineBox[] = [0, 1, 2].map((row) => ({
  top: row * 30,
  bottom: row * 30 + 20,
  left: 0,
  right: 200,
  width: 200,
  height: 20,
}));

/** An overlay whose box on screen is known, so a pointer position means one line and one progress. */
function overlayAt(): React.RefObject<HTMLDivElement | null> {
  const element = document.createElement("div");
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 200, bottom: 90, width: 200, height: 90, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return { current: element };
}

/** A pointer event with only the parts these handlers read. */
function pointer(x: number, y: number): React.PointerEvent {
  return {
    clientX: x,
    clientY: y,
    pointerId: 1,
    preventDefault: () => {},
    stopPropagation: () => {},
    currentTarget: { setPointerCapture: () => {}, releasePointerCapture: () => {} },
  } as unknown as React.PointerEvent;
}

type Drag = ReturnType<typeof usePacerDrag>;

/** Draws the hook and records every drag that ENDED, which is what moves the pacer's clock. */
function drawHook(): { drags: Drag[]; ended: { line: number; progress: number }[] } {
  const ended: { line: number; progress: number }[] = [];
  const drags: Drag[] = [];
  const Probe: React.FC = () => {
    const overlayRef = useRef(overlayAt().current);
    drags.push(
      usePacerDrag({
        lines: LINES,
        overlayRef,
        chunkSize: 2,
        onDragUpdate: () => {},
        onDragEnd: (line, progress) => ended.push({ line, progress }),
      })
    );
    return null;
  };
  render(<Probe />);
  return { drags, ended };
}

function now(drags: Drag[]): Drag {
  return drags[drags.length - 1];
}

afterEach(cleanup);

test("a tap on the pacer moves nothing", () => {
  const { drags, ended } = drawHook();

  act(() => now(drags).handlePointerDown(pointer(120, 40)));
  act(() => now(drags).handlePointerUp(pointer(120, 40)));

  assert.deepEqual(
    ended,
    [],
    "a tap ended a drag that never happened. The pacer's clock is moved by that, so the reader is sent back to " +
      "the start of the line, or to wherever the last drag ended (TL-11)."
  );
});

test("a gesture the browser cancels before any movement moves nothing", () => {
  const { drags, ended } = drawHook();

  // `onPointerCancel` is wired to the same handler as `onPointerUp` in PacingOverlay.
  act(() => now(drags).handlePointerDown(pointer(10, 10)));
  act(() => now(drags).handlePointerUp(pointer(10, 10)));
  act(() => now(drags).handlePointerUp(pointer(10, 10)));

  assert.deepEqual(ended, [], "a cancelled gesture moved the pacer");
});

test("a drag that moved ends on the line and the place it was left", () => {
  const { drags, ended } = drawHook();

  act(() => now(drags).handlePointerDown(pointer(0, 5)));
  // The third line's middle is at y = 70. Far along it, so the progress is high.
  act(() => now(drags).handlePointerMove(pointer(180, 70)));
  act(() => now(drags).handlePointerUp(pointer(180, 70)));

  assert.equal(ended.length, 1, "a real drag must end exactly once");
  assert.equal(ended[0].line, 2, "the drag ended on the wrong line");
  assert.ok(ended[0].progress > 0.5, `the drag ended at ${ended[0].progress}, which is not far along the line`);
});

test("a tap straight after a real drag does not end that drag a second time", () => {
  const { drags, ended } = drawHook();

  act(() => now(drags).handlePointerDown(pointer(0, 5)));
  act(() => now(drags).handlePointerMove(pointer(180, 70)));
  act(() => now(drags).handlePointerUp(pointer(180, 70)));
  const afterDrag = ended.length;

  act(() => now(drags).handlePointerDown(pointer(20, 5)));
  act(() => now(drags).handlePointerUp(pointer(20, 5)));

  assert.equal(
    ended.length,
    afterDrag,
    "a tap after a drag ended the drag before it AGAIN, so the reader was thrown back to where that drag finished"
  );
});

test("a second finger down before the first is lifted starts a new drag, not the end of the old one", () => {
  const { drags, ended } = drawHook();

  // A real drag that never gets its pointer up: a second finger, or a pointer the browser took away without
  // sending anything. This is the one case where the mark "this drag moved" would survive into the next drag.
  act(() => now(drags).handlePointerDown(pointer(0, 5)));
  act(() => now(drags).handlePointerMove(pointer(180, 70)));

  act(() => now(drags).handlePointerDown(pointer(20, 5)));
  act(() => now(drags).handlePointerUp(pointer(20, 5)));

  assert.deepEqual(
    ended,
    [],
    "a drag that never moved ended where the drag BEFORE it had been left, because the mark saying that one " +
      "moved was still set. Pointer down clears it, and that is why (TL-11)."
  );
});

test("nothing new is asked of the drag hook", () => {
  // The hook works the line out from where the pointer went. It used to be TOLD, from a ref read while the pacer
  // was drawing. This holds the shape of what it hands back, so the page cannot quietly start passing the line in
  // as something else. That the pacer passes NO ref value in is checked in `lib/nothingIsReadWhileDrawing.test.ts`,
  // which runs outside a browser and can read the file.
  const { drags } = drawHook();
  assert.deepEqual(
    Object.keys(now(drags)).sort(),
    ["handlePointerDown", "handlePointerMove", "handlePointerUp", "isDragging", "isDraggingRef"],
    "the hook gives back something new or something less"
  );
});
