// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { SyntopicTopic, SyntopicTopicSummary } from "../../lib/types/syntopicon.ts";
import { saversBeforeClose } from "../../lib/savingBeforeClose.ts";

/**
 * RD-12: one sentence typed into the Synthesis tab writes the topic file once.
 *
 * The clean-up that saves on leaving the tab was keyed on the topic and on `saveSynthesis`. A save gives the topic a
 * new object, so both changed, the clean-up ran, and it saved again, because the timer it asked was never cleared
 * when it fired. Every save started the next one: 51 writes for one sentence in the running app, each one reading
 * every topic file back.
 *
 * These tests draw the real tab on the real session hook. Only the calls to the backend are counted and held.
 */

const saved: SyntopicTopic[] = [];
let listReads = 0;
/** The answer to the next save. A test replaces it to hold a save on its way. */
let saveAnswer: () => Promise<void> = () => Promise.resolve();

vi.mock("../../lib/api/syntopiconApi.ts", () => ({
  getSyntopicTopics: () => {
    listReads += 1;
    return Promise.resolve([summary]);
  },
  getSyntopicTopic: (id: string) => Promise.resolve(id === liberty.id ? liberty : topic),
  createSyntopicTopic: () => Promise.resolve(liberty),
  saveSyntopicTopic: (t: SyntopicTopic) => {
    saved.push(t);
    return saveAnswer();
  },
  exportSyntopicReport: () => Promise.resolve("syntopicon/reports/justice.md"),
}));

const { useSyntopiconSession } = await import("../../hooks/useSyntopiconSession.ts");
const { SynthesisTab } = await import("./SynthesisTab.tsx");

const topic: SyntopicTopic = {
  id: "justice",
  title: "Justice",
  description: "",
  neutralTerms: [],
  questions: [],
  controversies: [],
  createdAt: "2026-09-20T00:00:00Z",
};

/** The topic the reader makes while on the tab. */
const liberty: SyntopicTopic = { ...topic, id: "liberty", title: "Liberty" };

const summary: SyntopicTopicSummary = {
  id: "justice",
  title: "Justice",
  description: "",
  termCount: 0,
  questionCount: 0,
  controversyCount: 0,
  booksInvolved: [],
  createdAt: "2026-09-20T00:00:00Z",
};

const SENTENCE = "Each author means something else by fair.";

/**
 * More writes than any test here makes. The old loop never stops and never lets the clock run, so a test of it hung
 * until the worker was killed. Past this many writes the pane takes the tab away, which ends the loop, and the test
 * fails on its count instead.
 */
const RUNAWAY = 50;

/** The pane, cut down to the Synthesis tab and a button that leaves it, as a click on another tab does. */
const Pane: React.FC = () => {
  const session = useSyntopiconSession();
  const [onTab, setOnTab] = useState(true);
  return (
    <>
      <button onClick={() => setOnTab(false)}>Leave the tab</button>
      <button onClick={() => void session.createTopic("Liberty", "")}>Make a new topic</button>
      {session.loading ? <p>Loading</p> : null}
      {onTab && saved.length <= RUNAWAY && session.activeTopic ? <SynthesisTab session={session} /> : null}
    </>
  );
};

/** Lets the clock run, and lets every promise that was waiting on it settle. */
async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function openTab(): Promise<void> {
  render(<Pane />);
  await wait(0);
  assert.ok(notesBox(), "the tab never opened, so every count below would be about nothing");
  saved.length = 0;
  listReads = 0;
}

function notesBox(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(/^Examine the intellectual tension/) as HTMLTextAreaElement;
}

/** Types the sentence one letter at a time, as a reader does. */
function typeSentence(): void {
  for (let end = 1; end <= SENTENCE.length; end += 1) {
    fireEvent.change(notesBox(), { target: { value: SENTENCE.slice(0, end) } });
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  saved.length = 0;
  listReads = 0;
  saveAnswer = () => Promise.resolve();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("one sentence typed into the notes is written to the topic file once", async () => {
  await openTab();
  typeSentence();
  await wait(800);
  // Long after the typing stopped: nothing is waiting, so nothing more is written.
  await wait(10_000);

  assert.equal(saved.length, 1, `one sentence wrote the topic file ${saved.length} times (RD-12)`);
  assert.equal(saved[0].synthesisNotes, SENTENCE, "the one write did not hold the sentence");
  assert.equal(listReads, 1, `one save read the list of topics back ${listReads} times`);
});

test("leaving the tab while the words wait saves them once", async () => {
  await openTab();
  typeSentence();
  fireEvent.click(screen.getByText("Leave the tab"));
  await wait(10_000);

  assert.equal(saved.length, 1, `leaving the tab wrote the topic file ${saved.length} times`);
  assert.equal(saved[0].synthesisNotes, SENTENCE, "leaving the tab lost the words that were waiting");
});

test("leaving the tab after the words were saved writes nothing more", async () => {
  await openTab();
  typeSentence();
  await wait(800);
  fireEvent.click(screen.getByText("Leave the tab"));
  await wait(10_000);

  assert.equal(saved.length, 1, `words that were already saved were written ${saved.length} times`);
});

test("closing the window waits for a save that is already on its way, and does not start a second", async () => {
  let answer!: () => void;
  saveAnswer = () => new Promise<void>((resolve) => { answer = resolve; });
  await openTab();
  typeSentence();
  await wait(800);
  assert.ok(saved.length >= 1, "the typing never started its save, so the rest of this test proves nothing");

  let closed = false;
  const closing = saversBeforeClose.saveAll().then(() => { closed = true; });
  await wait(0);
  assert.equal(closed, false, "the window was let go while the vault had not yet answered the save");
  assert.equal(saved.length, 1, "closing the window wrote the words a second time");

  answer();
  await act(async () => { await closing; });
  assert.equal(closed, true, "the window never closed after the vault answered");
});

test("exporting saves the words that wait once, and leaving the tab after it writes nothing more", async () => {
  await openTab();
  typeSentence();
  fireEvent.click(screen.getByText("Export Dialectical Dossier"));
  await wait(0);
  // The tab saves the words, then the export saves the topic it is about to read (Save-Before-Export).
  assert.equal(saved.length, 2, `the export wrote the topic file ${saved.length} times, not 2`);
  assert.equal(saved[0].synthesisNotes, SENTENCE, "the export went ahead without the words that were waiting");

  fireEvent.click(screen.getByText("Leave the tab"));
  await wait(10_000);
  assert.equal(saved.length, 2, "leaving the tab wrote words the export had already saved");
});

test("making a new topic while the words wait saves them to the topic they were typed about, and opens the new one", async () => {
  await openTab();
  typeSentence();
  fireEvent.click(screen.getByText("Make a new topic"));
  // The new topic opens at once, as it does in the app, and only then does the clock run past the pause.
  await wait(0);
  await wait(0);
  assert.equal(notesBox().value, "", "the new topic never opened, so the rest of this test proves nothing");
  await wait(10_000);

  assert.equal(saved.length, 1, `the words were written ${saved.length} times`);
  assert.equal(saved[0].id, "justice", "the words were saved into the new topic, not the one they were typed about");
  assert.equal(saved[0].synthesisNotes, SENTENCE, "the words that were waiting were lost");
  // A save of the old topic, made after the new one had opened, put the old topic back and left the pane loading.
  assert.equal(screen.queryByText("Loading"), null, "the pane is still loading long after the new topic was made");
  assert.equal(notesBox().value, "", "the tab shows words that belong to another topic");
});
