import React from "react";
import { Gauge, Eye, EyeOff, Play, Pause } from "lucide-react";
import { ReaderPreferences } from "../../lib/types";

interface ElementaryPacingControlsProps {
  preferences: ReaderPreferences;
  onPreferencesChange: (prefs: ReaderPreferences) => void;
  isPacingRunning?: boolean;
  onTogglePacer?: () => void;
}

export const ElementaryPacingControls: React.FC<ElementaryPacingControlsProps> = ({
  preferences,
  onPreferencesChange,
  isPacingRunning = false,
  onTogglePacer,
}) => {
  const elementary = preferences.elementary;

  const handleWpmChange = (delta: number) => {
    const next = Math.max(100, Math.min(800, elementary.pacerWpm + delta));
    onPreferencesChange({
      ...preferences,
      elementary: {
        ...elementary,
        pacerWpm: next,
      },
    });
  };

  const handleToggleFocusRuler = () => {
    onPreferencesChange({
      ...preferences,
      elementary: {
        ...elementary,
        focusRulerEnabled: !elementary.focusRulerEnabled,
      },
    });
  };

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0 animate-in fade-in duration-200">
      {/* Pacer WPM pill with +/- buttons */}
      <div className="flex items-center h-8 px-1 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.05] text-xs">
        <Gauge className="w-3.5 h-3.5 ml-1 mr-1 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <button
          onClick={() => handleWpmChange(-25)}
          disabled={elementary.pacerWpm <= 100}
          className="w-5 h-6 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-30"
          title="Decrease pacer speed (-25 WPM, shortcut: [)"
        >
          -
        </button>
        <span className="w-14 text-center font-mono font-semibold text-[11px] text-[var(--theme-text)] select-none">
          {elementary.pacerWpm} wpm
        </span>
        <button
          onClick={() => handleWpmChange(25)}
          disabled={elementary.pacerWpm >= 800}
          className="w-5 h-6 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-30"
          title="Increase pacer speed (+25 WPM, shortcut: ])"
        >
          +
        </button>
      </div>

      {/* Pacer Play / Pause Toggle Button */}
      {onTogglePacer && (
        <button
          onClick={onTogglePacer}
          className={`h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer ${
            isPacingRunning
              ? "bg-amber-500 hover:bg-amber-600 text-white shadow-sm ring-2 ring-amber-500/30 animate-pulse"
              : "text-[var(--theme-text)] bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30"
          }`}
          title={isPacingRunning ? "Pause Pacer (Alt + P)" : "Start Pacer (Alt + P)"}
          aria-label={isPacingRunning ? "Pause Pacer" : "Start Pacer"}
        >
          {isPacingRunning ? (
            <Pause className="w-3.5 h-3.5 text-white" />
          ) : (
            <Play className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 fill-current" />
          )}
          <span className="hidden sm:inline">
            {isPacingRunning ? "Pause" : "Play Pacer"}
          </span>
        </button>
      )}

      {/* Focus Ruler Quick Toggle */}
      <button
        onClick={handleToggleFocusRuler}
        className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
          elementary.focusRulerEnabled
            ? "text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-400/15"
            : "text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-black/5 dark:hover:bg-white/5"
        }`}
        title={
          elementary.focusRulerEnabled
            ? "Focus Ruler Active (Dims sibling paragraphs)"
            : "Enable Focus Ruler"
        }
      >
        {elementary.focusRulerEnabled ? (
          <Eye className="w-3.5 h-3.5" />
        ) : (
          <EyeOff className="w-3.5 h-3.5" />
        )}
      </button>

      <div className="w-[1px] h-4 bg-black/10 dark:bg-white/10 mx-0.5 flex-shrink-0" />
    </div>
  );
};
