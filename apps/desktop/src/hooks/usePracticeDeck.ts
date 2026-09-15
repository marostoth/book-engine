import { useState, useEffect, useCallback } from "react";
import { PracticeCardItem, CardSchedule, ReaderPreferences } from "../lib/types";
import { syncPracticeDeck, getDueCards } from "../lib/api";
import { practiceCardType } from "../lib/practiceSession";

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

      try {
        await syncPracticeDeck(targetBookId);
        const cards = await getDueCards(targetBookId, practiceCardType(practiceMode), dailyTarget, hybridRatio);
        setDueCards(cards);
      } catch (err) {
        console.warn("Failed to refresh practice cards:", err);
      }
    },
    [activeBookId, practiceMode, dailyTarget, hybridRatio]
  );

  // Re-fetch deck whenever book, practice mode, daily target, or hybrid ratio changes
  useEffect(() => {
    if (activeBookId) {
      refreshPracticeCards(activeBookId);
    }
  }, [activeBookId, practiceMode, dailyTarget, hybridRatio, refreshPracticeCards]);

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
