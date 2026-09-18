import { test } from "vitest";
import assert from "node:assert/strict";
import {
  calculateDimOpacity,
  calculateWordDuration,
  calculateParagraphDuration,
  chunkWords,
  getChunkIndexAtProgress,
  CONTRAST_PRESETS,
  estimateLineWordCount,
  calculateLineDuration,
  calculateSeekProgress,
} from "./elementaryPacer.ts";

test("calculateDimOpacity clamps within bounds and enforces minimum floor", () => {
  // Soft 45% -> 0.55
  assert.strictEqual(calculateDimOpacity(45), 0.55);
  // Balanced 70% -> 0.30
  assert.strictEqual(calculateDimOpacity(70), 0.3);
  // High 88% -> 0.12
  assert.strictEqual(calculateDimOpacity(88), 0.12);
  // Deep 96% -> 0.04
  assert.strictEqual(calculateDimOpacity(96), 0.04);
  // Max clamp 98% -> 0.02
  assert.strictEqual(calculateDimOpacity(98), 0.02);
  // Beyond upper bound (>98) clamps to 98% -> 0.02
  assert.strictEqual(calculateDimOpacity(100), 0.02);
  // Beyond lower bound (<20) clamps to 20% -> 0.80
  assert.strictEqual(calculateDimOpacity(10), 0.8);
});

test("calculateWordDuration calculates accurate millisecond pace per WPM", () => {
  // 300 WPM = 60,000 / 300 = 200ms per word
  assert.strictEqual(calculateWordDuration(300), 200);
  // 600 WPM = 100ms per word
  assert.strictEqual(calculateWordDuration(600), 100);
  // Clamping at lower bound (100 WPM = 600ms)
  assert.strictEqual(calculateWordDuration(50), 600);
  // Clamping at upper bound (800 WPM = 75ms)
  assert.strictEqual(calculateWordDuration(1000), 75);
});

test("calculateParagraphDuration respects minimum floor and scales with word count", () => {
  // 10 words at 300 WPM = 2,000ms
  assert.strictEqual(calculateParagraphDuration(10, 300), 2000);
  // 2 words at 600 WPM = 200ms -> clamped to minimum floor 800ms
  assert.strictEqual(calculateParagraphDuration(2, 600), 800);
});

test("chunkWords slices word tokens into fixation groups", () => {
  const words = ["Market", "segmentation", "is", "the", "bedrock", "of", "strategy"];
  
  // Default chunk size 2
  const chunks2 = chunkWords(words, 2);
  assert.deepStrictEqual(chunks2, [
    ["Market", "segmentation"],
    ["is", "the"],
    ["bedrock", "of"],
    ["strategy"],
  ]);

  // Chunk size 3
  const chunks3 = chunkWords(words, 3);
  assert.deepStrictEqual(chunks3, [
    ["Market", "segmentation", "is"],
    ["the", "bedrock", "of"],
    ["strategy"],
  ]);

  // Chunk size 1 (word-by-word)
  const chunks1 = chunkWords(words, 1);
  assert.strictEqual(chunks1.length, 7);
  assert.deepStrictEqual(chunks1[0], ["Market"]);
});

test("getChunkIndexAtProgress maps linear progress correctly to chunk intervals", () => {
  const totalChunks = 5; // indices 0, 1, 2, 3, 4
  assert.strictEqual(getChunkIndexAtProgress(0.0, totalChunks), 0);
  assert.strictEqual(getChunkIndexAtProgress(0.19, totalChunks), 0);
  assert.strictEqual(getChunkIndexAtProgress(0.2, totalChunks), 1);
  assert.strictEqual(getChunkIndexAtProgress(0.5, totalChunks), 2);
  assert.strictEqual(getChunkIndexAtProgress(0.85, totalChunks), 4);
  assert.strictEqual(getChunkIndexAtProgress(1.0, totalChunks), 4);
});

test("CONTRAST_PRESETS matches standard design scale", () => {
  assert.strictEqual(CONTRAST_PRESETS.length, 4);
  assert.strictEqual(CONTRAST_PRESETS[0].id, "soft");
  assert.strictEqual(CONTRAST_PRESETS[3].id, "deep");
});

test("estimateLineWordCount estimates words proportionally to width with minimum of 1", () => {
  // 500px of 1000px with 20 total words = 10 words
  assert.strictEqual(estimateLineWordCount(500, 1000, 20), 10);
  // Zero width/words fallback to 1
  assert.strictEqual(estimateLineWordCount(0, 0, 0), 1);
  // Short line minimum 1
  assert.strictEqual(estimateLineWordCount(20, 1000, 10), 1);
});

test("calculateLineDuration calculates reading time with saccade pause and floor", () => {
  // 10 words at 300 WPM = 2000ms reading time + 60ms pause = 2060ms
  assert.strictEqual(calculateLineDuration(10, 300, 60), 2060);
  // 1 word at 600 WPM = 100ms reading time + 60ms pause = 160ms -> clamped to minimum floor 350ms
  assert.strictEqual(calculateLineDuration(1, 600, 60), 350);
});

test("calculateSeekProgress maps click coordinate safely to [0..1] progress", () => {
  // lineLeft=50, lineWidth=500, chunkWidth=100 -> travelDistance = 400
  // click at 50 (start) -> 0.0
  assert.strictEqual(calculateSeekProgress(50, 50, 500, 100), 0.0);
  // click at 250 (midpoint: (250-50)/400 = 0.5) -> 0.5
  assert.strictEqual(calculateSeekProgress(250, 50, 500, 100), 0.5);
  // click at 450 (end of travel: (450-50)/400 = 1.0) -> 1.0
  assert.strictEqual(calculateSeekProgress(450, 50, 500, 100), 1.0);
  // click before lineLeft (-20) -> clamped to 0.0
  assert.strictEqual(calculateSeekProgress(20, 50, 500, 100), 0.0);
  // click beyond travelDistance (600) -> clamped to 1.0
  assert.strictEqual(calculateSeekProgress(600, 50, 500, 100), 1.0);
});

