// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SyntopicControversy, NeutralTerm } from "../lib/types/syntopicon";
import type { AuthorInquiry } from "../lib/types/analytical";

/**
 * A citation whose chapter nobody chose does not claim chapter one (RD-16).
 *
 * Every imported book has a `ch-01.md`, so a citation that fell back to it pointed at a real chapter, and in the
 * syntopicon at a real paragraph of it, which does not hold the quote. The analytical side already wrote a name that
 * no chapter has, `unknown.md`, and says so in `formStart.test.ts`. These are the three windows that did not.
 *
 * The windows are the real ones, filled in as a reader fills them in, and the test reads what they hand to `onSave`.
 */

const { ControversyModal } = await import("./syntopicon/ControversyModal.tsx");
const { NeutralTermModal } = await import("./syntopicon/NeutralTermModal.tsx");
const { InquiryModal } = await import("./analytical/InquiryModal.tsx");

/** The name a citation carries when no chapter was chosen. No chapter the importer writes has it. */
const NO_CHAPTER = "unknown.md";

const QUESTIONS = [{ id: "q-1", question: "Does the division of labour make the worker less able?", order: 0 }];

afterEach(cleanup);

function type(placeholder: string | RegExp, text: string) {
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: text } });
}

function chapterField(): HTMLInputElement {
  return screen.getByPlaceholderText(/Chapter file/) as HTMLInputElement;
}

function saveAControversy(currentChapterFile: string | undefined, typedChapter?: string): SyntopicControversy[] {
  const saved: SyntopicControversy[] = [];
  render(
    <ControversyModal
      isOpen
      onClose={() => {}}
      onSave={(controversy) => saved.push(controversy)}
      questions={QUESTIONS}
      stagedCitation={null}
      editingControversy={null}
      currentBookId="wealth-of-nations"
      currentChapterFile={currentChapterFile}
    />
  );
  type(/Cognitive Stultification/, "Stultification against dexterity");
  type(/Author's stance/, "The worker who does one thing grows less able.");
  if (typedChapter !== undefined) type(/Chapter file/, typedChapter);
  type(/Anchor/, "^p-005");
  type(/Verbatim quote/, "The man whose whole life is spent in performing a few simple operations");
  fireEvent.click(screen.getByText(/Add Author Perspective/));
  fireEvent.click(screen.getByText("Save Controversy"));
  return saved;
}

function saveANeutralTerm(currentChapterFile: string | undefined): NeutralTerm[] {
  const saved: NeutralTerm[] = [];
  render(
    <NeutralTermModal
      isOpen
      onClose={() => {}}
      onSave={(term) => saved.push(term)}
      stagedCitation={null}
      editingTerm={null}
      currentBookId="wealth-of-nations"
      currentChapterFile={currentChapterFile}
    />
  );
  type(/Division of Labor \/ Operational/, "Specialization");
  type(/Synthesized definition/, "One worker doing one part of the work.");
  type(/Author's phrasing/, "division of labour");
  type(/Anchor/, "^p-005");
  fireEvent.click(screen.getByText(/Attach Author Mapping/));
  fireEvent.click(screen.getByText("Save Neutral Term"));
  return saved;
}

test("a new controversy with no chapter open shows an empty chapter field, not chapter one", () => {
  render(
    <ControversyModal
      isOpen
      onClose={() => {}}
      onSave={() => {}}
      questions={QUESTIONS}
      stagedCitation={null}
      editingControversy={null}
      currentBookId="wealth-of-nations"
      currentChapterFile={undefined}
    />
  );
  assert.equal(chapterField().value, "", "the field says ch-01.md, a chapter the reader never chose");
});

test("a perspective saved with no chapter chosen names no chapter the book has", () => {
  const [controversy] = saveAControversy(undefined);
  assert.ok(controversy, "the controversy was not saved, so this test proves nothing");
  const [citation] = controversy.perspectives[0].citations;
  assert.ok(citation, "the perspective kept no citation, so this test proves nothing");
  assert.equal(citation.chapterFile, NO_CHAPTER, "the citation claims a chapter nobody chose");
  assert.equal(citation.anchor, "^p-005", "the anchor the reader typed must be kept");
});

test("a new neutral term with no chapter open shows an empty chapter field, not chapter one", () => {
  render(
    <NeutralTermModal
      isOpen
      onClose={() => {}}
      onSave={() => {}}
      stagedCitation={null}
      editingTerm={null}
      currentBookId="wealth-of-nations"
      currentChapterFile={undefined}
    />
  );
  assert.equal(chapterField().value, "", "the field says ch-01.md, a chapter the reader never chose");
});

test("a term mapping saved with no chapter chosen names no chapter the book has", () => {
  const [term] = saveANeutralTerm(undefined);
  assert.ok(term, "the neutral term was not saved, so this test proves nothing");
  assert.equal(term.mappings[0].citation.chapterFile, NO_CHAPTER, "the mapping claims a chapter nobody chose");
});

test("a new inquiry saved with no chapter open names no chapter the book has", async () => {
  const saved: AuthorInquiry[] = [];
  render(
    <InquiryModal
      isOpen
      onClose={() => {}}
      onSave={async (inquiry) => {
        saved.push(inquiry);
      }}
      argumentsList={[]}
      editingInquiry={null}
    />
  );
  type(/What question is the author trying to answer/, "Why does the market limit the division of labour?");
  fireEvent.click(screen.getByText("Save Inquiry"));
  await new Promise((settled) => setTimeout(settled, 0));
  assert.ok(saved[0], "the inquiry was not saved, so this test proves nothing");
  assert.equal(saved[0].citation?.chapterFile, NO_CHAPTER, "the inquiry claims a chapter nobody chose");
});

test("the chapter open now, or the one the reader typed, is still the chapter a citation names", () => {
  const [openNow] = saveAControversy("ch-09.md");
  assert.equal(openNow.perspectives[0].citations[0].chapterFile, "ch-09.md");
  cleanup();

  const [typed] = saveAControversy(undefined, "ch-03.md");
  assert.equal(typed.perspectives[0].citations[0].chapterFile, "ch-03.md");
  cleanup();

  const [term] = saveANeutralTerm("ch-09.md");
  assert.equal(term.mappings[0].citation.chapterFile, "ch-09.md");
});
