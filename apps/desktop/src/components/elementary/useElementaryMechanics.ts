import { useState, useEffect, useCallback, useRef } from "react";
import { ReaderPreferences } from "../../lib/types";
import { calculateParagraphDuration } from "../../lib/elementaryPacer";

interface UseElementaryMechanicsOptions {
  preferences: ReaderPreferences;
  onPreferencesChange?: (prefs: ReaderPreferences) => void;
  containerRef: React.RefObject<HTMLElement | null>;
  activeLevel?: string;
  controlledIsRunning?: boolean;
  onToggleRunning?: () => void;
}

export interface ElementaryMechanicsState {
  isRunning: boolean;
  setIsRunning: (running: boolean) => void;
  togglePacer: () => void;
  wpm: number;
  adjustWpm: (delta: number) => void;
  activeAnchor: string | null;
  activeParagraphIndex: number;
  sweepProgress: number; // 0 to 1 progress within active paragraph
  isManualScrolling: boolean;
  advanceParagraph: () => void;
}

export function useElementaryMechanics({
  preferences,
  onPreferencesChange,
  containerRef,
  activeLevel = "elementary",
  controlledIsRunning,
  onToggleRunning,
}: UseElementaryMechanicsOptions): ElementaryMechanicsState {
  const elementary = preferences.elementary;
  const [internalRunning, setInternalRunning] = useState<boolean>(false);
  const isRunning = controlledIsRunning !== undefined ? controlledIsRunning : internalRunning;

  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number>(0);
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const [sweepProgress, setSweepProgress] = useState<number>(0);
  const [isManualScrolling, setIsManualScrolling] = useState<boolean>(false);

  const scrollDebounceTimer = useRef<number | null>(null);
  const paragraphStartTime = useRef<number>(Date.now());
  const rafHandle = useRef<number | null>(null);

  const wpm = elementary.pacerWpm || 250;

  // Toggle Pacer play/pause (calls external controller if provided)
  const togglePacer = useCallback(() => {
    if (onToggleRunning) {
      onToggleRunning();
    } else {
      setInternalRunning((prev) => !prev);
    }
  }, [onToggleRunning]);

  const setIsRunning = useCallback(
    (running: boolean) => {
      if (onToggleRunning && running !== isRunning) {
        onToggleRunning();
      } else {
        setInternalRunning(running);
      }
    },
    [onToggleRunning, isRunning]
  );

  // Adjust WPM with bounds [100, 800]
  const adjustWpm = useCallback(
    (delta: number) => {
      const nextWpm = Math.max(100, Math.min(800, wpm + delta));
      if (onPreferencesChange) {
        onPreferencesChange({
          ...preferences,
          elementary: {
            ...preferences.elementary,
            pacerWpm: nextWpm,
          },
        });
      }
    },
    [wpm, preferences, onPreferencesChange]
  );

  // Advance paragraph to next or terminate at end of document
  const advanceParagraph = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const paragraphs = Array.from(container.querySelectorAll<HTMLElement>("[data-anchor]"));
    if (paragraphs.length === 0) return;

    setActiveParagraphIndex((prev) => {
      if (prev < paragraphs.length - 1) {
        return prev + 1;
      } else {
        setIsRunning(false);
        return prev;
      }
    });
    setSweepProgress(0);
    paragraphStartTime.current = Date.now();
  }, [containerRef, setIsRunning]);

  // Global Keyboard Shortcuts: Alt+P (toggle), '[' (-25 WPM), ']' (+25 WPM)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        togglePacer();
      } else if (activeLevel === "elementary" && e.key === "[") {
        e.preventDefault();
        adjustWpm(-25);
      } else if (activeLevel === "elementary" && e.key === "]") {
        e.preventDefault();
        adjustWpm(25);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeLevel, togglePacer, adjustWpm]);

  // Manual Scroll Interruption with 800ms debounce
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScrollInteraction = () => {
      if (!isRunning) return;
      setIsManualScrolling(true);
      if (scrollDebounceTimer.current) {
        window.clearTimeout(scrollDebounceTimer.current);
      }
      scrollDebounceTimer.current = window.setTimeout(() => {
        setIsManualScrolling(false);
        paragraphStartTime.current = Date.now();
      }, 800);
    };

    container.addEventListener("wheel", handleScrollInteraction, { passive: true });
    container.addEventListener("touchmove", handleScrollInteraction, { passive: true });

    return () => {
      container.removeEventListener("wheel", handleScrollInteraction);
      container.removeEventListener("touchmove", handleScrollInteraction);
      if (scrollDebounceTimer.current) window.clearTimeout(scrollDebounceTimer.current);
    };
  }, [containerRef, isRunning]);

  // Click on any paragraph to focus pacer
  useEffect(() => {
    const container = containerRef.current;
    if (!container || activeLevel !== "elementary") return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchorEl = target.closest<HTMLElement>("[data-anchor]");
      if (!anchorEl) return;
      const anchor = anchorEl.getAttribute("data-anchor");
      if (!anchor) return;

      const paragraphs = Array.from(container.querySelectorAll<HTMLElement>("[data-anchor]"));
      const idx = paragraphs.findIndex((p) => p.getAttribute("data-anchor") === anchor);
      if (idx !== -1) {
        setActiveParagraphIndex(idx);
        setSweepProgress(0);
        paragraphStartTime.current = Date.now();
      }
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [containerRef, activeLevel]);

  // Viewport-aware pacer launch: start at currently visible paragraph
  const prevRunningRef = useRef<boolean>(false);
  useEffect(() => {
    if (!prevRunningRef.current && isRunning) {
      const container = containerRef.current;
      if (container) {
        const paragraphs = Array.from(container.querySelectorAll<HTMLElement>("[data-anchor]"));
        if (paragraphs.length > 0) {
          const containerRect = container.getBoundingClientRect();
          const visibleIdx = paragraphs.findIndex((p) => {
            const r = p.getBoundingClientRect();
            return r.bottom > containerRect.top + 60 && r.top < containerRect.bottom - 60;
          });
          if (visibleIdx !== -1) {
            setActiveParagraphIndex(visibleIdx);
            setSweepProgress(0);
            paragraphStartTime.current = Date.now();
          }
        }
      }
    }
    prevRunningRef.current = isRunning;
  }, [isRunning, containerRef]);

  // Keep activeAnchor in sync with activeParagraphIndex & center in view
  useEffect(() => {
    if (activeLevel !== "elementary") return;
    const container = containerRef.current;
    if (!container) return;

    const paragraphs = Array.from(container.querySelectorAll<HTMLElement>("[data-anchor]"));
    if (paragraphs.length === 0) return;

    const targetIdx = Math.min(activeParagraphIndex, paragraphs.length - 1);
    const targetEl = paragraphs[targetIdx];
    if (!targetEl) return;

    const anchorAttr = targetEl.getAttribute("data-anchor");
    setActiveAnchor(anchorAttr ? `^${anchorAttr}` : null);

    if (isRunning) {
      const containerRect = container.getBoundingClientRect();
      const elRect = targetEl.getBoundingClientRect();
      const isOutOfView = elRect.top < containerRect.top + 50 || elRect.bottom > containerRect.bottom - 50;
      if (isOutOfView) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeParagraphIndex, isRunning, activeLevel, containerRef]);

  // RAF Pacer Loop for vertical laser sweep mode (when pacerMode === "line")
  useEffect(() => {
    const pacerMode = elementary.pacerMode || "underline";
    if (pacerMode !== "line" || !isRunning || isManualScrolling || activeLevel !== "elementary") {
      if (rafHandle.current) cancelAnimationFrame(rafHandle.current);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const paragraphs = Array.from(container.querySelectorAll<HTMLElement>("[data-anchor]"));
    if (paragraphs.length === 0) return;

    const targetIdx = Math.min(activeParagraphIndex, paragraphs.length - 1);
    const targetEl = paragraphs[targetIdx];
    if (!targetEl) return;

    const text = targetEl.textContent || "";
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const durationMs = calculateParagraphDuration(words, wpm);

    paragraphStartTime.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - paragraphStartTime.current;
      const progress = Math.min(1, elapsed / durationMs);
      setSweepProgress(progress);

      if (progress >= 1) {
        advanceParagraph();
      } else {
        rafHandle.current = requestAnimationFrame(tick);
      }
    };

    rafHandle.current = requestAnimationFrame(tick);

    return () => {
      if (rafHandle.current) cancelAnimationFrame(rafHandle.current);
    };
  }, [isRunning, isManualScrolling, activeParagraphIndex, wpm, activeLevel, containerRef, advanceParagraph, elementary.pacerMode]);

  return {
    isRunning,
    setIsRunning,
    togglePacer,
    wpm,
    adjustWpm,
    activeAnchor,
    activeParagraphIndex,
    sweepProgress,
    isManualScrolling,
    advanceParagraph,
  };
}
