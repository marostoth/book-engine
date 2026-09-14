import { useState, useRef, useCallback, useEffect } from "react";
import { calculateSeekProgress } from "../../lib/elementaryPacer";
import { LineBox } from "./useLinePacer";

interface UsePacerDragOptions {
  lines: LineBox[];
  overlayRef?: React.RefObject<HTMLDivElement | null>;
  chunkSize: number;
  currentLineIndex: number;
  onDragUpdate: (targetLineIndex: number, progress: number) => void;
  onDragEnd: (targetLineIndex: number, progress: number) => void;
}

/**
 * Custom hook for tactile direct-manipulation pointer dragging and scrubbing.
 * Resolves vertical cursor movement to the nearest line box and horizontal movement to clamped progress.
 */
export function usePacerDrag({
  lines,
  overlayRef,
  chunkSize,
  currentLineIndex,
  onDragUpdate,
  onDragEnd,
}: UsePacerDragOptions) {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const lastLineIdxRef = useRef<number>(currentLineIndex);
  const lastProgressRef = useRef<number>(0);

  lastLineIdxRef.current = currentLineIndex;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current || lines.length === 0) return;
      e.preventDefault();
      e.stopPropagation();

      const overlay = overlayRef?.current;
      if (!overlay) return;

      const overlayRect = overlay.getBoundingClientRect();
      const relX = e.clientX - overlayRect.left;
      const relY = e.clientY - overlayRect.top;

      // Find line with closest vertical center to pointer
      let bestIdx = lastLineIdxRef.current;
      let bestDist = Infinity;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const centerY = (l.top + l.bottom) / 2;
        const dist = Math.abs(relY - centerY);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      const targetLine = lines[bestIdx];
      const chunkWidthRatio = Math.min(0.35, Math.max(0.12, chunkSize * 0.1));
      const chunkWidth = Math.max(40, targetLine.width * chunkWidthRatio);
      const progress = calculateSeekProgress(relX, targetLine.left, targetLine.width, chunkWidth);

      lastLineIdxRef.current = bestIdx;
      lastProgressRef.current = progress;

      onDragUpdate(bestIdx, progress);
    },
    [lines, overlayRef, chunkSize, onDragUpdate]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = false;
      setIsDragging(false);

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      onDragEnd(lastLineIdxRef.current, lastProgressRef.current);
    },
    [onDragEnd]
  );

  return {
    isDragging,
    isDraggingRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}

/**
 * Hook for optional keyboard arrow stepping (lines and words).
 */
export function usePacerKeyboard({
  enabled,
  isRunning,
  onStepLine,
  onStepChunk,
}: {
  enabled: boolean;
  isRunning: boolean;
  onStepLine: (delta: number) => void;
  onStepChunk: (delta: number) => void;
}) {
  useEffect(() => {
    if (!enabled || !isRunning) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        onStepLine(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        onStepLine(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onStepChunk(-0.15);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onStepChunk(0.15);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, isRunning, onStepLine, onStepChunk]);
}
