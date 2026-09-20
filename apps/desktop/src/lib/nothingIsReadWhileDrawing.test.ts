import { test } from "vitest";
import assert from "node:assert/strict";
import { createNotesAutosave } from "./notesAutosave.ts";
import { createPlaceWatcher } from "./readingPlace.ts";
import { readerEditorOptions, type ChapterClick } from "../components/reader/readerEditorOptions.ts";

/**
 * TL-11: three things the app builds once take a handler that reads a ref, and none of them uses it while drawing.
 *
 * `react-hooks/refs` says a component must not read a ref while it is drawing, because React does not draw again
 * when a ref changes, so what reaches the screen can be older than the ref. That rule is right, and three places
 * in this app carry an `eslint-disable-next-line` for it:
 *
 * - `NotesPane.tsx` builds its autosave once, and the autosave's save function reads whether the pane is still open.
 * - `Reader.tsx` builds its place watcher once, and the watcher reads the paragraph in the middle of the screen.
 * - `Reader.tsx` builds its editor options once, and the click handler reads the footnotes of the chapter.
 *
 * Each of those handlers runs on a timer, a promise or a click, which is long after the drawing that built it.
 * The rule cannot see that: it says "passing a ref to a function MAY read its value during render", and stops at
 * the edge of the function. THESE TESTS ARE WHAT CHECKS THE CLAIM. Each one hands the maker a handler that would
 * shout if it were called, and then does not call anything.
 *
 * If one of these three ever starts reading its handler while being made, the disable in the component becomes a
 * lie, and the test below is what says so.
 */

/** A handler that records being called, so "it was never called" is something a test can say. */
function shouter(): { calls: number; handler: () => never } {
  const record = { calls: 0, handler: (): never => {
    record.calls += 1;
    throw new Error("called while being made");
  } };
  return record;
}

test("building the notes autosave never calls the save function (TL-11)", () => {
  const save = shouter();
  const autosave = createNotesAutosave(500, save.handler);

  assert.equal(
    save.calls,
    0,
    "createNotesAutosave called its save function while the notes pane was drawing. That save reads whether the " +
      "pane is still open, out of a ref, so the disable of react-hooks/refs in NotesPane.tsx is no longer true."
  );
  assert.equal(autosave.isPending(), false, "a fresh autosave must have nothing waiting");
});

test("building the place watcher never reads the paragraph on screen, and reports nothing (TL-11)", () => {
  const readAnchor = shouter();
  const report = shouter();
  const watcher = createPlaceWatcher(400, readAnchor.handler, report.handler);

  assert.equal(
    readAnchor.calls,
    0,
    "createPlaceWatcher read the paragraph on screen while the reader was drawing. That read takes the container " +
      "out of a ref, so the disable of react-hooks/refs in Reader.tsx is no longer true."
  );
  assert.equal(report.calls, 0, "createPlaceWatcher reported a place before the reader had shown one");

  // Nothing is on screen yet, so a flush must still report nothing. This is the one call the reader makes on the
  // drawing after it is built, through a layout effect.
  watcher.flush();
  assert.equal(report.calls, 0, "a watcher that was never shown a chapter reported a place anyway");
});

test("building the reader's editor options never calls the click handler (TL-11)", () => {
  let calls = 0;
  const handleClick: ChapterClick = () => {
    calls += 1;
    return false;
  };
  const options = readerEditorOptions(handleClick);

  assert.equal(
    calls,
    0,
    "readerEditorOptions called the click handler while the reader was drawing. That handler reads the chapter's " +
      "footnotes out of a ref, so the disable of react-hooks/refs in Reader.tsx is no longer true."
  );
  assert.equal(
    options.editorProps?.handleClick,
    handleClick,
    "the options must hand TipTap the very same click handler, or the reader builds its editor again (RD-06)"
  );
});
