// @vitest-environment jsdom

import assert from "node:assert/strict";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { AuthorTerm } from "../lib/types/analytical.ts";

/**
 * TL-11: a window opens with the right words in it, on the first drawing.
 *
 * `lib/formStart.test.ts` reads the start values without a browser, and proves the branches. This file renders the
 * real windows and asks the question that matters to the reader: was the form EVER on screen holding the wrong
 * words? Seven windows used to fill themselves inside an effect, so the answer was yes for one drawing, every
 * time: empty fields under the heading "Edit Author Term", or the term before this one under the new one.
 *
 * Both ways end with the right words, so a test that only reads the fields at the end passes either way. These
 * tests record what was COMMITTED, in a layout effect, which React runs only for a drawing it keeps.
 */

vi.mock("../lib/api.ts", () => ({
  searchVault: () => Promise.resolve([]),
  submitReview: () => Promise.resolve({}),
}));

const { TermModal } = await import("./analytical/TermModal.tsx");
const { LevelGuideModal } = await import("./LevelGuideModal.tsx");

const place = { chapterFile: "ch-03.md", anchor: "^p-0012", quote: "The market limits the division of labour." };

const division: AuthorTerm = {
  id: "term-1",
  term: "Division of Labour",
  authorDefinition: "The splitting of one trade into many.",
  citation: place,
};

const capital: AuthorTerm = {
  id: "term-2",
  term: "Fixed Capital",
  authorDefinition: "What yields a profit without changing hands.",
  citation: { chapterFile: "ch-09.md", anchor: "^p-0044", quote: "A stock of goods that is not sold on." },
};

/** Every value the term box held on a drawing that reached the screen, in order. */
let onScreen: string[] = [];

/** Watches the term box. It is rendered beside the window, so its layout effect runs on the same commits. */
function WatchTheTermBox() {
  useLayoutEffect(() => {
    const box = document.querySelector<HTMLInputElement>('input[placeholder^="e.g. Division of Labour"]');
    if (box) onScreen.push(box.value);
  });
  return null;
}

function openTermWindowFor(editingTerm: AuthorTerm | null) {
  return (
    <>
      <TermModal
        isOpen
        onClose={() => {}}
        onSave={() => {}}
        stagedCitation={null}
        editingTerm={editingTerm}
        currentChapterFile="ch-09.md"
      />
      <WatchTheTermBox />
    </>
  );
}

function termBox(): HTMLInputElement {
  const box = document.querySelector<HTMLInputElement>('input[placeholder^="e.g. Division of Labour"]');
  assert.ok(box, "the term window has no box to type the term in, so this file is reading the wrong element");
  return box;
}

beforeEach(() => {
  onScreen = [];
});
afterEach(cleanup);

test("a term being edited is in the box on the drawing the window first reaches the screen", () => {
  render(openTermWindowFor(division));

  assert.equal(termBox().value, "Division of Labour");
  assert.deepEqual(
    onScreen,
    ["Division of Labour"],
    "the window was on screen with an empty box under the heading Edit Author Term before its words arrived"
  );
});

test("a new term opens with an empty box, and stays empty", () => {
  render(openTermWindowFor(null));
  assert.deepEqual(onScreen, [""], "a new term window was drawn with words in it");
});

test("opening the window on another term never shows the term before it", () => {
  const page = render(openTermWindowFor(division));
  onScreen = [];

  page.rerender(openTermWindowFor(capital));

  assert.equal(termBox().value, "Fixed Capital");
  assert.ok(
    !onScreen.includes("Division of Labour"),
    `the window showed the term before this one: ${JSON.stringify(onScreen)}`
  );
});

test("the window says which of the two jobs it is doing, and the box agrees with it", () => {
  const page = render(openTermWindowFor(division));
  assert.ok(screen.getByText("Edit Author Term"), "a term being edited is not announced as an edit");
  assert.equal(termBox().value, "Division of Labour");

  page.rerender(openTermWindowFor(null));
  assert.ok(screen.getByText("Define Author Term"), "a new term is announced as an edit of something");
  assert.equal(termBox().value, "", "the heading says new and the box holds the term before it");
});

test("closing the window and opening it again starts the form over", () => {
  const page = render(openTermWindowFor(division));
  termBox().value = "typed over";

  page.rerender(
    <>
      <TermModal
        isOpen={false}
        onClose={() => {}}
        onSave={() => {}}
        stagedCitation={null}
        editingTerm={division}
        currentChapterFile="ch-09.md"
      />
      <WatchTheTermBox />
    </>
  );
  assert.equal(
    document.querySelectorAll('[role="dialog"]').length,
    0,
    "the window is still on the page while it is shut, so its state is still there too"
  );

  page.rerender(openTermWindowFor(division));
  assert.equal(termBox().value, "Division of Labour", "the window opened again with what was typed into it before");
});

test("the guide opens on the level the reader is at, and never shows another level first", () => {
  /** The open tab of every drawing that reached the screen, as the markup marks it. */
  const shown: string[] = [];

  function WatchTheTab() {
    useLayoutEffect(() => {
      const open = document.querySelectorAll('[role="dialog"] [role="tab"][aria-selected="true"]');
      shown.push(Array.from(open, (tab) => tab.textContent).join(" and ") || "(none)");
    });
    return null;
  }

  render(
    <>
      <LevelGuideModal isOpen onClose={() => {}} activeLevel="analytical" />
      <WatchTheTab />
    </>
  );

  assert.ok(shown.length > 0, "nothing was drawn, so this test reads nothing");
  assert.deepEqual(
    shown,
    ["Level III(Analytical)"],
    "the guide opened on another level and moved the tab afterwards, or marks two levels at once"
  );
});
