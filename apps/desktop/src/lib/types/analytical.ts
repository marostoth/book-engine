export interface AnchoredCitation {
  chapterFile: string;
  anchor: string;
  quote: string;
}

export interface AuthorTerm {
  id: string;
  term: string;
  authorDefinition: string;
  citation: AnchoredCitation;
}

export type InferenceType = "deductive" | "inductive" | "analogical";

export interface ArgumentNode {
  id: string;
  title: string;
  conclusion: AnchoredCitation;
  premises: AnchoredCitation[];
  inferenceType: InferenceType;
  notes: string;
}

export type CritiqueDefect = "uninformed" | "misinformed" | "illogical" | "incomplete";

export type CritiqueJudgment = "agree" | "disagree" | "suspend";

export interface CritiqueItem {
  id: string;
  targetArgumentId?: string | null;
  citation?: AnchoredCitation | null;
  understandingDeclared: boolean;
  judgment: CritiqueJudgment;
  defects: CritiqueDefect[];
  rationale: string;
  createdAt: string;
}

export type InquiryDomain = "theoretical" | "practical";

export type InquiryPriority = "primary" | "subordinate";

export type ResolutionStatus = "solved" | "unsolvedAcknowledged" | "unsolvedUnrecognized";

export interface AuthorInquiry {
  id: string;
  question: string;
  domain: InquiryDomain;
  priority: InquiryPriority;
  citation?: AnchoredCitation | null;
  resolution: ResolutionStatus;
  solutionNotes: string;
  solutionArgumentIds: string[];
  solutionCitation?: AnchoredCitation | null;
  createdAt: string;
}

export interface AnalyticalStore {
  terms: AuthorTerm[];
  arguments: ArgumentNode[];
  critiques?: CritiqueItem[];
  inquiries?: AuthorInquiry[];
  overallVerdict?: string | null;
}
