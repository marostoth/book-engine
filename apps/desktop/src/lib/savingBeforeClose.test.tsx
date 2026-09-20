// @vitest-environment jsdom

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * DS-17: closing the window must not throw away what the reader just typed.
 *
 * Every saver in the app waits for a pause in the typing, and each of them saved what was waiting in a React
 * unmount cleanup. Closing the window destroys the webview instead of unmounting it, so none of those cleanups
 * ran and the last sentence was lost. The loss is not one pause long: the wait starts again on every keystroke,
 * so a reader who types without pausing has never saved anything since their last pause.
 *
 * The window holds the close back now and asks the page first. These tests are what says the page answers: the
 * savers run, the vault is waited for, and only then is the window told it may close.
 */

const persistNotes = vi.fn<(bookId: string, notesFile: string, text: string) => Promise<void>>(() =>
  Promise.resolve()
);
const fetchNotes = vi.fn<(bookId: string, notesFile: string) => Promise<string>>(() => Promise.resolve(""));

vi.mock("../lib/api", () => ({
  fetchNotes: (bookId: string, notesFile: string) => fetchNotes(bookId, notesFile),
  persistNotes: (bookId: string, notesFile: string, text: string) => persistNotes(bookId, notesFile, text),
}));

const { createSaversBeforeClose, saversBeforeClose, saveWhenTheWindowCloses } = await import("./savingBeforeClose.ts");
const { NotesPane } = await import("../components/NotesPane.tsx");

afterEach(() => {
  cleanup();
  persistNotes.mockReset();
  persistNotes.mockReturnValue(Promise.resolve());
  fetchNotes.mockReset();
  fetchNotes.mockReturnValue(Promise.resolve(""));
});

/** A promise the test settles by hand, so a save can be held open. */
function later<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

// --- The set of savers ---

test("every saver runs, and one that was taken out does not", async () => {
  const savers = createSaversBeforeClose();
  const ran: string[] = [];
  savers.add(() => ran.push("notes"));
  savers.add(() => ran.push("settings"));
  const takeOut = savers.add(() => ran.push("gone"));

  takeOut();
  assert.equal(savers.count(), 2, "taking a saver out left it in the set");
  await savers.saveAll();

  assert.deepEqual(ran.sort(), ["notes", "settings"], "the savers that were added did not all run");
});

test("saveAll waits for the vault to answer before it finishes", async () => {
  const savers = createSaversBeforeClose();
  const vault = later<void>();
  let answered = false;
  savers.add(() => vault.promise.then(() => (answered = true)));

  let finished = false;
  const waiting = savers.saveAll().then(() => (finished = true));

  await Promise.resolve();
  assert.equal(finished, false, "saveAll finished while the vault had not answered, so the window closes too early");

  // The vault answers in its own turn, not in the next microtask, so a flush that gives back nothing cannot
  // pass this by accident.
  setTimeout(() => vault.settle(), 0);
  await waiting;
  assert.equal(answered, true, "the save never finished");
  assert.equal(finished, true, "saveAll never finished after the vault answered");
});

test("a saver that fails does not stop the others, and saveAll still finishes", async () => {
  const savers = createSaversBeforeClose();
  const ran: string[] = [];
  savers.add(() => {
    throw new Error("this saver throws");
  });
  savers.add(() => Promise.reject(new Error("this save was refused")));
  savers.add(() => ran.push("last"));

  await savers.saveAll();
  assert.deepEqual(ran, ["last"], "a failing saver stopped the savers after it");
});

// --- The window is told last ---

test("the window is told it may close only after everything is saved", async () => {
  const savers = createSaversBeforeClose();
  const order: string[] = [];
  const vault = later<void>();
  savers.add(() => vault.promise.then(() => order.push("saved")));

  let ask: () => void = () => {};
  await saveWhenTheWindowCloses(
    (onClosing) => {
      ask = onClosing;
      return Promise.resolve(() => {});
    },
    savers,
    () => {
      order.push("told the window");
      return Promise.resolve();
    },
    () => {}
  );

  ask();
  await Promise.resolve();
  assert.deepEqual(order, [], "the window was told before the save had even started");

  vault.settle();
  await new Promise((done) => setTimeout(done, 0));
  assert.deepEqual(order, ["saved", "told the window"], "the window was not told last");
});

test("the window is told it may close even when a save failed", async () => {
  const savers = createSaversBeforeClose();
  savers.add(() => Promise.reject(new Error("the vault refused the save")));

  let told = false;
  let ask: () => void = () => {};
  await saveWhenTheWindowCloses(
    (onClosing) => {
      ask = onClosing;
      return Promise.resolve(() => {});
    },
    savers,
    () => {
      told = true;
      return Promise.resolve();
    },
    () => {}
  );

  ask();
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(told, true, "a failed save left the window unable to close");
});

test("a window that will not close tells the reader instead of going quiet", async () => {
  const savers = createSaversBeforeClose();
  const told: string[] = [];

  let ask: () => void = () => {};
  await saveWhenTheWindowCloses(
    (onClosing) => {
      ask = onClosing;
      return Promise.resolve(() => {});
    },
    savers,
    () => Promise.reject(new Error("the window did not answer")),
    (action) => told.push(action)
  );

  ask();
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(told.length, 1, "the reader was told nothing when the window would not close");
});

// --- The parts of the app that hold text ---

test("the notes pane saves what the reader typed when the window closes", async () => {
  const before = saversBeforeClose.count();
  render(
    <NotesPane bookId="wealth-of-nations" chapterFile="ch-01.md" insertedQuote={null} onClearInsertedQuote={() => {}} />
  );
  await act(async () => {});

  const box = screen.getByPlaceholderText(/Capture personal reflections/);
  await act(async () => {
    fireEvent.change(box, { target: { value: "Division of labour raises the powers of labour." } });
  });

  assert.equal(persistNotes.mock.calls.length, 0, "the notes saved with no pause in the typing, so this test proves nothing");
  assert.equal(saversBeforeClose.count(), before + 1, "the notes pane did not add itself to the savers");

  await act(async () => {
    await saversBeforeClose.saveAll();
  });

  assert.deepEqual(
    persistNotes.mock.calls,
    [["wealth-of-nations", "ch-01-notes.md", "Division of labour raises the powers of labour."]],
    "closing the window threw away the sentence the reader had just typed"
  );
});

test("a notes pane that was closed is no longer a saver", async () => {
  const before = saversBeforeClose.count();
  const page = render(
    <NotesPane bookId="wealth-of-nations" chapterFile="ch-01.md" insertedQuote={null} onClearInsertedQuote={() => {}} />
  );
  await act(async () => {});
  assert.equal(saversBeforeClose.count(), before + 1, "the notes pane did not add itself, so this test reads nothing");

  page.unmount();
  assert.equal(saversBeforeClose.count(), before, "a pane that is gone still runs when the window closes");
});

// --- Every saver gives back the save it started ---
//
// A saver that starts a save and does not give it back is the same loss with more steps: the webview is gone
// before the vault answers. So each of these waits for the vault, not for the call.

const { createNotesAutosave } = await import("./notesAutosave.ts");
const { createPreferencesSaver, DEFAULT_PREFERENCES } = await import("./preferences.ts");
const { createReadingTimer } = await import("./readingTime.ts");
const { createPlaceWatcher } = await import("./readingPlace.ts");

test("the chapter notes saver can be waited for", async () => {
  const vault = later<void>();
  let saved = false;
  const autosave = createNotesAutosave(800, () => vault.promise.then(() => (saved = true)));
  autosave.change({ bookId: "wealth-of-nations", notesFile: "ch-01-notes.md" }, "A sentence with no pause after it.");

  const waiting = autosave.flush();
  // The vault answers in its own turn, not in the next microtask, so a flush that gives back nothing cannot
  // pass this by accident.
  setTimeout(() => vault.settle(), 0);
  await waiting;
  assert.equal(saved, true, "the window would close while the chapter notes were still on their way to the vault");
});

test("the settings saver can be waited for", async () => {
  const vault = later<void>();
  let saved = false;
  const saver = createPreferencesSaver(
    400,
    () =>
      vault.promise.then(() => {
        saved = true;
      }),
    () => {},
    true
  );
  saver.change(DEFAULT_PREFERENCES);

  const waiting = saver.flush();
  // The vault answers in its own turn, not in the next microtask, so a flush that gives back nothing cannot
  // pass this by accident.
  setTimeout(() => vault.settle(), 0);
  await waiting;
  assert.equal(saved, true, "the window would close while a changed setting was still on its way to the vault");
});

test("the reading timer can be waited for when the chapter leaves the screen", async () => {
  const vault = later<void>();
  let saved = false;
  const timer = createReadingTimer(() => vault.promise.then(() => (saved = true)));
  const chapter = { bookId: "wealth-of-nations", chapterFile: "ch-01.md" };
  timer.show(chapter, 0, true);
  timer.tick(3_000, true);

  const waiting = timer.show(null, 3_000, true);
  // The vault answers in its own turn, not in the next microtask, so a flush that gives back nothing cannot
  // pass this by accident.
  setTimeout(() => vault.settle(), 0);
  await waiting;
  assert.equal(saved, true, "the window would close while this reading session was still on its way to the vault");
});

test("the bookmark watcher can be waited for", async () => {
  const vault = later<void>();
  let saved = false;
  const watcher = createPlaceWatcher(400, () => "p-014", () => vault.promise.then(() => (saved = true)));
  watcher.shown({ bookId: "wealth-of-nations", chapterFile: "ch-01.md" });
  watcher.moved();

  const waiting = watcher.flush();
  // The vault answers in its own turn, not in the next microtask, so a flush that gives back nothing cannot
  // pass this by accident.
  setTimeout(() => vault.settle(), 0);
  await waiting;
  assert.equal(saved, true, "the window would close while the place the reader stopped at was still on its way");
});

// --- The two sides agree on the name of the event ---

// A path from the folder vitest runs in (`apps/desktop`), because this file asks for a DOM and a DOM has no
// file URLs of its own.
const RUST_FILE = path.join(process.cwd(), "src-tauri", "src", "lib.rs");
const RUST = fs.readFileSync(RUST_FILE, "utf8");

/** The Rust source with its comments taken out, so a name that only a comment holds is not read as code. */
function rustCode(): string {
  const lines = RUST.split(/\r?\n/).filter((line) => !line.trimStart().startsWith("//"));
  return lines.join("\n");
}

test("the window and the page use the same name for the event", async () => {
  const { SAVE_BEFORE_CLOSE_EVENT } = await import("./api/windowApi.ts");
  const code = rustCode();
  assert.ok(
    code.includes(`"${SAVE_BEFORE_CLOSE_EVENT}"`),
    `the page listens for "${SAVE_BEFORE_CLOSE_EVENT}" and src-tauri/src/lib.rs sends no such event, so the page `
      + "never hears the window and every close loses what is waiting"
  );
  assert.ok(code.includes("let_the_window_close"), "src-tauri/src/lib.rs has no command for the page to answer with");
});

test("the window holds the close back and asks the page first", () => {
  const code = rustCode();
  assert.ok(code.includes("on_window_event"), "the app registers no window event handler, so no close is ever held back");
  assert.ok(code.includes("CloseRequested"), "the app handles no CloseRequested, so the X button closes at once");
  assert.ok(code.includes("prevent_close"), "the app never holds a close back, so the page has no time to save");
});
