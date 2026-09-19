import React from "react";
import { ReaderPreferences } from "../../lib/types";
import { Sparkles, BookA, LayoutTemplate } from "lucide-react";
import { PacerControls } from "./PacerControls";
import { FocusRulerControls } from "./FocusRulerControls";

interface ElementaryTabProps {
  preferences: ReaderPreferences;
  onPreferencesChange: (prefs: ReaderPreferences) => void;
  isBionic?: boolean;
  onToggleBionic?: () => void;
  isPacingRunning?: boolean;
  onTogglePacer?: () => void;
}

export const ElementaryTab: React.FC<ElementaryTabProps> = ({
  preferences,
  onPreferencesChange,
  isBionic,
  onToggleBionic,
  isPacingRunning,
  onTogglePacer,
}) => {
  const elementary = preferences.elementary;

  const updateElementary = (patch: Partial<typeof elementary>) => {
    onPreferencesChange({
      ...preferences,
      elementary: {
        ...elementary,
        ...patch,
      },
    });
  };

  const handleCplChange = (delta: number) => {
    const next = Math.max(45, Math.min(95, elementary.measureCharsPerLine + delta));
    updateElementary({ measureCharsPerLine: next });
  };

  const bionicActive = isBionic !== undefined ? isBionic : elementary.bionicFixationEnabled;

  const handleBionicToggle = () => {
    if (onToggleBionic) onToggleBionic();
    updateElementary({ bionicFixationEnabled: !bionicActive });
  };

  return (
    <div className="space-y-4 text-xs">
      {/* 1. Pacer Velocity & Visual Mode Controls */}
      <PacerControls
        elementary={elementary}
        onUpdate={updateElementary}
        isPacingRunning={isPacingRunning}
        onTogglePacer={onTogglePacer}
      />

      <div className="h-[1px] bg-[var(--theme-border)]" />

      {/* 2. Focus Ruler, Contrast Presets & Fine Dimming */}
      <FocusRulerControls elementary={elementary} onUpdate={updateElementary} />

      <div className="h-[1px] bg-[var(--theme-border)]" />

      {/* 3. Line Measure / Characters Per Line */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <LayoutTemplate className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
            <span className="font-semibold text-[var(--theme-text)]">Line Measure (CPL)</span>
          </div>
          <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
            Ideal column width (60-75 characters per line)
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--theme-bg)] p-1 rounded-lg border border-[var(--theme-border)]">
          <button
            type="button"
            aria-label="Narrower line measure"
            onClick={() => handleCplChange(-5)}
            disabled={elementary.measureCharsPerLine <= 45}
            className="w-6 h-6 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
          >
            -
          </button>
          <span className="w-12 text-center font-mono font-bold text-[var(--theme-text)]">
            {elementary.measureCharsPerLine} cpl
          </span>
          <button
            type="button"
            aria-label="Wider line measure"
            onClick={() => handleCplChange(5)}
            disabled={elementary.measureCharsPerLine >= 95}
            className="w-6 h-6 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      <div className="h-[1px] bg-[var(--theme-border)]" />

      {/* 4. Bionic Reading Fixation Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
            <span className="font-semibold text-[var(--theme-text)]">Bionic Eye Fixation</span>
          </div>
          <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
            Bold word prefixes to guide saccadic movement
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Bionic eye fixation"
          aria-checked={bionicActive}
          onClick={handleBionicToggle}
          className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer ${
            bionicActive ? "bg-[var(--theme-accent)]" : "bg-black/20 dark:bg-white/20"
          }`}
        >
          <div
            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
              bionicActive ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* 5. Instant Dictionary Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <BookA className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
            <span className="font-semibold text-[var(--theme-text)]">Instant Dictionary</span>
          </div>
          <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
            Quick lookup tooltip on double-clicking vocabulary
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Instant dictionary"
          aria-checked={elementary.instantDictionaryEnabled}
          onClick={() =>
            updateElementary({ instantDictionaryEnabled: !elementary.instantDictionaryEnabled })
          }
          className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer ${
            elementary.instantDictionaryEnabled
              ? "bg-[var(--theme-accent)]"
              : "bg-black/20 dark:bg-white/20"
          }`}
        >
          <div
            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
              elementary.instantDictionaryEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
};
