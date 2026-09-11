import { PracticeCardItem, CardSchedule, DeckStats } from "../types";
import { isTauri, tauriInvoke } from "./clientBase";
import { fallbackCardsMemory } from "./mockData";

export async function syncPracticeDeck(bookId: string): Promise<number> {
  if (isTauri) {
    try {
      return await tauriInvoke("sync_practice_deck", { bookId });
    } catch (e) {
      console.warn("Tauri sync_practice_deck failed:", e);
    }
  }
  return fallbackCardsMemory.length;
}

export async function getDueCards(bookId?: string): Promise<PracticeCardItem[]> {
  if (isTauri) {
    try {
      return await tauriInvoke("get_due_cards", { bookId });
    } catch (e) {
      console.warn("Tauri get_due_cards failed:", e);
    }
  }
  const now = Math.floor(Date.now() / 1000);
  return fallbackCardsMemory.filter((c) => c.due <= now || c.reps === 0);
}

export async function submitReview(cardId: string, rating: number): Promise<CardSchedule> {
  if (isTauri) {
    try {
      return await tauriInvoke("submit_review", { cardId, rating });
    } catch (e) {
      console.warn("Tauri submit_review failed:", e);
    }
  }

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

export async function getDeckStats(bookId?: string): Promise<DeckStats> {
  if (isTauri) {
    try {
      return await tauriInvoke("get_deck_stats", { bookId });
    } catch (e) {
      console.warn("Tauri get_deck_stats failed:", e);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const due = fallbackCardsMemory.filter((c) => c.due <= now || c.reps === 0).length;
  const newCards = fallbackCardsMemory.filter((c) => c.state === 0).length;
  const learning = fallbackCardsMemory.filter((c) => c.state === 1 || c.state === 3).length;
  const review = fallbackCardsMemory.filter((c) => c.state === 2).length;

  return {
    due_count: due,
    new_count: newCards,
    learning_count: learning,
    review_count: review,
    total_cards: fallbackCardsMemory.length,
  };
}
