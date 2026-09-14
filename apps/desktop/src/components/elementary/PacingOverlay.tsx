import React, { useEffect, useState, useCallback, useRef } from "react";
import { useLinePacer, LineBox } from "./useLinePacer";
import { calculateSeekProgress } from "../../lib/elementaryPacer";

interface PacingOverlayProps {
  containerRef: React.RefObject<HTMLElement | null>;
  activeAnchor: string | null;
  sweepProgress: number; // 0 to 1 (for vertical laser sweep)
  isRunning: boolean;
  pacerMode: "line" | "underline";
  chunkSize?: number;
  isManualScrolling?: boolean;
  wpm?: number;
  showGripHandle?: boolean;
  clickToScrub?: boolean;
  keyboardScrubbing?: boolean;
  onParagraphComplete?: () => void;
}

interface TargetMetrics {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Extracts rendered line boxes from paragraph text fragments using Range.getClientRects()
 * measured relative to the local overlay container.
 */
function extractUnifiedLines(el: HTMLElement, overlay: HTMLElement): LineBox[] {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rawRects = Array.from(range.getClientRects());
  if (rawRects.length === 0) return [];

  const overlayRect = overlay.getBoundingClientRect();

  const lines: LineBox[] = [];
  for (const raw of rawRects) {
    if (raw.width <= 2 || raw.height <= 2) continue;

    const top = raw.top - overlayRect.top;
    const bottom = raw.bottom - overlayRect.top;
    const left = raw.left - overlayRect.left;
    const right = raw.right - overlayRect.left;

    // Merge fragments belonging to the same horizontal text line (within 6px vertical delta)
    const existing = lines.find((line) => Math.abs(line.top - top) < 6);
    if (existing) {
      existing.left = Math.min(existing.left, left);
      existing.right = Math.max(existing.right, right);
      existing.width = existing.right - existing.left;
      existing.top = Math.min(existing.top, top);
      existing.bottom = Math.max(existing.bottom, bottom);
      existing.height = existing.bottom - existing.top;
    } else {
      lines.push({ top, bottom, left, right, width: right - left, height: bottom - top });
    }
  }

  lines.sort((a, b) => a.top - b.top);
  return lines;
}

export const PacingOverlay: React.FC<PacingOverlayProps> = ({
  containerRef,
  activeAnchor,
  sweepProgress,
  isRunning,
  pacerMode,
  chunkSize = 2,
  isManualScrolling = false,
  wpm = 250,
  showGripHandle = true,
  clickToScrub = true,
  keyboardScrubbing = false,
  onParagraphComplete,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<TargetMetrics | null>(null);
  const [lines, setLines] = useState<LineBox[]>([]);
  const [totalWords, setTotalWords] = useState<number>(0);

  const updateGeometry = useCallback(() => {
    const container = containerRef.current;
    const overlay = overlayRef.current;
    if (!isRunning || !activeAnchor || !container || !overlay) {
      setMetrics(null);
      setLines([]);
      setTotalWords(0);
      return;
    }

    const cleanAnchor = activeAnchor.replace(/^\^/, "");
    const targetEl = container.querySelector<HTMLElement>(`[data-anchor="${cleanAnchor}"]`);

    if (!targetEl) {
      setMetrics(null);
      setLines([]);
      setTotalWords(0);
      return;
    }

    const overlayRect = overlay.getBoundingClientRect();
    const elRect = targetEl.getBoundingClientRect();

    setMetrics({
      top: elRect.top - overlayRect.top,
      left: elRect.left - overlayRect.left,
      width: elRect.width,
      height: elRect.height,
    });

    const detectedLines = extractUnifiedLines(targetEl, overlay);
    setLines(detectedLines);

    const text = targetEl.textContent || "";
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    setTotalWords(words);
  }, [isRunning, activeAnchor, containerRef]);

  useEffect(() => {
    updateGeometry();
    const rafId = requestAnimationFrame(updateGeometry);

    const overlay = overlayRef.current;
    let observer: ResizeObserver | null = null;
    if (overlay && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => updateGeometry());
      observer.observe(overlay);
    }

    window.addEventListener("resize", updateGeometry);
    return () => {
      cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
      window.removeEventListener("resize", updateGeometry);
    };
  }, [updateGeometry]);

  // Hook driving discrete line pacing and direct tactile dragging
  const {
    activeLineInfo,
    isDragging,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    seekLinePosition,
  } = useLinePacer({
    lines,
    totalWords,
    wpm,
    chunkSize,
    isRunning: isRunning && pacerMode === "underline",
    isManualScrolling,
    activeAnchor,
    overlayRef,
    keyboardScrubbing,
    onParagraphComplete,
  });

  const sweepY = metrics ? metrics.top + metrics.height * sweepProgress : 0;
  const isVisible = isRunning && metrics !== null;

  return (
    <div
      ref={overlayRef}
      className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-200 ${
        !isVisible ? "opacity-0" : isManualScrolling ? "opacity-30" : "opacity-100"
      }`}
    >
      {isVisible && (
        <>
          {pacerMode === "line" ? (
            /* Vertical Laser Sweep Bar Mode (No lagging CSS transitions on position) */
            <div
              className="absolute pointer-events-none"
              style={{
                top: `${sweepY}px`,
                left: `${metrics.left}px`,
                width: `${metrics.width}px`,
                height: "2px",
              }}
            >
              <div className="w-full h-full bg-gradient-to-r from-transparent via-amber-500/70 dark:via-amber-400/80 to-transparent shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
            </div>
          ) : activeLineInfo ? (
            /* Chunk-Aware Line & Word Underline Mode with Direct Drag & Click Scrubbing */
            <div className="pointer-events-none">
              {/* Subtle line baseline guide with click-to-scrub hit area */}
              <div
                onClick={
                  clickToScrub
                    ? (e) => {
                        const overlay = overlayRef.current;
                        if (!overlay) return;
                        const overlayRect = overlay.getBoundingClientRect();
                        const clickRelX = e.clientX - overlayRect.left;
                        const progress = calculateSeekProgress(
                          clickRelX,
                          activeLineInfo.line.left,
                          activeLineInfo.line.width,
                          activeLineInfo.chunkWidth
                        );
                        seekLinePosition(activeLineInfo.lineIndex, progress);
                      }
                    : undefined
                }
                className={`absolute h-[1.5px] bg-amber-500/30 dark:bg-amber-400/30 ${
                  clickToScrub
                    ? "cursor-pointer pointer-events-auto before:absolute before:-top-2 before:-bottom-2 before:left-0 before:right-0 before:content-['']"
                    : "pointer-events-none"
                }`}
                style={{
                  top: `${activeLineInfo.line.bottom - 1}px`,
                  left: `${activeLineInfo.line.left}px`,
                  width: `${activeLineInfo.line.width}px`,
                }}
                title={clickToScrub ? "Click along line to jump pacer" : undefined}
              />

              {/* Active chunk subtle word glow highlight */}
              <div
                className="absolute rounded bg-amber-500/20 dark:bg-amber-400/25 pointer-events-none"
                style={{
                  top: `${activeLineInfo.line.top}px`,
                  left: `${activeLineInfo.chunkLeft}px`,
                  width: `${activeLineInfo.chunkWidth}px`,
                  height: `${activeLineInfo.line.height}px`,
                }}
              />

              {/* Active chunk high-visibility underline bar with direct drag manipulation */}
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className={`absolute h-[3.5px] rounded-full bg-amber-500 dark:bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.85)] cursor-grab active:cursor-grabbing pointer-events-auto select-none touch-none ${
                  isDragging ? "ring-2 ring-amber-400/70 scale-y-110" : ""
                }`}
                style={{
                  top: `${activeLineInfo.line.bottom - 2}px`,
                  left: `${activeLineInfo.chunkLeft}px`,
                  width: `${activeLineInfo.chunkWidth}px`,
                }}
                title="Drag left/right to scrub words, up/down to switch lines"
              >
                {/* Tactile drag grip handle pill */}
                {showGripHandle && (
                  <div
                    className={`absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full cursor-grab active:cursor-grabbing pointer-events-auto transition-transform ${
                      isDragging
                        ? "bg-amber-600 dark:bg-amber-300 scale-125 shadow-[0_0_8px_rgba(245,158,11,0.9)]"
                        : "bg-amber-500/70 dark:bg-amber-400/70 hover:bg-amber-500 hover:scale-110 shadow-sm"
                    }`}
                  />
                )}
              </div>
            </div>
          ) : (
            /* Fallback Underline if line detection is initializing */
            <div
              className="absolute pointer-events-none"
              style={{
                top: `${metrics.top}px`,
                left: `${metrics.left}px`,
                width: `${metrics.width}px`,
                height: `${metrics.height}px`,
              }}
            >
              <div
                className="absolute bottom-0 left-0 h-[2.5px] bg-amber-500/80 dark:bg-amber-400/80 rounded-full shadow-[0_0_6px_rgba(245,158,11,0.5)]"
                style={{ width: `${sweepProgress * 100}%` }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};
