// @vitest-environment jsdom

import assert from "node:assert/strict";
import { useEffect, useLayoutEffect, useState } from "react";
import { afterEach, beforeEach, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useStartAgainWhen } from "./useStartAgainWhen.ts";

/**
 * TL-11: state that goes back to its start when the thing it belongs to changes.
 *
 * The point of this hook is what the reader SEES. Both ways end with an empty box, so a test that only reads the
 * box at the end passes either way and proves nothing. What differs is the drawing in between: an effect clears the
 * answer AFTER the new question is on screen, so there is one moment where the reader can see the answer to the
 * question before it under the new one.
 *
 * So these tests record every drawing that REACHED THE SCREEN, in a layout effect, which React runs only for a
 * drawing it keeps. A drawing React throws away is never recorded, and never seen. The last test does the same
 * thing with an effect and shows the bad moment appearing, so this file fails if the two ever behave alike.
 */

/** Every `question/answer` pair that reached the screen, in order. A layout effect runs once per kept drawing. */
let onScreen: string[] = [];

beforeEach(() => {
  onScreen = [];
});
afterEach(cleanup);

function Answering({ question }: { question: string }) {
  const [answer, setAnswer] = useState("");
  useStartAgainWhen(question, () => setAnswer(""));
  useLayoutEffect(() => {
    onScreen.push(`${question}/${answer}`);
  });
  return <input aria-label="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} />;
}

/** The same component, clearing the answer the way it was written before TL-11. Used as the contrast, not shipped. */
function AnsweringWithAnEffect({ question }: { question: string }) {
  const [answer, setAnswer] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this IS the fault TL-11 removes, kept on purpose
    setAnswer("");
  }, [question]);
  useLayoutEffect(() => {
    onScreen.push(`${question}/${answer}`);
  });
  return <input aria-label="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} />;
}

function type(text: string) {
  fireEvent.change(screen.getByLabelText("answer"), { target: { value: text } });
}

function box(): string {
  return screen.getByLabelText<HTMLInputElement>("answer").value;
}

test("the next question never reaches the screen with the answer to the one before it", () => {
  const page = render(<Answering question="first" />);
  type("my answer");
  onScreen = [];

  page.rerender(<Answering question="second" />);

  assert.equal(box(), "", "the old answer is still in the box");
  assert.ok(
    !onScreen.includes("second/my answer"),
    `the reader saw the old answer under the new question: ${JSON.stringify(onScreen)}`
  );
  assert.deepEqual(onScreen, ["second/"], "the new question reached the screen more than once");
});

test("an effect does let that moment reach the screen, which is what this hook is for", () => {
  const page = render(<AnsweringWithAnEffect question="first" />);
  type("my answer");
  onScreen = [];

  page.rerender(<AnsweringWithAnEffect question="second" />);

  assert.deepEqual(
    onScreen,
    ["second/my answer", "second/"],
    "the effect no longer shows the bad moment, so the contrast this file rests on is gone and these tests prove nothing"
  );
});

test("the same question again keeps what the reader typed", () => {
  const page = render(<Answering question="first" />);
  type("half an answer");
  page.rerender(<Answering question="first" />);
  assert.equal(box(), "half an answer", "every redraw throws the reader's words away, so they can never finish");
});

test("a redraw that changes nothing draws the answer once and does not clear it", () => {
  const page = render(<Answering question="first" />);
  type("kept");
  onScreen = [];
  page.rerender(<Answering question="first" />);
  assert.deepEqual(onScreen, ["first/kept"], "a redraw cleared the box, so this fires when nothing changed");
});

test("going back to a question the reader already answered still starts it again", () => {
  const page = render(<Answering question="first" />);
  type("answer to the first");
  page.rerender(<Answering question="second" />);
  type("answer to the second");
  page.rerender(<Answering question="first" />);
  assert.equal(box(), "", "the answer to the second question is shown under the first one");
});

test("a thing with no name of its own is still one thing, and keeps what was typed", () => {
  const page = render(<Answering question="" />);
  type("typed against nothing");
  page.rerender(<Answering question="" />);
  assert.equal(
    box(),
    "typed against nothing",
    "an empty name reads as a new thing on every drawing, so the box empties itself as the reader types"
  );
});

test("the type refuses an object, because a fresh one every drawing would blank the window", () => {
  // `Object.is` is never true for two objects built apart, so an object here starts the state again on every
  // drawing, React stops the component with "Too many re-renders", and the window goes blank. The type says no.
  //
  // This line is the guard. `tsc --noEmit` fails when a `@ts-expect-error` finds no error, so widening the type
  // back to an unbounded one breaks the build here instead of blanking a window in front of the reader.
  //
  // @ts-expect-error an object is not a name, on purpose
  const refused: Parameters<typeof useStartAgainWhen<{ id: string }>>[0] = { id: "first" };
  assert.deepEqual(refused, { id: "first" }, "this value exists only so the line above is checked");
});
