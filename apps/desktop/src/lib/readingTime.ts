import { sameChapter, type ChapterRef } from "./readingPlace.ts";

/**
 * Reading time.
 *
 * The app counts how long the words of a chapter are on screen while its window has focus, and it learns from the
 * scroll position whether you got to the end of the chapter. It cannot see how many words you read, so it saves no word
 * count and shows no reading speed (AN-01).
 *
 * Before AN-01 every scroll started the count again, so time was lost while you scrolled. Every piece of time also
 * saved the word count of the whole chapter, which gave speeds like 21,357 words a minute. And a chapter kept the scroll
 * position of the chapter before it, so it could get the "Completed" mark of the chapter you left.
 */

/** The timer ticks this often. */
export const READING_TICK_MS = 1_000;

/** Reading time is saved in pieces of this many seconds, and the rest when the chapter leaves the screen. */
export const SECONDS_PER_PIECE = 15;

/** A chapter is finished once you have scrolled this far down it, in percent. */
export const FINISHED_PERCENT = 90;

/**
 * The longest time between two ticks that counts in full. The timer stops while the PC sleeps, and the first tick after
 * that must not count the sleep as reading.
 */
export const LONGEST_TICK_MS = 5_000;

/** One piece of reading time for one chapter. */
export interface ReadingPiece {
  seconds: number;
  /** True once you have scrolled to the end of the chapter while its words were on screen. */
  completed: boolean;
}

export interface ReadingTimer {
  /**
   * The words of `chapter` are on screen now, or the words of no chapter (null). The time of the chapter before that is
   * not saved yet is saved now.
   */
  show(chapter: ChapterRef | null, nowMs: number, focused: boolean): Promise<void>;
  /** A tick of the timer. The time since the last tick counts when the window has focus. */
  tick(nowMs: number, focused: boolean): void;
  /**
   * The reader scrolled `chapter` to `percent`. This counts only for the chapter on screen: the words of the chapter
   * you left stay on screen until the words of the next chapter arrive.
   */
  scrolled(chapter: ChapterRef | null, percent: number): void;
}

/** Counts reading time, and gives each piece to `save` with the chapter it was read in. */
export function createReadingTimer(save: (chapter: ChapterRef, piece: ReadingPiece) => unknown): ReadingTimer {
  let onScreen: ChapterRef | null = null;
  let lastTickMs = 0;
  let countedMs = 0;
  let finished = false;

  const count = (nowMs: number, focused: boolean) => {
    const sinceLastTick = nowMs - lastTickMs;
    lastTickMs = nowMs;
    if (focused && sinceLastTick > 0) countedMs += Math.min(sinceLastTick, LONGEST_TICK_MS);
  };

  return {
    async show(chapter, nowMs, focused) {
      if (sameChapter(onScreen, chapter)) return;
      // The save is started and given back, and everything below it is done before this waits for anything, so
      // the timer is ready for the next chapter whether the vault answers or not.
      let saving: unknown;
      if (onScreen) {
        count(nowMs, focused);
        const seconds = Math.round(countedMs / 1000);
        if (seconds > 0) saving = save(onScreen, { seconds, completed: finished });
      }
      onScreen = chapter;
      lastTickMs = nowMs;
      countedMs = 0;
      finished = false;
      await saving;
    },
    tick(nowMs, focused) {
      if (!onScreen) return;
      count(nowMs, focused);
      if (countedMs >= SECONDS_PER_PIECE * 1000) {
        countedMs -= SECONDS_PER_PIECE * 1000;
        save(onScreen, { seconds: SECONDS_PER_PIECE, completed: finished });
      }
    },
    scrolled(chapter, percent) {
      if (onScreen && sameChapter(onScreen, chapter) && percent >= FINISHED_PERCENT) finished = true;
    },
  };
}
