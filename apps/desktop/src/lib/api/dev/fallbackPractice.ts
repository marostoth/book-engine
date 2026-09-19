import type { PracticeCardItem, CardSchedule } from "../../types.ts";
import { fallbackCardsMemory } from "./mockData.ts";

/** Browser stand-in for `sync_practice_deck`. */
export function syncPracticeDeck(): number {
  return fallbackCardsMemory.length;
}

/** Browser stand-in for `get_due_cards`: the due sample cards, of every book. */
export function getDueCards(cardType?: string, limit?: number): PracticeCardItem[] {
  return fallbackDueCards(cardType, limit);
}

/** Browser stand-in for `get_chapter_due_cards`. */
export function getChapterDueCards(
  bookId: string,
  chapterFile: string,
  cardType?: string,
  limit?: number
): PracticeCardItem[] {
  return fallbackDueCards(cardType, limit, (c) => c.book_id === bookId && c.chapter_file === chapterFile);
}

function fallbackDueCards(
  cardType?: string,
  limit?: number,
  keep: (card: PracticeCardItem) => boolean = () => true
): PracticeCardItem[] {
  const now = Math.floor(Date.now() / 1000);
  let cards = fallbackCardsMemory.filter((c) => (c.due <= now || c.reps === 0) && keep(c));
  if (cardType === "scenario") {
    cards = cards.filter((c) => c.card_type === "scenario" || c.item_type === "scenario");
  } else if (cardType === "cloze") {
    cards = cards.filter((c) => c.card_type !== "scenario" && c.item_type !== "scenario");
  }
  if (limit) {
    cards = cards.slice(0, limit);
  }
  return cards;
}

/** Browser stand-in for `submit_review`: a fixed interval (10 minutes, 1, 3, or 7 days), not FSRS. */
export function submitReview(cardId: string, rating: number): CardSchedule {
  const card = fallbackCardsMemory.find((c) => c.card_id === cardId);
  const now = Math.floor(Date.now() / 1000);
  const intervalDays = rating === 1 ? 0 : rating === 2 ? 1 : rating === 3 ? 3 : 7;
  const due = intervalDays === 0 ? now + 600 : now + intervalDays * 86400;

  if (card) {
    card.state = rating === 1 ? 1 : 2;
    card.stability = rating === 1 ? 0.4 : rating * 1.2;
    card.difficulty = Math.max(1, 7 - rating);
    card.due = due;
    card.last_review = now;
    card.reps += 1;
  }

  return {
    card_id: cardId,
    state: rating === 1 ? 1 : 2,
    stability: rating === 1 ? 0.4 : rating * 1.2,
    difficulty: Math.max(1, 7 - rating),
    due,
    last_review: now,
    reps: card?.reps || 0,
    interval_days: intervalDays,
  };
}

// The stand-in for `get_deck_stats` was deleted here with the command (LC-03). Browser mode answers the analytics
// window through `getFallbackStudyAnalytics`, which carries the same card counts.
