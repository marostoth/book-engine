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
