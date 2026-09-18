import { test, vi, onTestFinished } from "vitest";
import assert from "node:assert/strict";
import { createNotesAutosave, type NotesTarget } from "./notesAutosave.ts";

const DELAY = 800;

const CHAPTER_ONE: NotesTarget = { bookId: "adler", notesFile: "ch-01-notes.md" };
const CHAPTER_TWO: NotesTarget = { bookId: "adler", notesFile: "ch-02-notes.md" };

/** An autosave whose saves are recorded, on a clock this test moves by hand. */
function autosaveUnderTest() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });

  const saves: { target: NotesTarget; text: string }[] = [];
  const autosave = createNotesAutosave(DELAY, (target, text) => saves.push({ target, text }));
  return { autosave, saves, wait: (ms: number) => vi.advanceTimersByTime(ms) };
}

test("the words you typed are saved into the chapter you typed them in", () => {
  const { autosave, saves, wait } = autosaveUnderTest();

  autosave.change(CHAPTER_ONE, "my notes on chapter one");
  // The reader moves to chapter two before the save is due. The notes pane closes and flushes.
  autosave.flush();

  assert.deepEqual(saves, [{ target: CHAPTER_ONE, text: "my notes on chapter one" }]);
  assert.notEqual(
    saves[0].target.notesFile,
    CHAPTER_TWO.notesFile,
    "chapter one's notes may never go into chapter two's file"
  );

  wait(DELAY * 2);
  assert.equal(saves.length, 1, "the timer must not save the same text again");
});

test("nothing is saved when you leave with nothing typed", () => {
  const { autosave, saves } = autosaveUnderTest();

  autosave.flush();

  assert.deepEqual(saves, [], "leaving a chapter you did not type in must not write to the vault");
});

test("typing fast makes one save, with the last words", () => {
  const { autosave, saves, wait } = autosaveUnderTest();

  autosave.change(CHAPTER_ONE, "a");
  wait(100);
  autosave.change(CHAPTER_ONE, "ab");
  wait(100);
  autosave.change(CHAPTER_ONE, "abc");
  wait(DELAY);

  assert.deepEqual(saves, [{ target: CHAPTER_ONE, text: "abc" }]);
});

test("the save happens by itself when the typing stops", () => {
  const { autosave, saves, wait } = autosaveUnderTest();

  autosave.change(CHAPTER_ONE, "my notes");
  wait(DELAY - 1);
  assert.deepEqual(saves, [], "the save must wait for the typing to stop");

  wait(1);
  assert.deepEqual(saves, [{ target: CHAPTER_ONE, text: "my notes" }]);
});

test("a text is waiting only until it is saved", () => {
  const { autosave, wait } = autosaveUnderTest();

  assert.equal(autosave.isPending(), false);
  autosave.change(CHAPTER_ONE, "my notes");
  assert.equal(autosave.isPending(), true);
  wait(DELAY);
  assert.equal(autosave.isPending(), false);
});

test("typing again after a save starts a new one", () => {
  const { autosave, saves, wait } = autosaveUnderTest();

  autosave.change(CHAPTER_ONE, "first");
  wait(DELAY);
  autosave.change(CHAPTER_ONE, "first and second");
  wait(DELAY);

  assert.deepEqual(saves, [
    { target: CHAPTER_ONE, text: "first" },
    { target: CHAPTER_ONE, text: "first and second" },
  ]);
});
