import type { PracticeCardItem, CardSchedule } from "../types.ts";
import { callBackend } from "./clientBase.ts";

export async function syncPracticeDeck(bookId: string): Promise<number> {
  return callBackend<number>("sync_practice_deck", { bookId }, (dev) => dev.syncPracticeDeck());
}

export async function getDueCards(
  bookId?: string,
  cardType?: string,
  limit?: number,
  hybridRatio?: number
): Promise<PracticeCardItem[]> {
  return callBackend<PracticeCardItem[]>("get_due_cards", { bookId, cardType, limit, hybridRatio }, (dev) =>
    dev.getDueCards(cardType, limit)
  );
}

/** Due cards of one chapter file of a book, for the Chapter Gatekeeper. */
export async function getChapterDueCards(
  bookId: string,
  chapterFile: string,
  cardType?: string,
  limit?: number,
  hybridRatio?: number
): Promise<PracticeCardItem[]> {
  return callBackend<PracticeCardItem[]>(
    "get_chapter_due_cards",
    { bookId, chapterFile, cardType, limit, hybridRatio },
    (dev) => dev.getChapterDueCards(bookId, chapterFile, cardType, limit)
  );
}

export async function submitReview(cardId: string, rating: number): Promise<CardSchedule> {
  return callBackend<CardSchedule>("submit_review", { cardId, rating }, (dev) => dev.submitReview(cardId, rating));
}

// `getDeckStats` was deleted here (LC-03). No screen ever called it: the counts it asked for are part of what
// `getStudyAnalytics` returns, and the analytics window has read that instead since AN-03.
