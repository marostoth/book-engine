export interface TOCItem {
  id: string;
  title: string;
  href: string;
  level: number;
  subitems?: TOCItem[];
}

export interface ChapterMeta {
  id: string;
  title: string;
  file_path: string;
  order: number;
  word_count: number;
  anchor_count: number;
  first_anchor?: string;
  last_anchor?: string;
  footnotes_count: number;
}

export interface BookMeta {
  book_id: string;
  title: string;
  author: string;
  language: string;
  total_words: number;
  total_chapters: number;
  toc: TOCItem[];
  spine: ChapterMeta[];
  created_at: string;
}

export interface BookSummary {
  book_id: string;
  title: string;
  author: string;
  total_chapters: number;
  total_words: number;
}

export interface BookMetadata {
  id: string;
  title: string;
  author: string;
  chapter_count: number;
  total_words: number;
}

export type Theme = "paper" | "sepia" | "nord";

export type ViewMode = "reading" | "dual" | "focus";

export interface FootnoteItem {
  id: string;
  number: string;
  text: string;
}

export interface HighlightItem {
  id: string;
  exact: string;
  prefix: string;
  suffix: string;
  anchor?: string;
  color?: string;
  createdAt: string;
}

export interface SearchResult {
  book_id: string;
  chapter_id: string;
  chapter_title: string;
  chapter_file: string;
  anchor: string;
  snippet: string;
  rank: number;
}

export interface PracticeCardItem {
  card_id: string;
  book_id: string;
  chapter_file: string;
  anchor: string;
  item_type: "cloze" | "scramble";
  prompt: string;
  answer: string;
  state: number;
  stability: number;
  difficulty: number;
  due: number;
  last_review: number;
  reps: number;
}

export interface CardSchedule {
  card_id: string;
  state: number;
  stability: number;
  difficulty: number;
  due: number;
  last_review: number;
  reps: number;
  interval_days: number;
}

export interface DeckStats {
  due_count: number;
  new_count: number;
  learning_count: number;
  review_count: number;
  total_cards: number;
}

export interface ReaderPreferences {
  gatekeeperMode: boolean;
  dailyTarget: number;
}

