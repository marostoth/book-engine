import { useState, useEffect, useRef, useCallback } from "react";
import { estimateLineWordCount, calculateLineDuration } from "../../lib/elementaryPacer";
import { usePacerDrag, usePacerKeyboard } from "./usePacerDrag";

export interface LineBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface ActiveLineInfo {
  line: LineBox;
  chunkLeft: number;
  chunkWidth: number;
  lineIndex: number;
  lineProgress: number;
}

interface UseLinePacerOptions {
  lines: LineBox[];
  totalWords: number;
  wpm: number;
  chunkSize: number;
  isRunning: boolean;
  isManualScrolling: boolean;
  activeAnchor: string | null;
  overlayRef?: React.RefObject<HTMLDivElement | null>;
  keyboardScrubbing?: boolean;
  onParagraphComplete?: () => void;
}

/**
 * Hook to manage discrete line-by-line pacer animation and direct tactile manipulation.
 * Supports:
 * 1. Instantaneous vertical drop between lines (no diagonal slide).
 * 2. 60ms return-sweep saccade pause at line start (pinning progress to word 1).
 * 3. Tactile dragging (pointer capture) for horizontal scrub and vertical line jumping.
 * 4. Direct seek and optional keyboard arrow stepping.
 */
export function useLinePacer({
  lines,
  totalWords,
  wpm,
  chunkSize,
  isRunning,
  isManualScrolling,
  activeAnchor,
  overlayRef,
  keyboardScrubbing = false,
  onParagraphComplete,
}: UseLinePacerOptions) {
  const [activeLineInfo, setActiveLineInfo] = useState<ActiveLineInfo | null>(null);

  const lineIndexRef = useRef<number>(0);
  const currentProgressRef = useRef<number>(0);
  const [firstShownAt] = useState(() => Date.now());
  const lineStartTimeRef = useRef<number>(firstShownAt);
  const rafHandle = useRef<number | null>(null);

  const onParagraphCompleteRef = useRef(onParagraphComplete);
  useEffect(() => {
    onParagraphCompleteRef.current = onParagraphComplete;
  });

  const prevAnchorRef = useRef<string | null>(activeAnchor);
  const pausedAtRef = useRef<number | null>(null);

  // Reset line state when active paragraph anchor changes
  useEffect(() => {
    if (activeAnchor !== prevAnchorRef.current) {
      prevAnchorRef.current = activeAnchor;
      lineIndexRef.current = 0;
      currentProgressRef.current = 0;
      lineStartTimeRef.current = Date.now();
      pausedAtRef.current = null;
      setActiveLineInfo(null);
    }
  }, [activeAnchor]);

  // Handle play/pause transitions with pause-duration offset
  useEffect(() => {
    if (!isRunning) {
      pausedAtRef.current = Date.now();
      if (rafHandle.current) cancelAnimationFrame(rafHandle.current);
    } else if (pausedAtRef.current !== null) {
      const pausedDuration = Date.now() - pausedAtRef.current;
      lineStartTimeRef.current += pausedDuration;
      pausedAtRef.current = null;
    }
  }, [isRunning]);

  // Fallback for non-text or empty paragraphs: auto-advance after brief delay
  useEffect(() => {
    if (isRunning && activeAnchor && lines.length === 0) {
      const timer = window.setTimeout(() => {
        onParagraphCompleteRef.current?.();
      }, 400);
      return () => window.clearTimeout(timer);
    }
  }, [isRunning, activeAnchor, lines.length]);

  // Seek pacer to specific line and horizontal progress ratio [0..1]
  const seekLinePosition = useCallback(
    (targetLineIndex: number, progressRatio: number) => {
      if (lines.length === 0) return;
      const idx = Math.max(0, Math.min(lines.length - 1, targetLineIndex));
      const targetLine = lines[idx];
      const clampedProgress = Math.max(0, Math.min(1, progressRatio));

      const chunkWidthRatio = Math.min(0.35, Math.max(0.12, chunkSize * 0.1));
      const chunkWidth = Math.max(40, targetLine.width * chunkWidthRatio);
      const travelDistance = Math.max(0, targetLine.width - chunkWidth);
      const chunkLeft = targetLine.left + clampedProgress * travelDistance;

      lineIndexRef.current = idx;
      currentProgressRef.current = clampedProgress;

      const totalWidth = lines.reduce((sum, l) => sum + l.width, 0);
      const lineWords = estimateLineWordCount(targetLine.width, totalWidth, totalWords);
      const lineDuration = calculateLineDuration(lineWords, wpm, 60);
      const elapsed = 60 + clampedProgress * Math.max(1, lineDuration - 60);
      lineStartTimeRef.current = Date.now() - elapsed;

      setActiveLineInfo({
        line: targetLine,
        chunkLeft,
        chunkWidth,
        lineIndex: idx,
        lineProgress: clampedProgress,
      });
    },
    [lines, chunkSize, totalWords, wpm]
  );

  const stepLine = useCallback(
    (delta: number) => {
      seekLinePosition(lineIndexRef.current + delta, 0);
    },
    [seekLinePosition]
  );

  const stepChunk = useCallback(
    (deltaRatio: number) => {
      seekLinePosition(lineIndexRef.current, currentProgressRef.current + deltaRatio);
    },
    [seekLinePosition]
  );

  // Hook for pointer drag scrubbing
  const {
    isDragging,
    isDraggingRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = usePacerDrag({
    lines,
    overlayRef,
    chunkSize,
    onDragUpdate: (bestIdx, progress) => {
      const targetLine = lines[bestIdx];
      const chunkWidthRatio = Math.min(0.35, Math.max(0.12, chunkSize * 0.1));
      const chunkWidth = Math.max(40, targetLine.width * chunkWidthRatio);
      const travelDistance = Math.max(0, targetLine.width - chunkWidth);
      const chunkLeft = targetLine.left + progress * travelDistance;

      lineIndexRef.current = bestIdx;
      currentProgressRef.current = progress;

      setActiveLineInfo({
        line: targetLine,
        chunkLeft,
        chunkWidth,
        lineIndex: bestIdx,
        lineProgress: progress,
      });
    },
    onDragEnd: (finalIdx, finalProgress) => {
      const targetLine = lines[finalIdx];
      if (targetLine) {
        const totalWidth = lines.reduce((sum, l) => sum + l.width, 0);
        const lineWords = estimateLineWordCount(targetLine.width, totalWidth, totalWords);
        const lineDuration = calculateLineDuration(lineWords, wpm, 60);
        const elapsed = 60 + finalProgress * Math.max(1, lineDuration - 60);
        lineStartTimeRef.current = Date.now() - elapsed;
      }
    },
  });

  // Optional keyboard arrow navigation
  usePacerKeyboard({
    enabled: keyboardScrubbing,
    isRunning,
    onStepLine: stepLine,
    onStepChunk: stepChunk,
  });

  // Main RAF line pacing loop
  useEffect(() => {
    if (!isRunning || isManualScrolling || lines.length === 0) {
      if (rafHandle.current) cancelAnimationFrame(rafHandle.current);
      return;
    }

    const totalWidth = lines.reduce((sum, l) => sum + l.width, 0);

    const tick = () => {
      if (isDraggingRef.current) {
        rafHandle.current = requestAnimationFrame(tick);
        return;
      }

      const idx = Math.min(lineIndexRef.current, lines.length - 1);
      if (lineIndexRef.current >= lines.length) {
        onParagraphCompleteRef.current?.();
        return;
      }

      const currentLine = lines[idx];
      const lineWords = estimateLineWordCount(currentLine.width, totalWidth, totalWords);
      const lineDuration = calculateLineDuration(lineWords, wpm, 60);

      const elapsed = Date.now() - lineStartTimeRef.current;

      // 60ms saccadic return sweep pause: keep progress pinned at 0
      let progress = 0;
      if (elapsed > 60) {
        progress = Math.min(1, (elapsed - 60) / Math.max(1, lineDuration - 60));
      }
      currentProgressRef.current = progress;

      const chunkWidthRatio = Math.min(0.35, Math.max(0.12, chunkSize * 0.1));
      const chunkWidth = Math.max(40, currentLine.width * chunkWidthRatio);
      const travelDistance = Math.max(0, currentLine.width - chunkWidth);
      const chunkLeft = currentLine.left + progress * travelDistance;

      setActiveLineInfo({
        line: currentLine,
        chunkLeft,
        chunkWidth,
        lineIndex: idx,
        lineProgress: progress,
      });

      if (elapsed >= lineDuration) {
        if (idx < lines.length - 1) {
          lineIndexRef.current = idx + 1;
          currentProgressRef.current = 0;
          lineStartTimeRef.current = Date.now();
          rafHandle.current = requestAnimationFrame(tick);
        } else {
          onParagraphCompleteRef.current?.();
        }
      } else {
        rafHandle.current = requestAnimationFrame(tick);
      }
    };

    rafHandle.current = requestAnimationFrame(tick);

    return () => {
      if (rafHandle.current) cancelAnimationFrame(rafHandle.current);
    };
  }, [isRunning, isManualScrolling, lines, totalWords, wpm, chunkSize, isDraggingRef]);

  const resetLinePacer = useCallback(() => {
    lineIndexRef.current = 0;
    currentProgressRef.current = 0;
    lineStartTimeRef.current = Date.now();
    pausedAtRef.current = null;
    setActiveLineInfo(null);
  }, []);

  return {
    activeLineInfo,
    isDragging,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    seekLinePosition,
    stepLine,
    stepChunk,
    resetLinePacer,
  };
}
