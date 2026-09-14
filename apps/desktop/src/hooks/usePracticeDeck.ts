import { useState, useEffect, useCallback } from "react";
import {
  PracticeCardItem,
  CardSchedule,
  ChapterMeta,
  ReaderPreferences,
  ReadingLevelMode,
} from "../lib/types";
import { syncPracticeDeck, getDueCards } from "../lib/api";

export function usePracticeDeck(
  activeBookId: string,
  preferences: ReaderPreferences,
  activeLevel?: ReadingLevelMode,
  activeChapter?: ChapterMeta | null,
  onChapterAdvance?: (chapter: ChapterMeta) => void
) {
  const [dueCards, setDueCards] = useState<PracticeCardItem[]>([]);
  const [practiceModalOpen, setPracticeModalOpen] = useState<boolean>(false);
  const [gatekeeperModalOpen, setGatekeeperModalOpen] = useState<boolean>(false);
  const [pendingChapter, setPendingChapter] = useState<ChapterMeta | null>(null);

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
        const cardType =
          practiceMode === "mcq_scenario"
            ? "scenario"
            : practiceMode === "verbatim"
            ? "cloze"
            : "hybrid";

        const cards = await getDueCards(targetBookId, cardType, dailyTarget, hybridRatio);
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

  const handleSelectChapter = useCallback(
    (chapter: ChapterMeta) => {
      if (
        activeLevel !== "inspectional" &&
        activeLevel !== "syntopical" &&
        preferences.gatekeeperMode &&
        activeChapter &&
        chapter.id !== activeChapter.id
      ) {
        const chapterCards = dueCards.filter(
          (c) =>
            c.chapter_file === activeChapter.file_path ||
            c.chapter_file.includes(activeChapter.id)
        );
        const candidates = chapterCards.length > 0 ? chapterCards : dueCards;

        if (candidates.length > 0) {
          setPendingChapter(chapter);
          setGatekeeperModalOpen(true);
          return;
        }
      }

      if (onChapterAdvance) {
        onChapterAdvance(chapter);
      }
    },
    [activeLevel, preferences.gatekeeperMode, activeChapter, dueCards, onChapterAdvance]
  );

  const handleGatekeeperComplete = useCallback(() => {
    if (pendingChapter && onChapterAdvance) {
      onChapterAdvance(pendingChapter);
      setPendingChapter(null);
    }
    setGatekeeperModalOpen(false);
  }, [pendingChapter, onChapterAdvance]);

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
    gatekeeperModalOpen,
    setGatekeeperModalOpen,
    pendingChapter,
    refreshPracticeCards,
    handleSelectChapter,
    handleGatekeeperComplete,
    handleReviewSubmitted,
  };
}
