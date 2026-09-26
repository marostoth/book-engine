// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { usePacerKeyboard } from "./usePacerDrag.ts";
import { useDialog } from "../../hooks/useDialog.ts";

/**
 * The running pacer steps by the arrow keys, from a listener on `window`. It used to take them wherever the focus
 * was, unless it was in a text field. So a select, the tabs of the reading guide and anything in a dialog lost their
 * arrows, and the pacer stepped behind the dialog. A plain button answers no arrow, so the pacer still steps after
 * its Start button is clicked.
 */

afterEach(cleanup);

const steps: string[] = [];

function Dialog() {
  const { panelProps } = useDialog({ isOpen: true, onClose: () => {} });
  return (
    <div {...panelProps} aria-label="a dialog">
      <button>Close</button>
    </div>
  );
}

function Pacer({ withADialog = false }: { withADialog?: boolean }) {
  usePacerKeyboard({
    enabled: true,
    isRunning: true,
    onStepLine: (delta) => steps.push(`line ${delta}`),
    onStepChunk: (delta) => steps.push(`chunk ${delta}`),
  });
  return (
    <>
      <button>Start pacer</button>
      <select aria-label="a list">
        <option>one</option>
        <option>two</option>
      </select>
      <input aria-label="a field" />
      <div role="tablist">
        <button role="tab" aria-selected>
          a tab
        </button>
      </div>
      <div contentEditable suppressContentEditableWarning>
        editable
      </div>
      {withADialog && <Dialog />}
    </>
  );
}

/** Presses one key on one element. `taken` is true when the page's default for the key was stopped. */
function press(target: Element, key: string, held: Record<string, boolean> = {}) {
  steps.length = 0;
  const taken = !fireEvent.keyDown(target, { key, ...held });
  return { taken, steps: [...steps] };
}

test("with the focus on the page, the arrows step the running pacer", () => {
  render(<Pacer />);

  assert.deepEqual(press(document.body, "ArrowDown"), { taken: true, steps: ["line 1"] });
  assert.deepEqual(press(document.body, "ArrowUp"), { taken: true, steps: ["line -1"] });
  assert.deepEqual(press(document.body, "ArrowRight"), { taken: true, steps: ["chunk 0.15"] });
  assert.deepEqual(press(document.body, "ArrowLeft"), { taken: true, steps: ["chunk -0.15"] });
  assert.deepEqual(press(document.body, "PageDown"), { taken: false, steps: [] }, "only the arrows are the pacer's");
});

test("the pacer still steps after its Start button is clicked, because a button answers no arrow", () => {
  render(<Pacer />);

  assert.deepEqual(press(screen.getByRole("button", { name: "Start pacer" }), "ArrowDown"), {
    taken: true,
    steps: ["line 1"],
  });
});

test("a select, a text field, a tab and an editable element keep their arrows", () => {
  render(<Pacer />);
  const controls = {
    select: screen.getByRole("combobox", { name: "a list" }),
    "text field": screen.getByRole("textbox", { name: "a field" }),
    tab: screen.getByRole("tab"),
    "editable element": screen.getByText("editable"),
  };

  for (const [name, control] of Object.entries(controls)) {
    for (const key of ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"]) {
      assert.deepEqual(press(control, key), { taken: false, steps: [] }, `the pacer took ${key} from a ${name}`);
    }
  }
});

test("an arrow held with Ctrl, Cmd or Alt is another shortcut", () => {
  render(<Pacer />);

  for (const held of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }] as Record<string, boolean>[]) {
    assert.deepEqual(press(document.body, "ArrowDown", held), { taken: false, steps: [] }, JSON.stringify(held));
  }
});

test("while a dialog is open, the pacer behind it does not step", () => {
  render(<Pacer withADialog />);

  assert.deepEqual(press(screen.getByRole("button", { name: "Close" }), "ArrowDown"), { taken: false, steps: [] });
  assert.deepEqual(press(document.body, "ArrowDown"), { taken: false, steps: [] }, "the dialog lost the focus");
});
