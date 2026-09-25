import { useState, useEffect, useCallback } from "react";
import { PracticeCardItem, CardSchedule, ReaderPreferences, StudyPreferences } from "../lib/types";
import { syncPracticeDeck, getDueCards } from "../lib/api";
import { type DueCards, practiceCardType } from "../lib/practiceSession";
import { reportBackendError } from "../lib/backendErrors";

/**
 * Syncs a book's practice deck and gives back the cards due now.
 *
 * A plain function, outside the hook, so the effect below can await the fetch itself. An effect must not CALL
 * something that sets state: that sets it before the first drawing instead of after it (TL-11).
 *
 * It reports its own failures. A sync that fails still leaves the cards already in the database usable. A fetch that
 * fails gives back null: the cards are not known, which is not the same as no cards due (RD-14).
 */
async function loadDueCards(
  bookId: string,
  mode: StudyPreferences["practiceMode"],
  dailyTarget: number,
  hybridRatio: number
): Promise<PracticeCardItem[] | null> {
  try {
    await syncPracticeDeck(bookId);
  } catch (err) {
    // The cards that are already in the database can still be used for practice.
    reportBackendError("Your practice deck did not sync, so new or changed cards can be missing.", err);
  }
  try {
    return await getDueCards(bookId, practiceCardType(mode), dailyTarget, hybridRatio);
  } catch (err) {
    reportBackendError("Could not load your practice cards.", err);
    return null;
  }
}

/** The cards due for one question, and the question they answer. Cards for another book or mode are not these. */
interface Deck {
  to: string;
  /** Null when the load failed. */
  cards: PracticeCardItem[] | null;
}

/**
 * The practice deck of the open book: the cards due now, and how many.
 *
 * `dueCards` is "loading" or "failed" while the cards of THIS book, mode and target are not known. It used to keep the cards of the book the reader had just left until the new ones came, so the badge showed
 * the other book's number and the window showed the other book's cards (RD-14).
 */
export function usePracticeDeck(activeBookId: string, preferences: ReaderPreferences) {
  const [deck, setDeck] = useState<Deck | null>(null);
  /** Counts up when the reader asks for the deck again with "Sync Deck", so the same question is asked a second time. */
  const [askedAgain, setAskedAgain] = useState(0);
  const [practiceModalOpen, setPracticeModalOpen] = useState<boolean>(false);

  const study = preferences.study;
  const practiceMode = study.practiceMode;
  const dailyTarget = study.dailyTargetCards;
  const hybridRatio = study.hybridRatio ?? 0.5;

  const asked = `${askedAgain} ${activeBookId} ${practiceMode} ${dailyTarget} ${hybridRatio}`;
  const answered = activeBookId !== "" && deck?.to === asked;
  const dueCards: DueCards = answered ? (deck.cards ?? "failed") : "loading";

  // Ask whenever the book, the practice mode, the daily target, the hybrid ratio changes, or the reader asks again.
  // The answer carries its question, so an answer to an older one is never shown.
  useEffect(() => {
    if (!activeBookId) return;
    let isCurrent = true;
    loadDueCards(activeBookId, practiceMode, dailyTarget, hybridRatio).then((cards) => {
      if (isCurrent) setDeck({ to: asked, cards });
    });
    return () => {
      isCurrent = false;
    };
  }, [asked, activeBookId, practiceMode, dailyTarget, hybridRatio]);

  const refreshPracticeCards = useCallback(() => setAskedAgain((count) => count + 1), []);

  const handleReviewSubmitted = useCallback((cardId: string, schedule: CardSchedule) => {
    if (schedule.interval_days > 0) {
      setDeck((prev) => (prev?.cards ? { ...prev, cards: prev.cards.filter((c) => c.card_id !== cardId) } : prev));
    }
  }, []);

  return {
    dueCards,
    /** Null while the cards are not known. */
    dueCardsCount: Array.isArray(dueCards) ? dueCards.length : null,
    practiceModalOpen,
    setPracticeModalOpen,
    refreshPracticeCards,
    handleReviewSubmitted,
  };
}
