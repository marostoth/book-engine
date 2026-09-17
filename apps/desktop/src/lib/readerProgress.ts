import { sameChapter, type ChapterRef } from "./readingPlace.ts";

/**
 * How far down a chapter the reader is.
 *
 * One turn of a wheel makes many scroll events, and the page sends one for every pixel it moves. Each report of the
 * progress changes a state of the app, so the app and every pane in it are drawn again. On the biggest chapters that
 * work was done tens of times for the same whole percent (RD-06). The reader therefore reports a percent only when
 * the whole number changes, or when another chapter is on screen.
 */

/** What the reader reads from the box the chapter scrolls in. */
export interface ScrollBox {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** How far down the box is, in whole percent. A chapter that fits on one screen is read to its end. */
export function scrollPercent(box: ScrollBox): number {
  const total = box.scrollHeight - box.clientHeight;
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((box.scrollTop / total) * 100)));
}

export interface ProgressTicker {
  /**
   * The percent to report for this scroll, or undefined when the reader is still on the same whole percent of the
   * same chapter, so that nothing has to be reported.
   */
  changed(box: ScrollBox, chapter: ChapterRef | null): number | undefined;
}

/** Keeps the percent that was reported last, so a scroll reports each whole percent of a chapter once. */
export function createProgressTicker(): ProgressTicker {
  let reported: { percent: number; chapter: ChapterRef | null } | null = null;

  return {
    changed(box, chapter) {
      const percent = scrollPercent(box);
      if (reported && reported.percent === percent && sameChapter(reported.chapter, chapter)) return undefined;
      reported = { percent, chapter };
      return percent;
    },
  };
}
