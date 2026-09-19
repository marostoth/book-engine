import React from "react";
import { useSettings } from "../../hooks/useSettings";
import { useElementaryMechanics } from "./useElementaryMechanics";
import { PacingOverlay } from "./PacingOverlay";
import { FocusRuler } from "./FocusRuler";

/** The settings come from `useSettings`, not from props (RD-09). */
interface ElementaryCanvasProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  activeLevel?: string;
  isPacingRunning?: boolean;
  onTogglePacer?: () => void;
  children: React.ReactNode;
}

export const ElementaryCanvas: React.FC<ElementaryCanvasProps> = ({
  containerRef,
  activeLevel = "elementary",
  isPacingRunning,
  onTogglePacer,
  children,
}) => {
  const { settings: preferences, change: onPreferencesChange } = useSettings();
  const elementary = preferences.elementary;

  // Elementary pacing state & pacer speed keys ([, ]). Alt+P is handled in App.tsx.
  const {
    isRunning,
    activeAnchor,
    sweepProgress,
    isManualScrolling,
    advanceParagraph,
    wpm,
  } = useElementaryMechanics({
    preferences,
    onPreferencesChange,
    containerRef,
    activeLevel,
    controlledIsRunning: isPacingRunning,
    onToggleRunning: onTogglePacer,
  });

  // Enforce typographical measure: map measureCharsPerLine to ch max-width
  const cpl = elementary?.measureCharsPerLine || 72;
  const measureStyle: React.CSSProperties = {
    maxWidth: `${cpl}ch`,
  };

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* Reading Canvas with Dynamic Typographical Measure */}
      <div
        className="w-full mx-auto transition-all duration-200"
        style={measureStyle}
      >
        {children}
      </div>

      {/* Visual Pacer Laser / Beam / Chunk Underline Sweep */}
      <PacingOverlay
        containerRef={containerRef}
        activeAnchor={activeAnchor}
        sweepProgress={sweepProgress}
        isRunning={isRunning && activeLevel === "elementary"}
        pacerMode={elementary.pacerMode || "underline"}
        chunkSize={elementary.pacerChunkSize || 2}
        isManualScrolling={isManualScrolling}
        wpm={wpm}
        showGripHandle={elementary.pacerShowGripHandle ?? true}
        clickToScrub={elementary.pacerClickToScrub ?? true}
        keyboardScrubbing={elementary.pacerKeyboardScrubbing ?? false}
        onParagraphComplete={advanceParagraph}
      />

      {/* Focus Ruler: Dims inactive paragraphs & spotlights active text */}
      <FocusRuler
        containerRef={containerRef}
        enabled={elementary.focusRulerEnabled && activeLevel === "elementary"}
        dimmingPercent={elementary.focusDimmingPercent || 70}
        pacerActiveAnchor={activeAnchor}
        isPacerRunning={isRunning && activeLevel === "elementary"}
        pacerLockFocus={elementary.pacerLockFocus ?? true}
        activeHighlight={elementary.focusActiveHighlight ?? true}
      />
    </div>
  );
};
