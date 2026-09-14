/**
 * Pure mathematical & pacing helper utilities for Mortimer Adler Level 1 Elementary Reading mechanics.
 */

export const CONTRAST_PRESETS = [
  { id: "soft", label: "Soft", percent: 45, description: "Gentle focus reduction (0.55 opacity)" },
  { id: "balanced", label: "Balanced", percent: 70, description: "Standard reading focus (0.30 opacity)" },
  { id: "high", label: "High", percent: 88, description: "High-contrast isolation (0.12 opacity)" },
  { id: "deep", label: "Deep Focus", percent: 96, description: "Near-blackout deep focus (0.04 opacity)" },
] as const;

export type ContrastPresetId = typeof CONTRAST_PRESETS[number]["id"];

/**
 * Calculates sibling paragraph opacity from a user-configured dimming percentage [20..98].
 * Ensures a minimum visibility floor of 0.02 (2% opacity) even at 98% dimming.
 */
export function calculateDimOpacity(dimmingPercent: number): number {
  const clamped = Math.max(20, Math.min(98, dimmingPercent));
  const raw = (100 - clamped) / 100;
  return Math.max(0.02, parseFloat(raw.toFixed(3)));
}

/**
 * Computes individual word duration in milliseconds based on WPM [100..800].
 */
export function calculateWordDuration(wpm: number): number {
  const clampedWpm = Math.max(100, Math.min(800, wpm));
  return (60 * 1000) / clampedWpm;
}

/**
 * Computes total paragraph duration in milliseconds based on word count and WPM.
 */
export function calculateParagraphDuration(wordCount: number, wpm: number): number {
  const safeWords = Math.max(1, wordCount);
  const wordMs = calculateWordDuration(wpm);
  return Math.max(800, safeWords * wordMs);
}

/**
 * Splits an array of text words into discrete fixation chunks (1 to 4 words per jump).
 */
export function chunkWords(words: string[], chunkSize = 2): string[][] {
  const size = Math.max(1, Math.min(4, Math.floor(chunkSize)));
  const chunks: string[][] = [];
  for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size));
  }
  return chunks;
}

/**
 * Maps linear progress [0..1] within a paragraph to the active word/chunk index.
 */
export function getChunkIndexAtProgress(progress: number, totalChunks: number): number {
  if (totalChunks <= 0) return 0;
  const clamped = Math.max(0, Math.min(1, progress));
  return Math.min(totalChunks - 1, Math.floor(clamped * totalChunks));
}

/**
 * Estimates word count for an individual line based on its width relative to total paragraph width.
 */
export function estimateLineWordCount(lineWidth: number, totalWidth: number, totalWords: number): number {
  if (totalWidth <= 0 || totalWords <= 0) return 1;
  const ratio = Math.max(0.05, Math.min(1, lineWidth / totalWidth));
  return Math.max(1, Math.round(totalWords * ratio));
}

/**
 * Computes individual line duration in milliseconds based on word count, WPM, and return-sweep pause.
 * Enforces a minimum floor of 350ms to prevent short lines from flickering past.
 */
export function calculateLineDuration(wordsInLine: number, wpm: number, returnSweepPauseMs = 60): number {
  const safeWords = Math.max(1, wordsInLine);
  const wordMs = calculateWordDuration(wpm);
  const readingTime = safeWords * wordMs;
  return Math.max(350, Math.round(readingTime + returnSweepPauseMs));
}

/**
 * Computes intra-line progress [0..1] from a click or drag coordinate relative to line geometry.
 * Safely clamps between 0 and 1, taking chunk travel distance into account.
 */
export function calculateSeekProgress(
  clickX: number,
  lineLeft: number,
  lineWidth: number,
  chunkWidth: number
): number {
  const travelDistance = Math.max(1, lineWidth - chunkWidth);
  const relativeX = clickX - lineLeft;
  const progress = relativeX / travelDistance;
  return Math.max(0, Math.min(1, parseFloat(progress.toFixed(4))));
}

