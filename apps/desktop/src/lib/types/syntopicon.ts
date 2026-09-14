export interface CrossBookCitation {
  bookId: string;
  chapterFile: string;
  anchor: string;
  quote: string;
}

export interface TermMapping {
  bookId: string;
  authorVariant: string;
  authorTermId?: string;
  citation: CrossBookCitation;
}

export interface NeutralTerm {
  id: string;
  term: string;
  neutralDefinition: string;
  mappings: TermMapping[];
}

export interface SyntopicQuestion {
  id: string;
  question: string;
  order: number;
}

export interface SyntopicPerspective {
  bookId: string;
  stance: string;
  argumentIds?: string[];
  citations: CrossBookCitation[];
}

export interface SyntopicControversy {
  id: string;
  questionId: string;
  title: string;
  perspectives: SyntopicPerspective[];
}

export interface SyntopicTopic {
  id: string;
  title: string;
  description: string;
  neutralTerms: NeutralTerm[];
  questions: SyntopicQuestion[];
  controversies: SyntopicControversy[];
  synthesisNotes?: string;
  dialecticalResolution?: string;
  createdAt: string;
}

export interface SyntopicTopicSummary {
  id: string;
  title: string;
  description: string;
  termCount: number;
  questionCount: number;
  controversyCount: number;
  booksInvolved: string[];
  createdAt: string;
}

export interface StagedCitation {
  bookId: string;
  chapterFile: string;
  anchor: string;
  quote: string;
}
