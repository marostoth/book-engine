import React from "react";
import { Play, Pause, RotateCcw, ClipboardCheck, Timer } from "lucide-react";
import { InspectionalSessionState } from "../../hooks/useInspectionalSession";

interface SkimTimerWidgetProps {
  session: InspectionalSessionState;
}

export const SkimTimerWidget: React.FC<SkimTimerWidgetProps> = ({ session }) => {
  const {
    secondsRemaining,
    isRunning,
    timeFormatted,
    toggleTimer,
    resetTimer,
    openExitModal,
  } = session;

  const isLowTime = secondsRemaining > 0 && secondsRemaining < 120;
  const isExpired = secondsRemaining === 0;

  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)]/90 shadow-sm backdrop-blur-sm select-none transition-all">
      {/* Timer Icon & Time Remaining Display */}
      <div className="flex items-center gap-1.5 font-mono text-xs font-semibold">
        <Timer
          className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${
            isExpired
              ? "text-red-500 animate-pulse"
              : isLowTime
              ? "text-amber-500 animate-pulse"
              : isRunning
              ? "text-[var(--theme-accent)]"
              : "text-[var(--theme-muted)]"
          }`}
        />
        <span
          className={`tracking-wider ${
            isExpired
              ? "text-red-500 font-bold"
              : isLowTime
              ? "text-amber-600 dark:text-amber-400 font-bold"
              : isRunning
              ? "text-[var(--theme-text)]"
              : "text-[var(--theme-muted)]"
          }`}
          title="Inspectional Skim Countdown"
        >
          {timeFormatted}
        </span>
      </div>

      <div className="w-[1px] h-3.5 bg-[var(--theme-border)] mx-0.5" />

      {/* Play / Pause button */}
      <button
        type="button"
        onClick={toggleTimer}
        className={`p-1 rounded-lg transition-colors cursor-pointer ${
          isRunning
            ? "text-amber-700 dark:text-nord-accent bg-amber-500/15 dark:bg-nord-accent/20 hover:bg-amber-500/25"
            : "text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-black/5 dark:hover:bg-white/10"
        }`}
        title={isRunning ? "Pause Skim Timer" : "Start Skim Timer"}
        aria-label={isRunning ? "Pause Skim Timer" : "Start Skim Timer"}
      >
        {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>

      {/* Reset button */}
      <button
        type="button"
        onClick={resetTimer}
        className="p-1 rounded-lg text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
        title="Reset Timer"
        aria-label="Reset Timer"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      <div className="w-[1px] h-3.5 bg-[var(--theme-border)] mx-0.5" />

      {/* Exit Card Trigger Button */}
      <button
        type="button"
        onClick={openExitModal}
        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--theme-accent)]/15 hover:bg-[var(--theme-accent)]/25 text-[var(--theme-text)] text-xs font-medium border border-[var(--theme-accent)]/30 transition-all cursor-pointer"
        title="Open Inspectional Exit Assessment Modal"
      >
        <ClipboardCheck className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
        <span className="hidden sm:inline text-[11px] font-semibold">Exit Card</span>
      </button>
    </div>
  );
};
