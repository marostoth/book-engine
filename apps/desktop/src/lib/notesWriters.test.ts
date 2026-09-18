import { test } from "vitest";
import assert from "node:assert/strict";
import type { HighlightItem } from "./types.ts";

// The chapter notes and the highlights have one writer each, so neither can erase the other (DS-05).
// Before this, a new highlight was written into the notes file, and the notes pane saved the text it
// had loaded a moment earlier over it.

// The Tauri window of the app, with a backend that writes down every command it is asked to run.
const commands: { cmd: string; args: Record<string, unknown> }[] = [];
Object.assign(globalThis, {
  window: {
    __TAURI_INTERNALS__: {
      invoke: async (cmd: string, args: Record<string, unknown>) => {
        commands.push({ cmd, args });
        return cmd === "get_chapter_highlights" ? [] : undefined;
      },
    },
  },
  localStorage: { getItem: () => null, setItem: () => undefined },
});
const api = await import("./api.ts");

const highlight: HighlightItem = {
  id: "hl-1",
  exact: "the division of labour",
  prefix: "",
  suffix: "",
  anchor: "^p-001",
  color: "yellow",
  createdAt: "2026-09-16T10:00:00Z",
};

/** The commands one call asked the backend to run. */
async function commandsOf(call: () => Promise<unknown>): Promise<string[]> {
  commands.length = 0;
  await call();
  return commands.map((entry) => entry.cmd);
}

test("saving a highlight never writes the chapter notes", async () => {
  const ran = await commandsOf(() => api.saveChapterHighlights("sample", "ch-01.md", [highlight]));

  assert.deepEqual(ran, ["save_chapter_highlights"]);
  assert.deepEqual(commands[0].args, {
    bookId: "sample",
    chapterFile: "ch-01.md",
    highlights: [highlight],
  });
});

test("loading the highlights never reads the chapter notes", async () => {
  const ran = await commandsOf(() => api.getChapterHighlights("sample", "ch-01.md"));

  assert.deepEqual(ran, ["get_chapter_highlights"]);
  assert.deepEqual(commands[0].args, { bookId: "sample", chapterFile: "ch-01.md" });
});

test("saving the chapter notes never writes the highlights", async () => {
  const ran = await commandsOf(() => api.persistNotes("sample", "ch-01-notes.md", "# my notes\n"));

  assert.deepEqual(ran, ["save_notes"]);
});

test("the notes pane and the highlights use different backend commands", async () => {
  const notes = await commandsOf(() => api.fetchNotes("sample", "ch-01-notes.md"));
  const highlights = await commandsOf(() => api.getChapterHighlights("sample", "ch-01.md"));

  assert.equal(notes.length, 1);
  assert.equal(highlights.length, 1);
  assert.notEqual(notes[0], highlights[0], "one command must never do both jobs");
});
