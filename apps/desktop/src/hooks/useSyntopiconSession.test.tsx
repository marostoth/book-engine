// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { SyntopicTopic, SyntopicTopicSummary } from "../lib/types/syntopicon.ts";

/**
 * TL-11: the first load of the syntopicon opens the first topic only while no topic is open.
 *
 * It asked the DRAWING it belongs to which topic was open. That drawing is the one from before the list of topics
 * was even asked for, so the answer is always "none", however long the list takes and whatever the reader did in
 * the meantime. `react-hooks/exhaustive-deps` said the effect never named the value it was reading.
 *
 * It asks the state itself now, through the setter, so the answer is the one that is true when the list arrives.
 */

const getSyntopicTopics = vi.fn<() => Promise<SyntopicTopicSummary[]>>();
const getSyntopicTopic = vi.fn<(topicId: string) => Promise<SyntopicTopic>>();

vi.mock("../lib/api/syntopiconApi.ts", () => ({
  getSyntopicTopics: () => getSyntopicTopics(),
  getSyntopicTopic: (topicId: string) => getSyntopicTopic(topicId),
  createSyntopicTopic: () => Promise.reject(new Error("not used by this test")),
  saveSyntopicTopic: () => Promise.resolve(),
  exportSyntopicReport: () => Promise.resolve("report.md"),
}));

const { useSyntopiconSession } = await import("./useSyntopiconSession.ts");

type Session = ReturnType<typeof useSyntopiconSession>;

function summary(id: string): SyntopicTopicSummary {
  return {
    id,
    title: id,
    description: "",
    termCount: 0,
    questionCount: 0,
    controversyCount: 0,
    booksInvolved: [],
    createdAt: "2026-09-20T00:00:00Z",
  };
}

function topic(id: string): SyntopicTopic {
  return {
    id,
    title: id,
    description: "",
    neutralTerms: [],
    questions: [],
    controversies: [],
    createdAt: "2026-09-20T00:00:00Z",
  };
}

/** A promise the test settles by hand, so the list can be held back while the reader picks a topic. */
function later<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

async function settleAll(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Draws the hook and records every drawing, so the last one can be read and used. */
function drawHook(): Session[] {
  const drawings: Session[] = [];
  const Probe: React.FC = () => {
    drawings.push(useSyntopiconSession());
    return null;
  };
  render(<Probe />);
  return drawings;
}

afterEach(() => {
  cleanup();
  getSyntopicTopics.mockReset();
  getSyntopicTopic.mockReset();
});

test("the first topic in the list is opened when the reader has opened none", async () => {
  getSyntopicTopics.mockResolvedValue([summary("justice"), summary("liberty")]);
  getSyntopicTopic.mockImplementation((id) => Promise.resolve(topic(id)));

  const drawings = drawHook();
  await settleAll();

  assert.equal(
    drawings[drawings.length - 1].activeTopicId,
    "justice",
    "the syntopicon opened on no topic at all, so the reader sees an empty page with a list beside it"
  );
});

test("a topic the reader opened while the list was still coming is the one that stays open", async () => {
  const list = later<SyntopicTopicSummary[]>();
  getSyntopicTopics.mockReturnValue(list.promise);
  getSyntopicTopic.mockImplementation((id) => Promise.resolve(topic(id)));

  const drawings = drawHook();
  // The reader opens "liberty" from somewhere other than the list, before the list is there.
  act(() => drawings[drawings.length - 1].selectTopic("liberty"));

  list.settle([summary("justice"), summary("liberty")]);
  await settleAll();

  assert.equal(
    drawings[drawings.length - 1].activeTopicId,
    "liberty",
    "the list arriving threw away the topic the reader had opened and put the first topic there instead (TL-11)"
  );
});

test("an empty list opens no topic, and the spinner still stops", async () => {
  getSyntopicTopics.mockResolvedValue([]);

  const drawings = drawHook();
  await settleAll();

  const last = drawings[drawings.length - 1];
  assert.equal(last.activeTopicId, null, "a reader with no topics yet must not have one opened for them");
  assert.equal(last.loading, false, "the syntopicon spins for ever when the reader has no topics yet");
});
