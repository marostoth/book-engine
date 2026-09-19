// @vitest-environment jsdom

import assert from "node:assert/strict";
import { useState } from "react";
import { afterEach, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useDialog } from "./useDialog.ts";

/**
 * The one keyboard rule of every dialog (RD-07). Each case here is a way the app was wrong before:
 * Escape ignored, Escape closing two dialogs at once, no role for a screen reader, Tab walking out of the dialog,
 * the focus never coming back, and a half-written note lost to one stray key.
 */

interface TestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  protectTyping?: boolean;
  label?: string;
}

/** A dialog that holds nothing but the rule, so a failure here is the rule and not a real dialog's own code. */
function TestDialog({ isOpen, onClose, name, protectTyping, label }: TestDialogProps) {
  const { panelProps, titleId, close, askedToDiscard } = useDialog({ isOpen, onClose, protectTyping, label });
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0">
      <div {...panelProps} data-testid={`panel-${name}`}>
        {titleId ? <h2 id={titleId}>{name}</h2> : null}
        <button onClick={close}>Cancel {name}</button>
        <input aria-label={`Field ${name}`} />
        <button onClick={close}>Save {name}</button>
        {askedToDiscard ? <p>{`Discard warning ${name}`}</p> : null}
      </div>
    </div>
  );
}

/** The page behind the dialogs: a button that opens one, so the focus has somewhere to come back to. */
function Page({ protectTyping = false, label }: { protectTyping?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open the dialog</button>
      <TestDialog isOpen={open} onClose={() => setOpen(false)} name="one" protectTyping={protectTyping} label={label} />
    </>
  );
}

/**
 * Whether a thing is on screen. A boolean, never the element itself.
 *
 * `assert.equal(element, null)` makes node:assert build a difference between the two values, and a jsdom element
 * carries React's whole fiber graph on it, so one failing line takes minutes to print instead of milliseconds.
 */
function showing(found: HTMLElement | null): boolean {
  return found !== null;
}

function press(key: string, options: { shiftKey?: boolean } = {}) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...options });
}

afterEach(cleanup);

test("Escape closes a dialog", () => {
  render(<Page />);
  fireEvent.click(screen.getByText("Open the dialog"));
  assert.equal(showing(screen.queryByTestId("panel-one")), true, "the dialog did not open");

  press("Escape");
  assert.equal(showing(screen.queryByTestId("panel-one")), false, "Escape did not close the dialog");
});

test("a screen reader is told it is a dialog, and which one", () => {
  render(<Page />);
  fireEvent.click(screen.getByText("Open the dialog"));

  const panel = screen.getByTestId("panel-one");
  assert.equal(panel.getAttribute("role"), "dialog", "no role, so a screen reader reads it as one more part of the page");
  assert.equal(panel.getAttribute("aria-modal"), "true", "nothing says the page behind the dialog is out of reach");
  const namedBy = panel.getAttribute("aria-labelledby");
  assert.ok(namedBy, "the dialog does not point at its own heading");
  assert.equal(document.getElementById(namedBy)?.textContent, "one", "aria-labelledby points at nothing");
});

test("a dialog with no heading carries a plain name instead", () => {
  render(<Page label="Search all books" />);
  fireEvent.click(screen.getByText("Open the dialog"));

  const panel = screen.getByTestId("panel-one");
  assert.equal(panel.getAttribute("aria-label"), "Search all books");
  assert.equal(panel.getAttribute("aria-labelledby"), null, "a dialog must not be named twice");
});

test("the focus moves into the dialog when it opens", () => {
  render(<Page />);
  fireEvent.click(screen.getByText("Open the dialog"));

  assert.equal(document.activeElement?.textContent, "Cancel one", "the focus stayed on the page behind the dialog");
});

test("the focus goes back to the opener when the dialog closes", () => {
  render(<Page />);
  const opener = screen.getByText("Open the dialog");
  // A browser gives a button the focus when it is clicked. A test click does not, so the focus is set here by hand.
  opener.focus();
  fireEvent.click(opener);
  press("Escape");

  assert.equal(document.activeElement === opener, true, "the focus was left nowhere after the dialog closed");
});

test("Tab wraps from the last control back to the first", () => {
  render(<Page />);
  fireEvent.click(screen.getByText("Open the dialog"));
  screen.getByText("Save one").focus();

  press("Tab");
  assert.equal(document.activeElement?.textContent, "Cancel one", "Tab walked out of the dialog");
});

test("Shift and Tab wrap from the first control back to the last", () => {
  render(<Page />);
  fireEvent.click(screen.getByText("Open the dialog"));
  screen.getByText("Cancel one").focus();

  press("Tab", { shiftKey: true });
  assert.equal(document.activeElement?.textContent, "Save one", "Shift and Tab walked out of the dialog");
});

test("Tab brings the focus back in when it has been lost outside", () => {
  render(<Page />);
  const opener = screen.getByText("Open the dialog");
  fireEvent.click(opener);
  // A real control of the page behind, not `document.body`: jsdom leaves the focus where it was when body is asked
  // to take it, so this case used to pass whether the focus was pulled back in or not.
  opener.focus();
  assert.equal(document.activeElement === opener, true, "the focus did not leave the dialog, so nothing is proved");

  press("Tab");
  assert.equal(document.activeElement?.textContent, "Cancel one", "the focus was left on the page behind the dialog");
});

test("one Escape closes the dialog on top and leaves the one underneath open", () => {
  const closed: string[] = [];
  render(
    <>
      <TestDialog isOpen onClose={() => closed.push("under")} name="under" />
      <TestDialog isOpen onClose={() => closed.push("on top")} name="on top" />
    </>
  );

  press("Escape");
  assert.deepEqual(closed, ["on top"], "Escape reached more than the dialog on top");
});

test("the dialog underneath answers Escape once the one on top has gone", () => {
  function TwoDialogs() {
    const [top, setTop] = useState(true);
    const [under, setUnder] = useState(true);
    return (
      <>
        {under ? <TestDialog isOpen onClose={() => setUnder(false)} name="under" /> : null}
        {top ? <TestDialog isOpen onClose={() => setTop(false)} name="on top" /> : null}
      </>
    );
  }
  render(<TwoDialogs />);

  press("Escape");
  assert.equal(showing(screen.queryByTestId("panel-on top")), false, "the dialog on top did not close");
  assert.equal(showing(screen.queryByTestId("panel-under")), true, "the dialog underneath closed as well");

  press("Escape");
  assert.equal(showing(screen.queryByTestId("panel-under")), false, "the dialog underneath never got its turn");
});

test("a form the reader typed in asks before it throws the words away", () => {
  render(<Page protectTyping />);
  fireEvent.click(screen.getByText("Open the dialog"));
  fireEvent.input(screen.getByLabelText("Field one"), { target: { value: "division of labour" } });

  press("Escape");
  assert.equal(showing(screen.queryByText("Discard warning one")), true, "the first Escape asked nothing");
  assert.equal(showing(screen.queryByTestId("panel-one")), true, "the first Escape threw the words away");

  press("Escape");
  assert.equal(showing(screen.queryByTestId("panel-one")), false, "the second Escape did not close the dialog");
});

test("a form nobody typed in closes on the first Escape", () => {
  render(<Page protectTyping />);
  fireEvent.click(screen.getByText("Open the dialog"));

  press("Escape");
  assert.equal(
    showing(screen.queryByTestId("panel-one")),
    false,
    "an untouched form made the reader press Escape twice"
  );
});

test("typing again clears the warning, so the next Escape asks once more", () => {
  render(<Page protectTyping />);
  fireEvent.click(screen.getByText("Open the dialog"));
  const field = screen.getByLabelText("Field one");
  fireEvent.input(field, { target: { value: "wealth" } });

  press("Escape");
  assert.equal(showing(screen.queryByText("Discard warning one")), true, "the first Escape asked nothing");

  field.focus();
  press("a");
  assert.equal(
    showing(screen.queryByText("Discard warning one")),
    false,
    "the warning stayed up while the reader kept working"
  );

  press("Escape");
  assert.equal(
    showing(screen.queryByTestId("panel-one")),
    true,
    "Escape threw the words away without asking again"
  );
  assert.equal(
    showing(screen.queryByText("Discard warning one")),
    true,
    "Escape asked nothing the second time round"
  );
});

test("a dialog that holds no form closes at once, even after a key reaches it", () => {
  render(<Page />);
  fireEvent.click(screen.getByText("Open the dialog"));
  fireEvent.input(screen.getByLabelText("Field one"), { target: { value: "typed" } });

  press("Escape");
  assert.equal(showing(screen.queryByTestId("panel-one")), false, "a dialog with no form asked before closing");
});

test("the warning is gone when the same dialog opens again", () => {
  render(<Page protectTyping />);
  const opener = screen.getByText("Open the dialog");
  fireEvent.click(opener);
  fireEvent.input(screen.getByLabelText("Field one"), { target: { value: "wealth" } });
  press("Escape");
  press("Escape");

  fireEvent.click(opener);
  assert.equal(
    showing(screen.queryByText("Discard warning one")),
    false,
    "the dialog opened with a stale warning on it"
  );
  press("Escape");
  assert.equal(
    showing(screen.queryByTestId("panel-one")),
    false,
    "the dialog remembered typing from the last time it was open"
  );
});
