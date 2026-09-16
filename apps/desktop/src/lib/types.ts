export interface TOCItem {
  id: string;
  title: string;
  href: string;
  level: number;
  subitems?: TOCItem[];
}

export interface ElementaryMetrics {
  flesch_kincaid_grade: number;
  avg_sentence_length_words: number;
  estimated_reading_minutes: number;
}

export interface InspectionalSampling {
  head_anchors: string[];
  tail_anchors: string[];
  head_text_preview: string;
  tail_text_preview: string;
}

export interface FrontMatterMetadata {
  has_preface: boolean;
  preface_path?: string | null;
  publisher_blurb?: string | null;
}

/** The reader's exit assessment of a book, kept in `vault/notes/<book-id>/inspectional.json` (DS-09). */
export interface ExitAssessmentPayload {
  classification: string;
  unityStatement: string;
  partsStructure: string[];
  completedAt: string;
}

export type ReadingLevelMode = "elementary" | "inspectional" | "analytical" | "syntopical";

export type InspectionalSubView = "blueprint" | "dips";

/** The blueprint the importer makes. The reader's exit assessment is not part of it (DS-09). */
export interface InspectionalBlueprint {
  front_matter: FrontMatterMetadata | Record<string, any>;
  pivotal_chapters: string[];
  synthetic_index_clusters: Array<Record<string, any>>;
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
  inspectional_sampling?: InspectionalSampling;
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
  elementary_metrics?: ElementaryMetrics;
  inspectional_blueprint?: InspectionalBlueprint;
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
  elementary_metrics?: ElementaryMetrics;
  inspectional_blueprint?: InspectionalBlueprint;
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

export type { ScenarioOption, ScenarioPayload, PracticeCardItem } from "./practiceTypes";

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

export interface ElementaryPreferences {
  pacerWpm: number;
  pacerMode: "line" | "underline";
  pacerChunkSize?: number; // 1 to 3 words per fixation jump (default 2)
  pacerLockFocus?: boolean; // lock focus ruler to active paragraph during pacing (default true)
  pacerShowGripHandle?: boolean; // show tactile draggable grip handle under chunk underline (default true)
  pacerClickToScrub?: boolean; // click anywhere along active line baseline to scrub (default true)
  pacerKeyboardScrubbing?: boolean; // enable ArrowUp/Down/Left/Right line and word stepping (default false)
  focusRulerEnabled: boolean;
  focusDimmingPercent: number; // 20 to 98
  focusActiveHighlight?: boolean; // subtle left border rail & ambient tint on active paragraph (default true)
  measureCharsPerLine: number;
  bionicFixationEnabled: boolean;
  instantDictionaryEnabled: boolean;
}

export interface InspectionalPreferences {
  defaultTimerMinutes: number;
  autoPromptExitCard: boolean;
  samplingDepthParagraphs: number;
  autoHideDrawerOnSkim: boolean;
  singleKeyPagingEnabled: boolean;
}

export interface StudyPreferences {
  gatekeeperMode: boolean;
  gatekeeperQuota: number;
  dailyTargetCards: number;
  practiceMode: "verbatim" | "mcq_scenario" | "hybrid";
  hybridRatio?: number;
}

export interface GeneralPreferences {
  theme?: Theme;
  fontSize: number;
  lineHeightRatio: number;
  fontFamily: "serif" | "sans" | "mono";
}

export interface ReaderPreferences {
  elementary: ElementaryPreferences;
  inspectional: InspectionalPreferences;
  study: StudyPreferences;
  general?: GeneralPreferences;
  gatekeeperMode: boolean;
  dailyTarget: number;
}

export interface ChapterNoteFile {
  file_name: string;
  chapter_file: string;
  content: string;
}

export type EntryType = "highlight" | "note";

export interface AggregatedEntry {
  id: string;
  type: EntryType;
  chapterFile: string;
  chapterTitle: string;
  chapterOrder: number;
  anchor?: string;
  text: string;
  prefix?: string;
  suffix?: string;
  color?: string;
  sectionHeading?: string;
  createdAt?: string;
}

export interface DayReviewActivity {
  date: string;
  count: number;
}

export interface RetentionMetrics {
  due_today: number;
  total_cards: number;
  mastered_cards: number;
  retention_rate: number;
}

export interface ChapterReadingStatItem {
  chapter_file: string;
  chapter_title?: string;
  seconds_spent: number;
  words_read: number;
  completed: boolean;
  wpm: number;
  last_read_at: number;
}

export interface ReadingVelocityStats {
  total_seconds: number;
  completed_chapters: number;
  total_words_read: number;
  average_wpm: number;
  chapter_stats: ChapterReadingStatItem[];
}

export interface AggregatedNoteItem {
  id: string;
  item_type: "highlight" | "note";
  chapter_file: string;
  chapter_title: string;
  chapter_order: number;
  anchor?: string | null;
  text: string;
  color?: string | null;
  section_heading?: string | null;
  created_at?: string | null;
}

export interface StateCounts {
  new_count: number;
  learning_count: number;
  review_count: number;
  relearning_count: number;
  total_cards: number;
}

export interface StudyAnalytics {
  daily_reviews: DayReviewActivity[];
  state_counts: StateCounts;
  retention_rate: number;
  cards_due_today: number;
  mastered_cards: number;
  total_vault_words: number;
  estimated_reading_time_mins: number;
}

export interface DictionaryEntry {
  word: string;
  partOfSpeech?: string;
  pronunciation?: string;
  definition: string;
  etymology?: string;
}

export interface VocabularyEntry {
  word: string;
  definition: string;
  anchor: string;
  savedAt: string;
}

export * from "./types/analytical";
export * from "./types/syntopicon";
