import type { PracticeCardItem } from "./practiceTypes";

/**
 * One run of the practice or gatekeeper window over a fixed copy of the due cards.
 * Rating a card removes it from the live due list (usePracticeDeck), so the window
 * must not walk that list by index, or it skips every other card.
 */
export interface PracticeSession {
  cards: PracticeCardItem[];
  index: number;
  completed: boolean;
  reviews: { cardId: string; rating: number }[];
}

/** Starts a session on a copy of the first `limit` cards. */
export function startSession(cards: PracticeCardItem[], limit: number = cards.length): PracticeSession {
  return { cards: cards.slice(0, Math.max(0, limit)), index: 0, completed: false, reviews: [] };
}

/**
 * Follows the latest due cards until the first rating, because the deck can still be
 * loading when the window opens. After the first rating the session keeps its copy.
 */
export function syncSession(
  session: PracticeSession,
  cards: PracticeCardItem[],
  limit: number = cards.length,
): PracticeSession {
  return session.reviews.length === 0 ? startSession(cards, limit) : session;
}

/** Returns the card to show, or undefined when the session is empty or completed. */
export function currentSessionCard(session: PracticeSession): PracticeCardItem | undefined {
  return session.completed ? undefined : session.cards[session.index];
}

/** Records the rating of the shown card, then moves to the next card or completes the session. */
export function recordSessionReview(session: PracticeSession, cardId: string, rating: number): PracticeSession {
  if (currentSessionCard(session)?.card_id !== cardId) return session;
  const reviews = [...session.reviews, { cardId, rating }];
  const index = session.index + 1;
  return index < session.cards.length
    ? { ...session, index, reviews }
    : { ...session, reviews, completed: true };
}
