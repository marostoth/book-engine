import React from "react";
import { Gauge, Play, Pause } from "lucide-react";
import { ElementaryPreferences } from "../../lib/types";

interface PacerControlsProps {
  elementary: ElementaryPreferences;
  onUpdate: (patch: Partial<ElementaryPreferences>) => void;
  isPacingRunning?: boolean;
  onTogglePacer?: () => void;
}

export const PacerControls: React.FC<PacerControlsProps> = ({
  elementary,
  onUpdate,
  isPacingRunning = false,
  onTogglePacer,
}) => {
  const handlePacerWpmChange = (delta: number) => {
    const next = Math.max(100, Math.min(800, elementary.pacerWpm + delta));
    onUpdate({ pacerWpm: next });
  };

  const handleChunkSizeChange = (size: number) => {
    onUpdate({ pacerChunkSize: size });
  };

  return (
    <div className="space-y-3">
      {/* Direct Start / Pause Pacer Action Button */}
      {onTogglePacer && (
        <button
          type="button"
          onClick={onTogglePacer}
          className={`w-full py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold transition-all cursor-pointer shadow-sm ${
            isPacingRunning
              ? "bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-amber-500/40"
              : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-300 border border-amber-500/30"
          }`}
        >
          {isPacingRunning ? (
            <>
              <Pause className="w-3.5 h-3.5 text-white" />
              <span>Pause Pacer</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Pacer (Alt + P)</span>
            </>
          )}
        </button>
      )}

      {/* Pacer WPM Velocity */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
            <span className="font-semibold text-[var(--theme-text)]">Pacer Velocity</span>
          </div>
          <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
            Target speed-reading pacing pace
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--theme-bg)] p-1 rounded-lg border border-[var(--theme-border)]">
          <button
            type="button"
            onClick={() => handlePacerWpmChange(-25)}
            disabled={elementary.pacerWpm <= 100}
            className="w-6 h-6 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
            title="Decrease WPM (-25)"
          >
            -
          </button>
          <span className="w-14 text-center font-mono font-bold text-[var(--theme-text)]">
            {elementary.pacerWpm} wpm
          </span>
          <button
            type="button"
            onClick={() => handlePacerWpmChange(25)}
            disabled={elementary.pacerWpm >= 800}
            className="w-6 h-6 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
            title="Increase WPM (+25)"
          >
            +
          </button>
        </div>
      </div>

      {/* Pacer Mode */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium text-[var(--theme-muted)]">Pacer Mode</span>
        <div className="grid grid-cols-2 gap-1 bg-[var(--theme-bg)] p-0.5 rounded-lg border border-[var(--theme-border)]">
          <button
            type="button"
            onClick={() => onUpdate({ pacerMode: "line" })}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
              elementary.pacerMode === "line"
                ? "bg-[var(--theme-accent)] text-white font-semibold"
                : "text-[var(--theme-text)] hover:bg-[var(--theme-surface)]"
            }`}
          >
            Line Sweep
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ pacerMode: "underline" })}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
              elementary.pacerMode === "underline"
                ? "bg-[var(--theme-accent)] text-white font-semibold"
                : "text-[var(--theme-text)] hover:bg-[var(--theme-surface)]"
            }`}
          >
            Word Underline
          </button>
        </div>
      </div>

      {/* Underline Sub-Options: Chunk Size & Focus Lock */}
      {elementary.pacerMode === "underline" && (
        <div className="space-y-2 pt-1 pl-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--theme-muted)]">Fixation Chunk Size</span>
            <div className="grid grid-cols-3 gap-1 bg-[var(--theme-bg)] p-0.5 rounded-lg border border-[var(--theme-border)]">
              {[1, 2, 3].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => handleChunkSizeChange(size)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                    (elementary.pacerChunkSize || 2) === size
                      ? "bg-[var(--theme-accent)] text-white font-semibold"
                      : "text-[var(--theme-text)] hover:bg-[var(--theme-surface)]"
                  }`}
                >
                  {size} {size === 1 ? "Word" : "Words"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--theme-muted)]">
              Lock Focus Ruler to Pacer
            </span>
            <input
              type="checkbox"
              checked={elementary.pacerLockFocus ?? true}
              onChange={(e) => onUpdate({ pacerLockFocus: e.target.checked })}
              className="rounded border-[var(--theme-border)] text-[var(--theme-accent)] focus:ring-[var(--theme-accent)] cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--theme-muted)]">
              Tactile Drag Handle
            </span>
            <input
              type="checkbox"
              checked={elementary.pacerShowGripHandle ?? true}
              onChange={(e) => onUpdate({ pacerShowGripHandle: e.target.checked })}
              className="rounded border-[var(--theme-border)] text-[var(--theme-accent)] focus:ring-[var(--theme-accent)] cursor-pointer"
              title="Show tactile grip pill under underline for mouse/touch dragging"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--theme-muted)]">
              Line Click Scrubbing
            </span>
            <input
              type="checkbox"
              checked={elementary.pacerClickToScrub ?? true}
              onChange={(e) => onUpdate({ pacerClickToScrub: e.target.checked })}
              className="rounded border-[var(--theme-border)] text-[var(--theme-accent)] focus:ring-[var(--theme-accent)] cursor-pointer"
              title="Click anywhere along active line to jump the pacer highlight"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--theme-muted)]">
              Arrow Key Stepping
            </span>
            <input
              type="checkbox"
              checked={elementary.pacerKeyboardScrubbing ?? false}
              onChange={(e) => onUpdate({ pacerKeyboardScrubbing: e.target.checked })}
              className="rounded border-[var(--theme-border)] text-[var(--theme-accent)] focus:ring-[var(--theme-accent)] cursor-pointer"
              title="Navigate lines with Up/Down and scrub words with Left/Right"
            />
          </div>
        </div>
      )}
    </div>
  );
};
