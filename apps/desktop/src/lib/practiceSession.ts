import type { PracticeCardItem } from "./practiceTypes";
import type { StudyPreferences } from "./types";

/** The card type that `get_due_cards` and `get_chapter_due_cards` take for a practice mode. */
export function practiceCardType(mode: StudyPreferences["practiceMode"]): "scenario" | "cloze" | "hybrid" {
  return mode === "mcq_scenario" ? "scenario" : mode === "verbatim" ? "cloze" : "hybrid";
}

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

/**
 * A name for a deck, so a window can tell one deck from another by what is in it (TL-11).
 *
 * The due list is fetched again whenever the book, the mode or the target changes, so the array is a fresh one each
 * time even when it holds the same cards. A window that watched the array itself would start its session again for
 * nothing. Two decks holding the same cards in the same order are the same deck, and get the same name.
 */
export function deckName(cards: readonly PracticeCardItem[]): string {
  return cards.map((card) => card.card_id).join(" ");
}

/** How many words go in one piece when a prompt holds no punctuation to cut it at. */
const WORDS_IN_A_PIECE = 3;

/**
 * The pieces a scramble drill shuffles, in the order they were shuffled into (TL-11).
 *
 * A prompt is cut at its pipes, or failing that at its commas and semicolons, or failing that into runs of three
 * words. The shuffle is the reverse of alphabetical order, so the same prompt always gives the same puzzle: a
 * different puzzle on every redraw would move the pieces under the reader's hand.
 *
 * The drill used to do this inside an effect, so it drew an empty puzzle first and the real one straight after.
 */
export function scramblePieces(prompt: string): string[] {
  let pieces = prompt.split("|").map((piece) => piece.trim()).filter(Boolean);
  if (pieces.length < 2) {
    pieces = prompt.split(/[,;]\s*/).map((piece) => piece.trim()).filter(Boolean);
  }
  if (pieces.length < 2) {
    const words = prompt.split(/\s+/);
    pieces = [];
    for (let at = 0; at < words.length; at += WORDS_IN_A_PIECE) {
      pieces.push(words.slice(at, at + WORDS_IN_A_PIECE).join(" "));
    }
  }
  return [...pieces].sort((a, b) => b.localeCompare(a));
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
