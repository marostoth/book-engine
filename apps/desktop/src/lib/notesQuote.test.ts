import { test, vi, onTestFinished } from "vitest";
import assert from "node:assert/strict";
import { addQuoteToNotes, quoteBlock, type NotesLoadState } from "./notesQuote.ts";
import { createNotesAutosave, type NotesTarget } from "./notesAutosave.ts";

const DELAY = 800;
const CHAPTER_ONE: NotesTarget = { bookId: "adler", notesFile: "ch-01-notes.md" };
const CHAPTER_TWO: NotesTarget = { bookId: "adler", notesFile: "ch-02-notes.md" };
const QUOTE = { quote: "the art of reading", anchorId: "p-007" };

/** The notes pane, as far as a quote is concerned: the two shipped modules, wired the way the pane wires them. */
function pane(loadState: NotesLoadState, notes: string) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });

  const saves: { target: NotesTarget; text: string }[] = [];
  const refusals: string[] = [];
  const autosave = createNotesAutosave(DELAY, (target, text) => saves.push({ target, text }));
  let shown = notes;
  let target = CHAPTER_ONE;

  return {
    saves,
    refusals,
    onScreen: () => shown,
    /** A quote arrives from the selection menu. */
    receive(quote: { quote: string; anchorId?: string } | null) {
      addQuoteToNotes(loadState, shown, quote, target, autosave, {
        show: (withQuote) => {
          shown = withQuote;
        },
        refuse: (message) => {
          refusals.push(message);
        },
      });
    },
    type(text: string) {
      shown = text;
      autosave.change(target, text);
    },
    /** The reader leaves the chapter, so the pane closes and saves what is waiting. */
    close() {
      autosave.flush();
      target = CHAPTER_TWO;
    },
    wait: (ms: number) => vi.advanceTimersByTime(ms),
  };
}

test("a quote is saved without waiting for the reader to type", () => {
  const notes = pane("ready", "# Reflections\n\n- my first thought\n");

  notes.receive(QUOTE);

  assert.equal(notes.saves.length, 1, "the quote must reach the vault on its own");
  assert.equal(notes.saves[0].target.notesFile, "ch-01-notes.md");
  assert.match(notes.saves[0].text, /> "the art of reading" \(#p-007\)/);
  assert.match(notes.saves[0].text, /- my first thought/, "the reader's own text must stay");
});

test("a quote is still in the file after the reader moves to another chapter", () => {
  const notes = pane("ready", "# Reflections\n");

  notes.receive(QUOTE);
  notes.close();

  const written = notes.saves.filter((save) => save.text.includes("the art of reading"));
  assert.equal(written.length, 1, "the quote must be written exactly once");
  assert.equal(written[0].target.notesFile, "ch-01-notes.md", "and into the chapter it was taken from");
});

test("a quote waits while the notes are still being read from the disk", () => {
  const notes = pane("loading", "");

  notes.receive(QUOTE);
  notes.wait(DELAY * 2);

  assert.deepEqual(notes.saves, [], "an empty notes file must not be saved over the reader's notes");
  assert.equal(notes.onScreen(), "", "the quote must not go on screen, where the notes that arrive would wipe it");
  assert.deepEqual(notes.refusals, [], "waiting is not a refusal: the pane asks again when the notes are there");
});

test("the quote is added once the notes are there", () => {
  const notes = pane("ready", "# Reflections\n\n- what the notes file really holds\n");

  notes.receive(QUOTE);

  assert.equal(notes.saves.length, 1);
  assert.match(notes.saves[0].text, /- what the notes file really holds/);
  assert.match(notes.saves[0].text, /the art of reading/);
});

test("notes that did not load never take a quote", () => {
  const notes = pane("failed", "");

  notes.receive(QUOTE);

  assert.deepEqual(notes.saves, [], "a locked pane must not write to the vault");
  assert.deepEqual(notes.refusals, ["The quote was not added to your notes."], "the reader must be told");
});

test("a quote sent while a keystroke is waiting keeps both", () => {
  const notes = pane("ready", "");

  notes.type("# Reflections\n\n- half a sentence");
  notes.receive(QUOTE);

  assert.ok(notes.saves.length > 0, "the quote must be saved");
  const last = notes.saves[notes.saves.length - 1];
  assert.match(last.text, /- half a sentence/, "the typed words must not be lost");
  assert.match(last.text, /the art of reading/, "and the quote must be there too");
});

test("two quotes both reach the notes file", () => {
  const notes = pane("ready", "# Reflections\n");

  notes.receive({ quote: "first quote", anchorId: "p-001" });
  notes.receive({ quote: "second quote", anchorId: "p-002" });

  assert.ok(notes.saves.length > 0, "the quotes must be saved");
  const last = notes.saves[notes.saves.length - 1];
  assert.match(last.text, /first quote/);
  assert.match(last.text, /second quote/);
});

test("no quote means nothing happens", () => {
  const notes = pane("ready", "# Reflections\n");

  notes.receive(null);
  notes.wait(DELAY * 2);

  assert.deepEqual(notes.saves, []);
  assert.equal(notes.onScreen(), "# Reflections\n");
});

test("a quote without a paragraph anchor is added without one", () => {
  assert.equal(quoteBlock({ quote: "a line with no anchor" }), '\n\n> "a line with no anchor"\n\n- Reflection: \n');
});

test("the quote block starts on a blank line, so it never joins the line before it", () => {
  const notes = pane("ready", "- a line with no newline at the end");

  notes.receive(QUOTE);

  const lines = notes.onScreen().split("\n");
  assert.equal(lines[0], "- a line with no newline at the end");
  assert.equal(lines[1], "", "a blank line must separate the reader's text from the quote");
  assert.match(lines[2], /^> "/);
});
