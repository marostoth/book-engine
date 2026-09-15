import { useState, useCallback } from "react";
import { ChapterMeta, PracticeCardItem, ReaderPreferences, ReadingLevelMode } from "../lib/types";
import { getChapterDueCards } from "../lib/api";
import { gatedChapterFile } from "../lib/chapterGate";
import { practiceCardType } from "../lib/practiceSession";
import { reportBackendError } from "../lib/backendErrors";

/** A request to open another chapter of the open book. `open` shows the chapter. */
export interface ChapterMoveRequest {
  bookId: string;
  spine: ChapterMeta[];
  from: ChapterMeta | null;
  to: ChapterMeta;
  open: () => void;
}

/** An open Chapter Gatekeeper: the due cards of `from` to recall before `to` opens. */
export interface ChapterGate {
  from: ChapterMeta;
  to: ChapterMeta;
  cards: PracticeCardItem[];
  open: () => void;
}

/**
 * Chapter Gatekeeper, a soft gate. Before a move to a later chapter, the reader recalls up to `gatekeeperQuota`
 * due cards of the chapter they leave (`lib/chapterGate.ts` decides which moves are gated). The reader can skip it.
 */
export function useChapterGate(preferences: ReaderPreferences, level: ReadingLevelMode) {
  const [chapterGate, setChapterGate] = useState<ChapterGate | null>(null);
  const { gatekeeperMode, gatekeeperQuota, practiceMode } = preferences.study;
  const hybridRatio = preferences.study.hybridRatio ?? 0.5;

  const requestChapterMove = useCallback(
    async (move: ChapterMoveRequest) => {
      const { from, to } = move;
      const chapterFile = gatedChapterFile({ gatekeeperMode, level, spine: move.spine, from, to });
      if (!chapterFile || !from) {
        move.open();
        return;
      }

      try {
        const cards = await getChapterDueCards(
          move.bookId,
          chapterFile,
          practiceCardType(practiceMode),
          gatekeeperQuota,
          hybridRatio
        );
        if (cards.length === 0) {
          move.open();
        } else {
          setChapterGate({ from, to, cards, open: move.open });
        }
      } catch (err) {
        reportBackendError("The Chapter Gatekeeper cards did not load, so the chapter opened without the gate.", err);
        move.open();
      }
    },
    [gatekeeperMode, gatekeeperQuota, practiceMode, hybridRatio, level]
  );

  /** Opens the chapter behind the gate after the reader passes or skips it, and closes the gate. */
  const completeChapterGate = useCallback(() => {
    chapterGate?.open();
    setChapterGate(null);
  }, [chapterGate]);

  /** Closes the gate. The reader stays in the chapter. */
  const closeChapterGate = useCallback(() => setChapterGate(null), []);

  return { chapterGate, requestChapterMove, completeChapterGate, closeChapterGate };
}
