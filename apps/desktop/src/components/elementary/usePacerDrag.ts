import { useState, useRef, useCallback, useEffect } from "react";
import { calculateSeekProgress } from "../../lib/elementaryPacer";
import { answersArrows, pacerShortcut, shortcutKey } from "../../lib/readerShortcuts";
import { aDialogIsOpen } from "../../hooks/useDialog";
import { LineBox } from "./useLinePacer";

interface UsePacerDragOptions {
  lines: LineBox[];
  overlayRef?: React.RefObject<HTMLDivElement | null>;
  chunkSize: number;
  onDragUpdate: (targetLineIndex: number, progress: number) => void;
  onDragEnd: (targetLineIndex: number, progress: number) => void;
}

/**
 * Custom hook for tactile direct-manipulation pointer dragging and scrubbing.
 * Resolves vertical cursor movement to the nearest line box and horizontal movement to clamped progress.
 *
 * A drag that never moved is not a drag, and ends nothing (TL-11). This used to be handed the line the pacer was
 * on, read out of the pacer's own ref WHILE THE COMPONENT WAS DRAWING, and it kept a copy of it that an effect
 * wrote again after every drawing. `react-hooks/refs` says so. The copy was there to answer "which line did this
 * drag end on" when nothing had moved - and the answer it gave, together with a progress left over from the drag
 * BEFORE, moved the reader. A tap on the overlay, or a gesture the browser cancelled, sent the pacer back to the
 * start of the line, or to wherever the last drag had ended. It ends only a drag that moved now, so nothing has
 * to tell it which line the pacer is on.
 */
export function usePacerDrag({ lines, overlayRef, chunkSize, onDragUpdate, onDragEnd }: UsePacerDragOptions) {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  /** Where the pointer last was, and whether it ever moved. Nothing is drawn from these, so they are refs. */
  const lastLineIdxRef = useRef<number>(0);
  const lastProgressRef = useRef<number>(0);
  const movedRef = useRef<boolean>(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    movedRef.current = false;
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
      movedRef.current = true;

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

      // A tap, or a gesture the browser cancelled, moved nothing, so there is nothing to end.
      if (movedRef.current) onDragEnd(lastLineIdxRef.current, lastProgressRef.current);
      movedRef.current = false;
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
 * Hook for optional keyboard arrow stepping (lines and words). `pacerShortcut` (`lib/readerShortcuts.ts`) says when
 * an arrow is the pacer's: never from an element that answers the arrows itself, and never behind a dialog.
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
      const shortcut = pacerShortcut(shortcutKey(e), aDialogIsOpen() || answersArrows(e.target));
      if (!shortcut) return;
      e.preventDefault();
      if (shortcut === "lineUp" || shortcut === "lineDown") onStepLine(shortcut === "lineUp" ? -1 : 1);
      else onStepChunk(shortcut === "chunkBack" ? -0.15 : 0.15);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, isRunning, onStepLine, onStepChunk]);
}
