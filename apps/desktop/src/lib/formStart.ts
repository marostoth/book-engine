// What a form holds the moment it opens, worked out before the form is built (TL-11).
//
// Seven of these windows used to fill themselves inside an effect. The component stayed on the page while the
// window was shut, so an effect watching `isOpen` wrote every field again each time it opened. React drew the empty
// form first and the filled one straight after: a second drawing nobody asked for, and a moment where the reader
// could see the wrong fields. `react-hooks/set-state-in-effect` says so.
//
// The answer is the one React's own guidance gives. Work the start value out here, hand it to `useState`, and give
// the form a `key`. A new key is a new form, so a new thing gets empty fields and a thing being edited gets filled
// ones, and no effect writes over what the reader typed.
//
// Every function here is pure: it takes what the window was given and gives back what the form starts as. That is
// why `formStart.test.ts` can read all of them without a browser.

import type {
  AnchoredCitation,
  ArgumentNode,
  AuthorInquiry,
  AuthorTerm,
  CritiqueDefect,
  CritiqueItem,
  CritiqueJudgment,
  InferenceType,
  InquiryDomain,
  InquiryPriority,
  ResolutionStatus,
} from "./types/analytical.ts";
import type {
  NeutralTerm,
  StagedCitation,
  SyntopicControversy,
  SyntopicPerspective,
  SyntopicQuestion,
  TermMapping,
} from "./types/syntopicon.ts";
import type { ExitAssessmentPayload } from "./types.ts";

/** A separator no chapter name, anchor or id holds, so two different forms can never share one key. */
const BETWEEN_PARTS = "\u0000";

/**
 * The `key` of a form. React keeps a form while its key stays the same and builds a new one when it changes.
 *
 * The parts are the same values the effect this replaced watched. A part that is missing counts as an empty one, so
 * "no term is being edited" and "a term whose id is empty" are the same form, exactly as they were before.
 *
 * The `?? ""` is redundant, and deliberately kept: `Array.prototype.join` already writes a missing part as an
 * empty string. NO TEST CAN TELL THE TWO APART, and a mutation that took it out went green. It stays because a
 * reader should not have to know that rule of `join` to see that a missing part is safe here.
 */
export function formKey(parts: readonly (string | null | undefined)[]): string {
  return parts.map((part) => part ?? "").join(BETWEEN_PARTS);
}

// ----------------------------------------------------------------------------- the analytical level

export interface TermForm {
  term: string;
  definition: string;
  chapterFile: string;
  anchor: string;
  quote: string;
}

/** What the author-term window holds when it opens: the term being edited, else the staged place, else nothing. */
export function termFormStart(
  editingTerm: AuthorTerm | null,
  stagedCitation: AnchoredCitation | null,
  currentChapterFile?: string
): TermForm {
  if (editingTerm) {
    return {
      term: editingTerm.term,
      definition: editingTerm.authorDefinition,
      chapterFile: editingTerm.citation.chapterFile,
      anchor: editingTerm.citation.anchor,
      quote: editingTerm.citation.quote,
    };
  }
  if (stagedCitation) {
    return {
      term: "",
      definition: "",
      chapterFile: stagedCitation.chapterFile,
      anchor: stagedCitation.anchor,
      quote: stagedCitation.quote,
    };
  }
  return { term: "", definition: "", chapterFile: currentChapterFile || "", anchor: "", quote: "" };
}

export interface ArgumentForm {
  title: string;
  inferenceType: InferenceType;
  conclusion: AnchoredCitation;
  premises: AnchoredCitation[];
  notes: string;
}

/** What the argument window holds when it opens. A new argument starts with one empty premise to fill in. */
export function argumentFormStart(
  editingArgument: ArgumentNode | null,
  stagedCitation: AnchoredCitation | null,
  currentChapterFile?: string
): ArgumentForm {
  if (editingArgument) {
    return {
      title: editingArgument.title,
      inferenceType: editingArgument.inferenceType,
      conclusion: editingArgument.conclusion,
      premises: editingArgument.premises,
      notes: editingArgument.notes,
    };
  }
  if (stagedCitation) {
    return {
      title: "",
      inferenceType: "deductive",
      conclusion: stagedCitation,
      // A citation with no anchor names no paragraph. The app never writes an anchor of its own (RD-04).
      premises: [{ chapterFile: currentChapterFile || stagedCitation.chapterFile, anchor: "", quote: "" }],
      notes: "",
    };
  }
  const chapterFile = currentChapterFile || "unknown.md";
  return {
    title: "",
    inferenceType: "deductive",
    conclusion: { chapterFile, anchor: "", quote: "" },
    premises: [{ chapterFile, anchor: "", quote: "" }],
    notes: "",
  };
}

export interface CritiqueForm {
  understandingDeclared: boolean;
  judgment: CritiqueJudgment;
  defects: CritiqueDefect[];
  rationale: string;
  selectedArgId: string;
  citation: AnchoredCitation | null;
}

/** What the critique window holds when it opens. A new critique has not declared understanding yet. */
export function critiqueFormStart(
  editingCritique: CritiqueItem | null,
  targetArgId?: string,
  targetCitation?: AnchoredCitation | null,
  currentChapterFile?: string
): CritiqueForm {
  if (editingCritique) {
    return {
      understandingDeclared: editingCritique.understandingDeclared,
      judgment: editingCritique.judgment,
      defects: editingCritique.defects || [],
      rationale: editingCritique.rationale || "",
      selectedArgId: editingCritique.targetArgumentId || "",
      citation: editingCritique.citation || null,
    };
  }
  return {
    understandingDeclared: false,
    judgment: "agree",
    defects: [],
    rationale: "",
    selectedArgId: targetArgId || "",
    citation:
      targetCitation || (currentChapterFile ? { chapterFile: currentChapterFile, anchor: "", quote: "" } : null),
  };
}

export interface InquiryForm {
  question: string;
  domain: InquiryDomain;
  priority: InquiryPriority;
  resolution: ResolutionStatus;
  solutionNotes: string;
  solutionArgumentIds: string[];
}

/** What the inquiry window holds when it opens. A new inquiry starts from the question the reader staged. */
export function inquiryFormStart(
  editingInquiry: AuthorInquiry | null | undefined,
  stagedQuestion?: string
): InquiryForm {
  if (editingInquiry) {
    return {
      question: editingInquiry.question,
      domain: editingInquiry.domain,
      priority: editingInquiry.priority,
      resolution: editingInquiry.resolution,
      solutionNotes: editingInquiry.solutionNotes || "",
      solutionArgumentIds: editingInquiry.solutionArgumentIds || [],
    };
  }
  return {
    question: stagedQuestion || "",
    domain: "theoretical",
    priority: "primary",
    resolution: "solved",
    solutionNotes: "",
    solutionArgumentIds: [],
  };
}

// ----------------------------------------------------------------------------- the syntopical level

export interface ControversyForm {
  questionId: string;
  title: string;
  perspectives: SyntopicPerspective[];
  pBookId: string;
  pChapter: string;
  pAnchor: string;
  pQuote: string;
}

/**
 * What the controversy window holds when it opens.
 *
 * The two halves are worked out apart, exactly as the effect did: which controversy is being written, and which
 * place in a book the perspective form points at.
 */
export function controversyFormStart(
  editingControversy: SyntopicControversy | null,
  questions: readonly SyntopicQuestion[],
  stagedCitation: StagedCitation | null,
  currentBookId?: string | null,
  currentChapterFile?: string
): ControversyForm {
  const controversy = editingControversy
    ? {
        questionId: editingControversy.questionId,
        title: editingControversy.title,
        perspectives: editingControversy.perspectives || [],
      }
    : { questionId: questions.length > 0 ? questions[0].id : "", title: "", perspectives: [] };
  const place = stagedCitation
    ? {
        pBookId: stagedCitation.bookId,
        pChapter: stagedCitation.chapterFile,
        pAnchor: stagedCitation.anchor,
        pQuote: stagedCitation.quote,
      }
    : { pBookId: currentBookId || "", pChapter: currentChapterFile || "ch-01.md", pAnchor: "", pQuote: "" };
  return { ...controversy, ...place };
}

export interface NeutralTermForm {
  term: string;
  definition: string;
  mappings: TermMapping[];
  mapBookId: string;
  mapVariant: string;
  mapChapter: string;
  mapAnchor: string;
  mapQuote: string;
}

/** What the neutral-term window holds when it opens. A staged quote also suggests the author's own wording. */
export function neutralTermFormStart(
  editingTerm: NeutralTerm | null,
  stagedCitation: StagedCitation | null,
  currentBookId?: string | null,
  currentChapterFile?: string
): NeutralTermForm {
  const term = editingTerm
    ? { term: editingTerm.term, definition: editingTerm.neutralDefinition, mappings: editingTerm.mappings || [] }
    : { term: "", definition: "", mappings: [] };
  const mapping = stagedCitation
    ? {
        mapBookId: stagedCitation.bookId,
        mapChapter: stagedCitation.chapterFile,
        mapAnchor: stagedCitation.anchor,
        mapQuote: stagedCitation.quote,
        mapVariant: stagedCitation.quote.slice(0, 30),
      }
    : {
        mapBookId: currentBookId || "",
        mapChapter: currentChapterFile || "ch-01.md",
        mapAnchor: "",
        mapQuote: "",
        mapVariant: "",
      };
  return { ...term, ...mapping };
}

// ----------------------------------------------------------------------------- the inspectional level

export interface ExitAssessmentForm {
  kind: "Theoretical" | "Practical";
  category: string;
  unityStatement: string;
  parts: string[];
}

/** The category a classification names, or nothing. A classification reads "Theoretical - Social Science". */
function categoryOf(classification: string): string {
  return classification.split("-")[1]?.trim() || "";
}

/**
 * What the exit-assessment window holds when it opens.
 *
 * The form always shows three parts, so a saved assessment with fewer is filled out with empty ones and one with
 * more keeps them all. A saved assessment whose classification names no category falls back to the same "Science"
 * a new assessment starts with; the effect this replaced left whatever the last opening had put there.
 */
export function exitAssessmentFormStart(initialAssessment?: ExitAssessmentPayload | null): ExitAssessmentForm {
  if (!initialAssessment) {
    return { kind: "Theoretical", category: "Science", unityStatement: "", parts: ["", "", ""] };
  }
  const saved = initialAssessment.partsStructure || [];
  return {
    kind: initialAssessment.classification.includes("Practical") ? "Practical" : "Theoretical",
    category: categoryOf(initialAssessment.classification) || "Science",
    unityStatement: initialAssessment.unityStatement || "",
    parts: saved.length >= 3 ? saved : [...saved, "", "", ""].slice(0, 3),
  };
}
