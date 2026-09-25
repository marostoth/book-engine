// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ArgumentNode } from "../../lib/types/analytical.ts";
import { ArgumentBuilderModal } from "./ArgumentBuilderModal.tsx";

/**
 * RD-11: a premise the reader adds names no paragraph until the reader gives it one.
 *
 * "+ Add Premise" used to stamp the second, third and fourth premise with `^p-002`, `^p-003` and `^p-004`: a count of
 * the premises, read as the second, third and fourth block of the chapter. The form has no box for an anchor, so the
 * reader never saw it being made up. It was saved, a click on the premise opened the chapter at that block, and a
 * "P" badge in the gutter claimed a premise lived there.
 */

afterEach(cleanup);

/** The place the reader staged: a real anchor, picked from the chapter. */
const staged = { chapterFile: "ch-03.md", anchor: "^p-012", quote: "The market limits the division of labour." };

function openWindow(onSave: (argument: ArgumentNode) => void, editingArgument: ArgumentNode | null = null) {
  render(
    <ArgumentBuilderModal
      isOpen
      onClose={() => {}}
      onSave={onSave}
      stagedCitation={editingArgument ? null : staged}
      editingArgument={editingArgument}
      currentChapterFile="ch-03.md"
    />
  );
}

function premiseBoxes(): HTMLTextAreaElement[] {
  return screen.getAllByPlaceholderText("Verbatim premise proposition...") as HTMLTextAreaElement[];
}

function addPremises(count: number) {
  for (let i = 0; i < count; i++) fireEvent.click(screen.getByRole("button", { name: "+ Add Premise" }));
}

function fillAndSave(title: string) {
  fireEvent.change(screen.getByPlaceholderText(/^e\.g\. Tendency/), { target: { value: title } });
  premiseBoxes().forEach((box, i) => fireEvent.change(box, { target: { value: `Premise number ${i + 1}.` } }));
  fireEvent.click(screen.getByRole("button", { name: /Save Argument|Update Argument/ }));
}

test("every premise the reader adds is saved with no anchor, not with a block number the app counted", () => {
  const saved: ArgumentNode[] = [];
  openWindow((argument) => saved.push(argument));

  addPremises(3);
  assert.equal(premiseBoxes().length, 4, "the window did not add three premises, so this test reads nothing");
  fillAndSave("Division is limited by the market");

  assert.equal(saved.length, 1, "the argument was not saved");
  assert.deepEqual(
    saved[0].premises.map((premise) => premise.anchor),
    ["", "", "", ""],
    "a premise was saved with an anchor the reader never picked"
  );
  assert.equal(saved[0].conclusion.anchor, "^p-012", "the conclusion lost the anchor the reader picked");
});

test("a premise the reader adds shows the chapter alone, not a paragraph", () => {
  openWindow(() => {});
  addPremises(3);

  const places = screen.getAllByText(/^ch-03\.md/).map((element) => element.textContent);
  // The conclusion names the paragraph the reader staged; the four premises name the chapter only.
  assert.deepEqual(places, ["ch-03.md #^p-012", "ch-03.md", "ch-03.md", "ch-03.md", "ch-03.md"]);
});

test("adding a premise to a saved argument keeps the anchors it had and gives the new one none", () => {
  const saved: ArgumentNode[] = [];
  const argument: ArgumentNode = {
    id: "arg-1",
    title: "Division is limited by the market",
    inferenceType: "deductive",
    conclusion: staged,
    premises: [{ chapterFile: "ch-03.md", anchor: "^p-007", quote: "A trade needs buyers." }],
    notes: "",
  };
  openWindow((next) => saved.push(next), argument);

  addPremises(1);
  fillAndSave(argument.title);

  assert.deepEqual(
    saved[0].premises.map((premise) => premise.anchor),
    ["^p-007", ""],
    "the premise the reader cited lost its anchor, or the new one was given a block of its own"
  );
});
