import type { ChapterMeta, ReadingLevelMode } from "./types";
import type { PracticeSession } from "./practiceSession";

/** A move of the reader from one chapter of the open book to another. */
export interface ChapterMove {
  gatekeeperMode: boolean;
  level: ReadingLevelMode;
  /** The chapters of the open book in reading order. */
  spine: ChapterMeta[];
  /** The chapter the reader leaves, or null before a chapter is open. */
  from: ChapterMeta | null;
  to: ChapterMeta;
}

/**
 * Returns the chapter file whose due cards the Chapter Gatekeeper tests before this move, or null when the
 * chapter opens at once. Only a move to a later chapter is gated, whatever opened it (table of contents,
 * search, notes, citations, dips). Moving back and staying in the chapter are never gated, and neither is
 * the syntopical level, which compares books.
 */
export function gatedChapterFile(move: ChapterMove): string | null {
  const { from, to, spine } = move;
  if (!move.gatekeeperMode || move.level === "syntopical" || !from) return null;
  const fromIndex = spine.findIndex((chapter) => chapter.file_path === from.file_path);
  const toIndex = spine.findIndex((chapter) => chapter.file_path === to.file_path);
  return fromIndex >= 0 && toIndex > fromIndex ? from.file_path : null;
}

/** FSRS ratings are Again 1, Hard 2, Good 3, and Easy 4. A gate card counts as right only when rated Good or Easy. */
const GOOD = 3;

/**
 * Counts the rated gate cards that are right: rated Good or Easy, and not in `wrongAnswers`, the ids of
 * scenario cards answered with a wrong option.
 */
export function gateRightAnswers(session: PracticeSession, wrongAnswers: ReadonlySet<string>): number {
  return session.reviews.filter((review) => review.rating >= GOOD && !wrongAnswers.has(review.cardId)).length;
}

/** The gate is passed only when its session is complete and every card in it is right. */
export function gatePassed(session: PracticeSession, wrongAnswers: ReadonlySet<string>): boolean {
  return session.completed && gateRightAnswers(session, wrongAnswers) === session.reviews.length;
}
