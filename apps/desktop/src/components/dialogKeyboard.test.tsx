// @vitest-environment jsdom

import assert from "node:assert/strict";
import { useState } from "react";
import { afterEach, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * The one keyboard rule, in the real dialogs (RD-07).
 *
 * `hooks/useDialog.test.tsx` checks the rule on a dialog that holds nothing else, and
 * `tests/test_dialogs_follow_one_rule.py` checks that all 14 dialogs of the app call it. Neither proves that a real
 * dialog is wired up: a dialog can call the rule and then forget to put the props it hands back on its panel.
 *
 * These are real dialogs, in a real document. They were picked because they cover every part of the finding: a form
 * that must not lose what the reader typed, the chapter gate that must not be walked through, the search window whose
 * Escape used to work only while the focus was already inside it, and two dialogs open at once.
 */

vi.mock("../lib/api.ts", () => ({
  searchVault: () => Promise.resolve([]),
  submitReview: () => Promise.resolve({}),
}));

const { TermModal } = await import("./analytical/TermModal.tsx");
const { NeutralTermModal } = await import("./syntopicon/NeutralTermModal.tsx");
const { GatekeeperModal } = await import("./GatekeeperModal.tsx");
const { OmniSearchModal } = await import("./OmniSearchModal.tsx");

function press(key: string, options: { shiftKey?: boolean } = {}) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...options });
}

/** The dialog panel on screen, or null. Every dialog panel says what it is. */
function panels(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
}

afterEach(cleanup);

test("a form dialog tells a screen reader what it is and points at its own heading", () => {
  render(
    <TermModal isOpen onClose={() => {}} onSave={() => {}} stagedCitation={null} editingTerm={null} />
  );

  const [panel] = panels();
  assert.ok(panel, "the term dialog carries no role, so a screen reader reads it as one more part of the page");
  assert.equal(panel.getAttribute("aria-modal"), "true", "nothing says the page behind the dialog is out of reach");
  const namedBy = panel.getAttribute("aria-labelledby");
  assert.ok(namedBy, "the dialog does not point at its own heading");
  assert.equal(
    document.getElementById(namedBy)?.textContent,
    "Define Author Term",
    "aria-labelledby points at something that is not the dialog's heading"
  );
});

test("the focus moves into a form dialog when it opens, so the keyboard is already inside", () => {
  render(
    <TermModal isOpen onClose={() => {}} onSave={() => {}} stagedCitation={null} editingTerm={null} />
  );

  const [panel] = panels();
  assert.ok(
    document.activeElement && panel.contains(document.activeElement),
    "the focus stayed outside the dialog, so the first Tab walks the page behind it"
  );
});

test("Escape closes a form dialog nobody has typed in", () => {
  let closed = 0;
  render(
    <TermModal isOpen onClose={() => (closed += 1)} onSave={() => {}} stagedCitation={null} editingTerm={null} />
  );

  press("Escape");
  assert.equal(closed, 1, "Escape did nothing: this dialog ignored the key before RD-07");
});

test("Escape asks first when the reader has typed a term, and the second one closes", () => {
  let closed = 0;
  render(
    <TermModal isOpen onClose={() => (closed += 1)} onSave={() => {}} stagedCitation={null} editingTerm={null} />
  );
  const [field] = Array.from(document.querySelectorAll("input"));
  fireEvent.input(field, { target: { value: "division of labour" } });

  press("Escape");
  assert.equal(closed, 0, "one stray Escape threw away what the reader had written");
  assert.equal(
    screen.queryByText(/Press Escape again to discard/) !== null,
    true,
    "nothing told the reader what to do next"
  );

  press("Escape");
  assert.equal(closed, 1, "the second Escape did not close the dialog");
});

test("Tab stays inside a form dialog instead of walking the page behind it", () => {
  render(
    <>
      <button>A button of the page behind</button>
      <TermModal isOpen onClose={() => {}} onSave={() => {}} stagedCitation={null} editingTerm={null} />
    </>
  );

  const [panel] = panels();
  const inside = Array.from(panel.querySelectorAll<HTMLElement>("button, input, textarea"));
  inside[inside.length - 1].focus();

  press("Tab");
  assert.ok(
    document.activeElement && panel.contains(document.activeElement),
    "Tab left the dialog and reached the page behind it"
  );
  assert.equal(
    document.activeElement === inside[0],
    true,
    "Tab did not wrap round to the first control of the dialog"
  );
});

test("one Escape closes the dialog on top and leaves the one underneath open", () => {
  const closed: string[] = [];
  render(
    <>
      <TermModal
        isOpen
        onClose={() => closed.push("term")}
        onSave={() => {}}
        stagedCitation={null}
        editingTerm={null}
      />
      <NeutralTermModal
        isOpen
        onClose={() => closed.push("neutral term")}
        onSave={() => {}}
        stagedCitation={null}
        editingTerm={null}
      />
    </>
  );
  assert.equal(panels().length, 2, "the two dialogs did not both open, so this test proves nothing");

  press("Escape");
  assert.deepEqual(closed, ["neutral term"], "Escape reached more than the dialog on top");
});

test("Escape on the chapter gate leaves the reader where they are and does not open the next chapter", () => {
  let closed = 0;
  let opened = 0;
  render(
    <GatekeeperModal
      isOpen
      onClose={() => (closed += 1)}
      leavingChapterTitle="Of the Division of Labour"
      targetChapterTitle="Of the Principle which gives Occasion to the Division of Labour"
      cards={[]}
      quota={3}
      onComplete={() => (opened += 1)}
      onReviewSubmitted={() => {}}
    />
  );

  press("Escape");
  assert.equal(closed, 1, "Escape did nothing: the gate ignored the key before RD-07");
  assert.equal(opened, 0, "Escape walked through the gate and opened the next chapter");
});

test("Escape closes the search window even when the focus is not inside it", () => {
  function Page() {
    const [open, setOpen] = useState(true);
    return <OmniSearchModal isOpen={open} onClose={() => setOpen(false)} books={[]} onSelectResult={() => {}} />;
  }
  render(<Page />);
  // The old handler sat on the panel element, so React only saw a key that started inside the window.
  document.body.focus();
  fireEvent.keyDown(document.body, { key: "Escape" });

  assert.equal(panels().length, 0, "Escape worked only while the focus was already inside the search window");
});

test("the search window carries a name of its own, because it has no heading", () => {
  render(<OmniSearchModal isOpen onClose={() => {}} books={[]} onSelectResult={() => {}} />);

  const [panel] = panels();
  assert.ok(panel.getAttribute("aria-label"), "the search window has no name a screen reader can say");
  assert.equal(panel.getAttribute("aria-labelledby"), null, "a dialog must not be named twice");
});

test("every button of an open dialog has a name a screen reader can say", () => {
  render(
    <TermModal isOpen onClose={() => {}} onSave={() => {}} stagedCitation={null} editingTerm={null} />
  );

  const nameless = Array.from(document.querySelectorAll("button")).filter(
    (button) => !button.textContent?.trim() && !button.getAttribute("aria-label") && !button.getAttribute("title")
  );
  // The outerHTML, not the element: a failing compare of a jsdom node takes minutes to print.
  assert.deepEqual(
    nameless.map((button) => button.outerHTML.slice(0, 80)),
    [],
    "a button of this dialog has no name at all"
  );
});
