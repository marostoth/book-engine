import { useState, useEffect, useCallback } from "react";
import { PracticeCardItem, CardSchedule, ReaderPreferences, StudyPreferences } from "../lib/types";
import { syncPracticeDeck, getDueCards } from "../lib/api";
import { practiceCardType } from "../lib/practiceSession";
import { reportBackendError } from "../lib/backendErrors";

/**
 * Syncs a book's practice deck and gives back the cards due now.
 *
 * A plain function, outside the hook, so the effect below can await the fetch itself. An effect must not CALL
 * something that sets state: that sets it before the first drawing instead of after it (TL-11).
 *
 * It reports its own failures. A sync that fails still leaves the cards already in the database usable, and a fetch
 * that fails gives back no cards rather than the cards of the book before it.
 */
async function loadDueCards(
  bookId: string,
  mode: StudyPreferences["practiceMode"],
  dailyTarget: number,
  hybridRatio: number
): Promise<PracticeCardItem[]> {
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
    return [];
  }
}

export function usePracticeDeck(activeBookId: string, preferences: ReaderPreferences) {
  const [dueCards, setDueCards] = useState<PracticeCardItem[]>([]);
  const [practiceModalOpen, setPracticeModalOpen] = useState<boolean>(false);

  const study = preferences.study;
  const practiceMode = study.practiceMode;
  const dailyTarget = study.dailyTargetCards;
  const hybridRatio = study.hybridRatio ?? 0.5;

  const refreshPracticeCards = useCallback(
    async (bId?: string) => {
      const targetBookId = bId || activeBookId;
      if (!targetBookId) return;
      setDueCards(await loadDueCards(targetBookId, practiceMode, dailyTarget, hybridRatio));
    },
    [activeBookId, practiceMode, dailyTarget, hybridRatio]
  );

  // Re-fetch deck whenever book, practice mode, daily target, or hybrid ratio changes. The answer to an older book
  // is thrown away: it used to be able to land after the reader had already opened another one.
  useEffect(() => {
    if (!activeBookId) return;
    let isCurrent = true;
    loadDueCards(activeBookId, practiceMode, dailyTarget, hybridRatio).then((cards) => {
      if (isCurrent) setDueCards(cards);
    });
    return () => {
      isCurrent = false;
    };
  }, [activeBookId, practiceMode, dailyTarget, hybridRatio]);

  const handleReviewSubmitted = useCallback((cardId: string, schedule: CardSchedule) => {
    if (schedule.interval_days > 0) {
      setDueCards((prev) => prev.filter((c) => c.card_id !== cardId));
    }
  }, []);

  return {
    dueCards,
    dueCardsCount: dueCards.length,
    practiceModalOpen,
    setPracticeModalOpen,
    refreshPracticeCards,
    handleReviewSubmitted,
  };
}
