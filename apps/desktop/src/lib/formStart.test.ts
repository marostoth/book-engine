import { test } from "vitest";
import assert from "node:assert/strict";
import type { ArgumentNode, AuthorInquiry, AuthorTerm, CritiqueItem } from "./types/analytical.ts";
import type { NeutralTerm, SyntopicControversy, SyntopicQuestion } from "./types/syntopicon.ts";
import type { ExitAssessmentPayload } from "./types.ts";
import {
  argumentFormStart,
  controversyFormStart,
  critiqueFormStart,
  exitAssessmentFormStart,
  formKey,
  inquiryFormStart,
  neutralTermFormStart,
  NO_CHAPTER_CHOSEN,
  termFormStart,
} from "./formStart.ts";

/**
 * TL-11: what a form holds the moment it opens.
 *
 * Seven windows used to fill themselves inside an effect, and each one now works its start value out here instead.
 * These are the branches that effect had, read without a browser. What happens on screen - that a window opened for
 * a new thing shows empty fields, and one opened for a thing being edited shows filled ones - is in
 * `components/formStart.test.tsx`, which renders the real windows.
 */

const place = { chapterFile: "ch-03.md", anchor: "^p-0012", quote: "The market limits the division of labour." };

// ------------------------------------------------------------------------------------------------- the form key

test("two forms that hold different things get different keys", () => {
  assert.notEqual(formKey(["term-1"]), formKey(["term-2"]), "React would keep the old form and show the wrong words");
});

test("a part that is missing counts as an empty one", () => {
  assert.equal(formKey([null, "a"]), formKey(["", "a"]), "nothing and an empty string are the same absent part");
  assert.equal(formKey([undefined, "a"]), formKey(["", "a"]), "an absent prop must read the same as an empty one");
});

test("the parts of a key cannot run into one another", () => {
  assert.notEqual(
    formKey(["ab", ""]),
    formKey(["a", "b"]),
    "the parts are glued together, so two different forms share one key and the second never gets built"
  );
});

test("the same parts give the same key every time", () => {
  assert.equal(
    formKey(["term-1", "ch-03.md"]),
    formKey(["term-1", "ch-03.md"]),
    "the key changes on its own, so every redraw throws the form away and loses what the reader typed"
  );
});

// --------------------------------------------------------------------------------------------- the author term

const savedTerm: AuthorTerm = {
  id: "term-1",
  term: "Division of Labour",
  authorDefinition: "The splitting of one trade into many.",
  citation: place,
};

test("a term being edited opens with its own words", () => {
  const start = termFormStart(savedTerm, null, "ch-09.md");
  assert.equal(start.term, "Division of Labour", "the reader would have to type the term again to change one letter");
  assert.equal(start.definition, "The splitting of one trade into many.");
  assert.equal(start.chapterFile, "ch-03.md", "the chapter open now replaced the chapter the term was taken from");
  assert.equal(start.anchor, "^p-0012");
  assert.equal(start.quote, place.quote);
});

test("a new term opens empty, at the place the reader staged", () => {
  const start = termFormStart(null, place, "ch-09.md");
  assert.equal(start.term, "", "the new term window opens with words already in it");
  assert.equal(start.definition, "");
  assert.equal(start.chapterFile, "ch-03.md", "the staged place is what the reader pointed at, not the chapter open");
  assert.equal(start.quote, place.quote, "the reader's own excerpt is lost");
});

test("a new term with nothing staged points at the chapter open now", () => {
  const start = termFormStart(null, null, "ch-09.md");
  assert.equal(start.chapterFile, "ch-09.md", "the citation would name no chapter at all");
  assert.equal(start.anchor, "", "an anchor the app made up names a paragraph nobody chose (RD-04)");
  assert.equal(start.quote, "");
});

test("a new term with no chapter open names no chapter, and does not guess one", () => {
  assert.equal(termFormStart(null, null, undefined).chapterFile, "");
});

// ------------------------------------------------------------------------------------------------ the argument

const savedArgument: ArgumentNode = {
  id: "arg-1",
  title: "Specialization raises output",
  conclusion: place,
  premises: [{ chapterFile: "ch-02.md", anchor: "^p-0003", quote: "One worker draws the wire." }],
  inferenceType: "inductive",
  notes: "Compare with the pin factory.",
};

test("an argument being edited opens with its own premises", () => {
  const start = argumentFormStart(savedArgument, null, "ch-09.md");
  assert.equal(start.title, "Specialization raises output");
  assert.equal(start.inferenceType, "inductive", "the kind of inference falls back to deductive and is written over");
  assert.deepEqual(start.premises, savedArgument.premises, "the premises the reader wrote are thrown away");
  assert.equal(start.notes, "Compare with the pin factory.");
});

test("a new argument opens with one empty premise to fill in", () => {
  const start = argumentFormStart(null, place, "ch-09.md");
  assert.equal(start.premises.length, 1, "the reader has to add the first premise by hand every time");
  assert.equal(start.premises[0].chapterFile, "ch-09.md", "the premise points at the wrong chapter");
  assert.equal(start.premises[0].anchor, "", "the app never writes an anchor of its own (RD-04)");
  assert.deepEqual(start.conclusion, place, "the conclusion is not the place the reader staged");
});

test("a new argument with no chapter open says so, rather than naming a chapter that is not there", () => {
  const start = argumentFormStart(null, null, undefined);
  assert.equal(start.conclusion.chapterFile, "unknown.md");
  assert.equal(start.premises[0].chapterFile, "unknown.md");
});

test("the name for no chapter chosen is one no imported chapter has (RD-16)", () => {
  // The rule `check_chapter_file` in `src-tauri/src/vault/paths.rs` holds every chapter name to.
  const aChapterName = /^ch-\d{2,}\.md$/;
  assert.ok(aChapterName.test("ch-01.md"), "the rule no longer matches a real chapter, so this test proves nothing");
  assert.ok(!aChapterName.test(NO_CHAPTER_CHOSEN), "a citation nobody placed would point at a real chapter");
});

test("a staged argument with no chapter open falls back to the staged chapter", () => {
  const start = argumentFormStart(null, place, undefined);
  assert.equal(start.premises[0].chapterFile, "ch-03.md", "the premise lost the only chapter anything named");
});

// ------------------------------------------------------------------------------------------------ the critique

const savedCritique: CritiqueItem = {
  id: "crit-1",
  targetArgumentId: "arg-1",
  citation: place,
  understandingDeclared: true,
  judgment: "disagree",
  defects: ["illogical"],
  rationale: "The middle step does not follow.",
  createdAt: "2026-09-19T10:00:00.000Z",
};

test("a critique being edited opens with understanding already declared", () => {
  const start = critiqueFormStart(savedCritique, undefined, undefined, "ch-09.md");
  assert.equal(start.understandingDeclared, true, "the reader has to say again that they understood the author");
  assert.equal(start.judgment, "disagree", "the judgment falls back to agree, which is the opposite of what it says");
  assert.deepEqual(start.defects, ["illogical"]);
  assert.equal(start.selectedArgId, "arg-1", "the critique lost the argument it is about");
});

test("a critique of an argument with no citation still points at the chapter open now", () => {
  const start = critiqueFormStart(null, "arg-7", null, "ch-09.md");
  assert.equal(start.selectedArgId, "arg-7");
  assert.equal(start.citation?.chapterFile, "ch-09.md", "the critique would name no place in the book");
  assert.equal(start.understandingDeclared, false, "a new critique must not claim the reader understood the author");
});

test("a critique with nothing to point at names no place, rather than an empty one", () => {
  assert.equal(critiqueFormStart(null, undefined, null, undefined).citation, null);
});

test("a staged citation wins over the chapter open now", () => {
  const start = critiqueFormStart(null, undefined, place, "ch-09.md");
  assert.equal(start.citation?.anchor, "^p-0012", "the paragraph the reader pointed at is replaced by no paragraph");
});

// ------------------------------------------------------------------------------------------------- the inquiry

const savedInquiry: AuthorInquiry = {
  id: "inq-1",
  question: "Does the market always limit the division of labour?",
  domain: "practical",
  priority: "subordinate",
  citation: place,
  resolution: "unsolvedAcknowledged",
  solutionNotes: "The author says so in chapter three.",
  solutionArgumentIds: ["arg-1"],
  createdAt: "2026-09-19T10:00:00.000Z",
};

test("an inquiry being edited opens with its own answer", () => {
  const start = inquiryFormStart(savedInquiry, "a staged question");
  assert.equal(start.question, savedInquiry.question, "the staged question replaced the one being edited");
  assert.equal(start.domain, "practical");
  assert.equal(start.priority, "subordinate");
  assert.equal(start.resolution, "unsolvedAcknowledged", "an unsolved question is shown as solved");
  assert.deepEqual(start.solutionArgumentIds, ["arg-1"], "the arguments that answer it are lost");
});

test("a new inquiry starts from the question the reader staged", () => {
  const start = inquiryFormStart(null, "Why does the pin factory work?");
  assert.equal(start.question, "Why does the pin factory work?", "the reader's own question is not carried over");
  assert.equal(start.resolution, "solved");
  assert.deepEqual(start.solutionArgumentIds, []);
});

test("a new inquiry with nothing staged opens empty", () => {
  assert.equal(inquiryFormStart(undefined, undefined).question, "");
});

// --------------------------------------------------------------------------------------------- the controversy

const questions: SyntopicQuestion[] = [
  { id: "q-1", question: "What limits specialization?", order: 1 },
  { id: "q-2", question: "Who gains by it?", order: 2 },
];

const savedControversy: SyntopicControversy = {
  id: "con-1",
  questionId: "q-2",
  title: "Who gains by specialization",
  perspectives: [{ bookId: "wealth-of-nations", stance: "The worker gains", citations: [] }],
};

const stagedAcross = { bookId: "wealth-of-nations", ...place };

test("a controversy being edited keeps its own question and perspectives", () => {
  const start = controversyFormStart(savedControversy, questions, null, "other-book", "ch-09.md");
  assert.equal(start.questionId, "q-2", "the first question in the list replaced the one this controversy asks");
  assert.equal(start.title, "Who gains by specialization");
  assert.equal(start.perspectives.length, 1, "the perspectives already written are thrown away");
});

test("a new controversy starts on the first question there is", () => {
  const start = controversyFormStart(null, questions, null, "wealth-of-nations", "ch-09.md");
  assert.equal(start.questionId, "q-1", "the window opens on no question, so saving needs an extra choice");
  assert.equal(start.title, "");
});

test("a new controversy with no questions yet opens on none, rather than failing", () => {
  assert.equal(controversyFormStart(null, [], null, null, undefined).questionId, "");
});

test("the perspective form is filled apart from the controversy", () => {
  const start = controversyFormStart(savedControversy, questions, stagedAcross, "other-book", "ch-09.md");
  assert.equal(start.questionId, "q-2", "the two halves are worked out apart, and this one came from the staged place");
  assert.equal(start.pBookId, "wealth-of-nations", "the staged book is replaced by the book open now");
  assert.equal(start.pAnchor, "^p-0012");
});

test("with nothing staged the perspective form points at the book and chapter open now", () => {
  const start = controversyFormStart(null, questions, null, "wealth-of-nations", "ch-09.md");
  assert.equal(start.pBookId, "wealth-of-nations");
  assert.equal(start.pChapter, "ch-09.md");
  assert.equal(start.pQuote, "");
});

test("with no chapter open the perspective form names no chapter, rather than the first one (RD-16)", () => {
  assert.equal(
    controversyFormStart(null, questions, null, null, undefined).pChapter,
    "",
    "every book has a ch-01.md, so the form claims a real chapter the reader never chose"
  );
});

// -------------------------------------------------------------------------------------------- the neutral term

const savedNeutral: NeutralTerm = {
  id: "nt-1",
  term: "Specialization",
  neutralDefinition: "One worker doing one part of the work.",
  mappings: [
    {
      bookId: "wealth-of-nations",
      authorVariant: "division of labour",
      citation: { bookId: "wealth-of-nations", ...place },
    },
  ],
};

test("a neutral term being edited keeps the mappings already made", () => {
  const start = neutralTermFormStart(savedNeutral, null, "other-book", "ch-09.md");
  assert.equal(start.term, "Specialization");
  assert.equal(start.definition, "One worker doing one part of the work.");
  assert.equal(start.mappings.length, 1, "every mapping the reader made across books is thrown away");
});

test("a staged quote suggests the author's own wording, cut to thirty letters", () => {
  const start = neutralTermFormStart(null, stagedAcross, null, undefined);
  assert.equal(start.mapVariant, "The market limits the division", "the whole sentence lands in a one-word field");
  assert.equal(start.mapVariant.length, 30);
  assert.equal(start.mapQuote, place.quote, "the excerpt itself must stay whole");
});

test("a short staged quote is suggested whole", () => {
  const short = { bookId: "b", chapterFile: "ch-01.md", anchor: "^p-1", quote: "Pin making" };
  assert.equal(neutralTermFormStart(null, short, null, undefined).mapVariant, "Pin making");
});

test("a new neutral term with nothing staged opens on the book and chapter open now", () => {
  const start = neutralTermFormStart(null, null, "wealth-of-nations", "ch-09.md");
  assert.equal(start.term, "");
  assert.deepEqual(start.mappings, []);
  assert.equal(start.mapBookId, "wealth-of-nations");
  assert.equal(start.mapChapter, "ch-09.md");
  assert.equal(start.mapVariant, "");
});

test("a new neutral term with no chapter open names no chapter, rather than the first one (RD-16)", () => {
  assert.equal(
    neutralTermFormStart(null, null, "wealth-of-nations", undefined).mapChapter,
    "",
    "every book has a ch-01.md, so the form claims a real chapter the reader never chose"
  );
});

// --------------------------------------------------------------------------------------- the exit assessment

test("a book not assessed yet opens on the three empty parts the form shows", () => {
  const start = exitAssessmentFormStart(null);
  assert.equal(start.kind, "Theoretical");
  assert.equal(start.category, "Science");
  assert.deepEqual(start.parts, ["", "", ""], "the form draws three rows, so it must start with three");
});

test("a saved assessment opens with its own classification split in two", () => {
  const saved: ExitAssessmentPayload = {
    classification: "Practical - Economics",
    unityStatement: "Specialization raises output, and the size of the market limits it.",
    partsStructure: ["The division of labour", "Money and prices", "Capital"],
    completedAt: "2026-09-16T10:00:00.000Z",
  };
  const start = exitAssessmentFormStart(saved);
  assert.equal(start.kind, "Practical", "a practical book is shown as a theoretical one");
  assert.equal(start.category, "Economics", "the category is dropped, and saving would write Science over it");
  assert.equal(start.unityStatement, saved.unityStatement);
  assert.deepEqual(start.parts, saved.partsStructure);
});

test("a saved assessment with fewer than three parts is filled out to three", () => {
  const saved: ExitAssessmentPayload = {
    classification: "Theoretical - History",
    unityStatement: "One statement.",
    partsStructure: ["The only part"],
    completedAt: "2026-09-16T10:00:00.000Z",
  };
  assert.deepEqual(
    exitAssessmentFormStart(saved).parts,
    ["The only part", "", ""],
    "the form draws three rows and would read past the end of the list"
  );
});

test("a saved assessment with more than three parts keeps them all", () => {
  const saved: ExitAssessmentPayload = {
    classification: "Theoretical - History",
    unityStatement: "One statement.",
    partsStructure: ["a", "b", "c", "d"],
    completedAt: "2026-09-16T10:00:00.000Z",
  };
  assert.deepEqual(exitAssessmentFormStart(saved).parts, ["a", "b", "c", "d"], "the fourth part the reader wrote is cut");
});

test("a saved assessment whose classification names no category falls back, and keeps nothing stale", () => {
  const saved: ExitAssessmentPayload = {
    classification: "Practical",
    unityStatement: "",
    partsStructure: [],
    completedAt: "2026-09-16T10:00:00.000Z",
  };
  const start = exitAssessmentFormStart(saved);
  assert.equal(start.kind, "Practical");
  assert.equal(start.category, "Science", "the window would show the category of whatever book was open before it");
});
