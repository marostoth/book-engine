// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { useReaderSelection } from "./useReaderSelection.ts";
import { SelectionMenu } from "../SelectionMenu.tsx";
import { TermModal } from "../analytical/TermModal.tsx";

/**
 * Picking a passage with the keyboard raises the selection menu (RD-07).
 *
 * The menu opened on `mouseup` and on nothing else. A passage picked with Shift and the arrows raised no menu, so it
 * could not be highlighted, noted or quoted: the whole of "you cannot highlight with the keyboard".
 *
 * There is no real editor here. `useReaderSelection` asks its editor two things about a selection - which part of the
 * chapter it holds, and which paragraph anchor names it - and a stand-in answers both, so these cases are about the
 * hook and not about TipTap.
 */

vi.mock("../../lib/api.ts", () => ({ searchVault: () => Promise.resolve([]) }));

/**
 * The test document lays nothing out, so a range has no size and no `getBoundingClientRect` at all. The hook reads
 * one to place the menu beside the words. Zeroes are enough: these cases are about WHETHER the menu comes up.
 */
Range.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

const CHAPTER_TEXT = "Price is the great communicator of a market.";

/** A chapter element outside React, so the stand-in editor can point at it before anything is drawn. */
function aChapter(): { chapter: HTMLElement; editor: Editor } {
  const chapter = document.createElement("div");
  chapter.textContent = CHAPTER_TEXT;
  document.body.appendChild(chapter);

  // One paragraph, big enough to hold any position these tests take, and named by a paragraph anchor.
  const block = { nodeSize: CHAPTER_TEXT.length + 2, attrs: { anchor: "p-001" }, type: { name: "paragraph" } };
  const doc = { childCount: 1, content: { size: block.nodeSize }, child: () => block };
  const view = { dom: chapter, posAtDOM: (_node: Node, offset: number) => offset, state: { doc } };
  return { chapter, editor: { isDestroyed: false, view, state: { doc } } as unknown as Editor };
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

/** Selects part of the chapter text, the way Shift and the arrows do. */
function pick(chapter: HTMLElement, from: number, to: number) {
  const text = chapter.firstChild;
  assert.ok(text, "the chapter holds no text to pick");
  const range = document.createRange();
  range.setStart(text, from);
  range.setEnd(text, to);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Selects text that is not part of the chapter at all, the way a selection in a dialog would be. */
function pickSomewhereElse() {
  const other = document.createElement("p");
  other.textContent = "Text of another part of the page.";
  document.body.appendChild(other);
  const range = document.createRange();
  range.selectNodeContents(other);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

interface ReaderStandInProps {
  editor: Editor;
  onDismiss?: boolean;
}

/** Shows what the hook decided: the menu, and the words it would act on. */
function ReaderStandIn({ editor, onDismiss = true }: ReaderStandInProps) {
  const { selectionPos, selectedText, selectedAnchor, closeSelectionMenu, handleMouseUp } = useReaderSelection({
    editor,
    onAddHighlight: () => {},
    onAddNoteFromSelection: () => {},
  });
  return (
    <div onMouseUp={handleMouseUp} data-testid="chapter-area">
      {selectionPos ? (
        <>
          <p>{`menu over: ${selectedText} at ${selectedAnchor ?? "no anchor"}`}</p>
          <SelectionMenu
            position={selectionPos}
            onHighlight={() => {}}
            onAddNote={() => {}}
            onCopyLink={() => {}}
            onDismiss={onDismiss ? closeSelectionMenu : undefined}
          />
        </>
      ) : null}
    </div>
  );
}

afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

test("a passage picked with Shift and an arrow key raises the menu", () => {
  const { chapter, editor } = aChapter();
  render(<ReaderStandIn editor={editor} />);
  assert.equal(showing(screen.queryByText(/menu over/)), false, "the menu was up before anything was picked");

  pick(chapter, 0, 5);
  fireEvent.keyUp(document, { key: "ArrowRight", shiftKey: true });

  assert.ok(screen.getByText("menu over: Price at ^p-001"), "picking with the keyboard raised no menu");
});

test("Control and A raise the menu as well", () => {
  const { chapter, editor } = aChapter();
  render(<ReaderStandIn editor={editor} />);

  pick(chapter, 0, CHAPTER_TEXT.length);
  fireEvent.keyUp(document, { key: "a", ctrlKey: true });

  assert.ok(screen.getByText(`menu over: ${CHAPTER_TEXT} at ^p-001`), "taking the whole chapter raised no menu");
});

test("a key that cannot change the selection leaves the menu alone", () => {
  const { chapter, editor } = aChapter();
  render(<ReaderStandIn editor={editor} />);

  pick(chapter, 0, 5);
  fireEvent.keyUp(document, { key: "b" });

  assert.equal(
    showing(screen.queryByText(/menu over/)),
    false,
    "a letter key raised the menu without a change of selection"
  );
});

test("moving the caret away again takes the menu down", () => {
  const { chapter, editor } = aChapter();
  render(<ReaderStandIn editor={editor} />);
  pick(chapter, 0, 5);
  fireEvent.keyUp(document, { key: "ArrowRight", shiftKey: true });
  assert.equal(showing(screen.queryByText(/menu over/)), true, "the menu never came up, so this test proves nothing");

  window.getSelection()?.removeAllRanges();
  fireEvent.keyUp(document, { key: "ArrowRight" });

  assert.equal(
    showing(screen.queryByText(/menu over/)),
    false,
    "the menu stayed up over words that are no longer picked"
  );
});

test("a passage picked somewhere else on the page does not raise the reader's menu", () => {
  const { editor } = aChapter();
  render(<ReaderStandIn editor={editor} />);

  pickSomewhereElse();
  fireEvent.keyUp(document, { key: "ArrowRight", shiftKey: true });

  assert.equal(
    showing(screen.queryByText(/menu over/)),
    false,
    "words picked in another part of the page raised the chapter's own menu"
  );
});

test("one letter is too short to act on", () => {
  const { chapter, editor } = aChapter();
  render(<ReaderStandIn editor={editor} />);

  pick(chapter, 0, 1);
  fireEvent.keyUp(document, { key: "ArrowRight", shiftKey: true });

  assert.equal(showing(screen.queryByText(/menu over/)), false, "a single letter raised the menu");
});

test("Tab steps into the menu, because nothing in a chapter holds the focus", () => {
  const { chapter, editor } = aChapter();
  render(<ReaderStandIn editor={editor} />);
  pick(chapter, 0, 5);
  fireEvent.keyUp(document, { key: "ArrowRight", shiftKey: true });
  document.body.focus();

  fireEvent.keyDown(document.body, { key: "Tab" });

  const inside = screen.getByRole("group", { name: /passage you picked/i });
  assert.ok(
    document.activeElement && inside.contains(document.activeElement),
    "Tab did not reach the menu, so the buttons cannot be used with the keyboard"
  );
});

test("Escape takes the menu down", () => {
  const { chapter, editor } = aChapter();
  render(<ReaderStandIn editor={editor} />);
  pick(chapter, 0, 5);
  fireEvent.keyUp(document, { key: "ArrowRight", shiftKey: true });
  assert.equal(showing(screen.queryByText(/menu over/)), true, "the menu never came up, so this test proves nothing");

  fireEvent.keyDown(document.body, { key: "Escape" });

  assert.equal(showing(screen.queryByText(/menu over/)), false, "Escape left the menu on screen");
});

test("a dialog on top owns Tab, so the focus never lands in the menu behind it", () => {
  const { chapter, editor } = aChapter();
  render(
    <>
      <ReaderStandIn editor={editor} />
      <TermModal isOpen onClose={() => {}} onSave={() => {}} stagedCitation={null} editingTerm={null} />
    </>
  );
  pick(chapter, 0, 5);
  fireEvent.keyUp(document, { key: "ArrowRight", shiftKey: true });
  assert.equal(showing(screen.queryByText(/menu over/)), true, "the menu never came up, so this test proves nothing");
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog, "the dialog did not open, so this test proves nothing");

  // Tab, not Escape. A dialog stops an Escape from going any further, so Escape can never reach the menu and cannot
  // show the difference. A dialog only asks Tab not to move the page, and the key carries on to every other watcher.
  fireEvent.keyDown(document.body, { key: "Tab" });

  const group = screen.getByRole("group", { name: /passage you picked/i });
  assert.equal(
    document.activeElement !== null && group.contains(document.activeElement),
    false,
    "Tab reached past the open dialog and put the focus in the reader's selection menu"
  );
  assert.equal(
    document.activeElement !== null && dialog.contains(document.activeElement),
    true,
    "Tab left the focus outside the dialog that is on top"
  );
});

test("the menu tells a screen reader what it is for", () => {
  const { chapter, editor } = aChapter();
  render(<ReaderStandIn editor={editor} />);
  pick(chapter, 0, 5);
  fireEvent.keyUp(document, { key: "ArrowRight", shiftKey: true });

  const group = screen.getByRole("group");
  assert.ok(group.getAttribute("aria-label"), "the selection menu has no name a screen reader can say");
});

test("the mouse still raises the menu, so the keyboard was added and nothing was taken away", () => {
  const { chapter, editor } = aChapter();
  render(<ReaderStandIn editor={editor} />);

  pick(chapter, 0, 5);
  fireEvent.mouseUp(screen.getByTestId("chapter-area"));

  assert.ok(screen.getByText("menu over: Price at ^p-001"), "the mouse no longer raises the menu");
});
