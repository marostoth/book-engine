// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AggregatedNoteItem } from "../../lib/types.ts";
import { NoteEntryCard } from "./NoteEntryCard.tsx";

/**
 * A word saved before the app kept chapters has no chapter, so there is nowhere to jump to. Two things refuse
 * that click: this card, which offers no jump at all, and `NotesDrawer`, which would not navigate either. Each
 * one is proved here and there, because a mutation that removes one of them must not be hidden by the other.
 */

function word(over: Partial<AggregatedNoteItem> = {}): AggregatedNoteItem {
  return {
    id: "word:quorum",
    item_type: "word",
    chapter_file: "ch-02.md",
    chapter_title: "Two",
    chapter_order: 1,
    anchor: "^p-005",
    text: "The smallest number of people who may decide.",
    section_heading: "quorum",
    ...over,
  };
}

afterEach(cleanup);

test("a word is marked as a word, so the reader can tell it from a note", () => {
  render(<NoteEntryCard entry={word()} onClick={() => {}} />);

  assert.equal(screen.queryAllByText("Word").length, 1);
});

test("a word with a chapter offers the jump, and the click goes through", () => {
  let clicks = 0;
  render(<NoteEntryCard entry={word()} onClick={() => (clicks += 1)} />);

  assert.equal(screen.queryAllByText("Jump to text").length, 1);
  fireEvent.click(screen.getByText("quorum"));

  assert.equal(clicks, 1);
});

test("a word with no chapter offers no jump, and the click does nothing", () => {
  let clicks = 0;
  render(<NoteEntryCard entry={word({ chapter_file: "", anchor: null })} onClick={() => (clicks += 1)} />);

  fireEvent.click(screen.getByText("quorum"));

  assert.equal(clicks, 0, "the card offered a jump for a word that has nowhere to go");
  assert.equal(screen.queryAllByText("Jump to text").length, 0);
  assert.equal(screen.queryAllByText(/Saved before the app kept the place/).length, 1);
});

test("a word saved with no meaning says so, instead of showing an empty line", () => {
  render(<NoteEntryCard entry={word({ text: "" })} onClick={() => {}} />);

  assert.equal(screen.queryAllByText(/No meaning was saved with this word/).length, 1);
});

test("a highlight is still a quotation, and a note is still plain text", () => {
  render(
    <NoteEntryCard
      entry={word({ id: "h1", item_type: "highlight", text: "A marked sentence.", section_heading: null })}
      onClick={() => {}}
    />
  );

  assert.equal(screen.queryAllByText("Highlight").length, 1);
  assert.equal(screen.queryAllByText("Word").length, 0);
});
