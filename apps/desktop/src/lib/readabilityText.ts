import { NO_DATA } from "./analyticsText.ts";
import type { ElementaryMetrics } from "./types.ts";

/**
 * What the sidebar shows of a book at the elementary level (TL-20): how hard its sentences are, and how long it takes
 * to read. The import measures all three for every book; for a long time no screen showed any of them.
 *
 * A book with no measures shows a dash for each, never a 0 (RD-15).
 */

/** The Flesch-Kincaid grade, such as "10.6": the school year whose reader finds these sentences easy. */
export function gradeText(metrics: ElementaryMetrics | undefined): string {
  return metrics ? metrics.flesch_kincaid_grade.toFixed(1) : NO_DATA;
}

/** The average sentence, such as "19.5 words". */
export function sentenceText(metrics: ElementaryMetrics | undefined): string {
  return metrics ? `${metrics.avg_sentence_length_words.toFixed(1)} words` : NO_DATA;
}

/** The time to read the whole book at 200 words a minute, such as "6 h 16 min", "1 h" or "45 min". */
export function bookTimeText(metrics: ElementaryMetrics | undefined): string {
  if (!metrics) return NO_DATA;
  const minutes = Math.round(metrics.estimated_reading_minutes);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
