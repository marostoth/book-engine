import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { ElementaryPreferences } from "../../lib/types";
import { CONTRAST_PRESETS } from "../../lib/elementaryPacer";

interface FocusRulerControlsProps {
  elementary: ElementaryPreferences;
  onUpdate: (patch: Partial<ElementaryPreferences>) => void;
}

export const FocusRulerControls: React.FC<FocusRulerControlsProps> = ({
  elementary,
  onUpdate,
}) => {
  const handleDimmingChange = (delta: number) => {
    const current = elementary.focusDimmingPercent || 70;
    const next = Math.max(20, Math.min(98, current + delta));
    onUpdate({ focusDimmingPercent: next });
  };

  const handlePresetSelect = (percent: number) => {
    onUpdate({ focusDimmingPercent: percent });
  };

  return (
    <div className="space-y-3">
      {/* Focus Ruler Main Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {elementary.focusRulerEnabled ? (
              <Eye className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
            ) : (
              <EyeOff className="w-4 h-4 text-[var(--theme-muted)] flex-shrink-0" />
            )}
            <span className="font-semibold text-[var(--theme-text)]">Focus Ruler</span>
          </div>
          <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
            Dim non-active paragraphs to isolate reading attention
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Focus ruler"
          aria-checked={elementary.focusRulerEnabled}
          onClick={() => onUpdate({ focusRulerEnabled: !elementary.focusRulerEnabled })}
          className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer ${
            elementary.focusRulerEnabled ? "bg-[var(--theme-accent)]" : "bg-black/20 dark:bg-white/20"
          }`}
        >
          <div
            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
              elementary.focusRulerEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {elementary.focusRulerEnabled && (
        <div className="space-y-2.5 pt-1 pl-1">
          {/* Contrast Presets */}
          <div>
            <span className="text-[11px] font-medium text-[var(--theme-muted)] block mb-1.5">
              Contrast Presets
            </span>
            <div className="grid grid-cols-4 gap-1">
              {CONTRAST_PRESETS.map((preset) => {
                const isSelected = Math.abs((elementary.focusDimmingPercent || 70) - preset.percent) <= 3;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetSelect(preset.percent)}
                    title={preset.description}
                    className={`px-1.5 py-1 rounded text-[10px] font-medium transition-all text-center border ${
                      isSelected
                        ? "bg-[var(--theme-accent)] text-white font-semibold border-[var(--theme-accent)] shadow-sm"
                        : "bg-[var(--theme-bg)] text-[var(--theme-text)] border-[var(--theme-border)] hover:bg-[var(--theme-surface)]"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fine Contrast Stepper */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--theme-muted)]">Fine Dimming Level</span>
            <div className="flex items-center gap-1.5 bg-[var(--theme-bg)] p-1 rounded-lg border border-[var(--theme-border)]">
              <button
                type="button"
                onClick={() => handleDimmingChange(-2)}
                disabled={(elementary.focusDimmingPercent || 70) <= 20}
                className="w-5 h-5 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
                title="Decrease dimming (-2%)"
              >
                -
              </button>
              <span className="w-10 text-center font-mono font-bold text-[var(--theme-text)]">
                {elementary.focusDimmingPercent || 70}%
              </span>
              <button
                type="button"
                onClick={() => handleDimmingChange(2)}
                disabled={(elementary.focusDimmingPercent || 70) >= 98}
                className="w-5 h-5 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
                title="Increase dimming (+2%)"
              >
                +
              </button>
            </div>
          </div>

          {/* Active Paragraph Highlight Accent */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-[var(--theme-muted)]">
              Spotlight active paragraph
            </span>
            <input
              type="checkbox"
              checked={elementary.focusActiveHighlight ?? true}
              onChange={(e) => onUpdate({ focusActiveHighlight: e.target.checked })}
              className="rounded border-[var(--theme-border)] text-[var(--theme-accent)] focus:ring-[var(--theme-accent)] cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
};
