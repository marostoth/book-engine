import React from "react";
import { Theme } from "../../lib/types";
import { useSettings } from "../../hooks/useSettings";
import { Sun, Coffee, Moon, Type, AlignLeft } from "lucide-react";

/** The settings come from `useSettings`, not from props (RD-09). */
interface GeneralTabProps {
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({
  theme = "paper",
  onThemeChange,
}) => {
  const { settings: preferences, change: onPreferencesChange } = useSettings();
  const general = preferences.general ?? {
    theme: "paper",
    fontSize: 16,
    lineHeightRatio: 1.85,
    fontFamily: "serif",
  };

  const updateGeneral = (patch: Partial<typeof general>) => {
    onPreferencesChange({
      ...preferences,
      general: {
        ...general,
        ...patch,
      },
    });
  };

  const handleThemeSelect = (t: Theme) => {
    if (onThemeChange) onThemeChange(t);
    updateGeneral({ theme: t });
  };

  const handleFontSizeChange = (delta: number) => {
    const next = Math.max(12, Math.min(26, general.fontSize + delta));
    updateGeneral({ fontSize: next });
  };

  const handleLineHeightChange = (delta: number) => {
    const next = Math.round(Math.max(1.3, Math.min(2.4, general.lineHeightRatio + delta)) * 100) / 100;
    updateGeneral({ lineHeightRatio: next });
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Theme Palette Selection */}
      <div>
        <label className="block text-[11px] font-semibold text-[var(--theme-muted)] mb-2 uppercase tracking-wider">
          Reading Palette
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handleThemeSelect("paper")}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border font-medium transition-all ${
              theme === "paper"
                ? "border-[var(--theme-accent)] bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] font-semibold shadow-sm"
                : "border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-text)] hover:bg-[var(--theme-border)]/30"
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>Paper</span>
          </button>

          <button
            type="button"
            onClick={() => handleThemeSelect("sepia")}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border font-medium transition-all ${
              theme === "sepia"
                ? "border-[var(--theme-accent)] bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] font-semibold shadow-sm"
                : "border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-text)] hover:bg-[var(--theme-border)]/30"
            }`}
          >
            <Coffee className="w-3.5 h-3.5" />
            <span>Sepia</span>
          </button>

          <button
            type="button"
            onClick={() => handleThemeSelect("nord")}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border font-medium transition-all ${
              theme === "nord"
                ? "border-[var(--theme-accent)] bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] font-semibold shadow-sm"
                : "border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-text)] hover:bg-[var(--theme-border)]/30"
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span>Nord</span>
          </button>
        </div>
      </div>

      <div className="h-[1px] bg-[var(--theme-border)]" />

      {/* Font Family Selection */}
      <div>
        <label className="block text-[11px] font-semibold text-[var(--theme-muted)] mb-2 uppercase tracking-wider">
          Typeface Family
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["serif", "sans", "mono"] as const).map((fam) => (
            <button
              key={fam}
              type="button"
              onClick={() => updateGeneral({ fontFamily: fam })}
              className={`py-1.5 rounded-lg border capitalize font-medium transition-all ${
                general.fontFamily === fam
                  ? "border-[var(--theme-accent)] bg-[var(--theme-accent)]/10 text-[var(--theme-accent)] font-semibold"
                  : "border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-text)] hover:bg-[var(--theme-border)]/30"
              }`}
            >
              {fam}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[1px] bg-[var(--theme-border)]" />

      {/* Font Size Stepper */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-[var(--theme-accent)]" />
          <span className="font-medium text-[var(--theme-text)]">Base Font Size</span>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--theme-bg)] p-1 rounded-lg border border-[var(--theme-border)]">
          <button
            type="button"
            aria-label="Smaller font size"
            onClick={() => handleFontSizeChange(-1)}
            disabled={general.fontSize <= 12}
            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
          >
            -
          </button>
          <span className="w-10 text-center font-mono font-bold text-[var(--theme-text)]">
            {general.fontSize}px
          </span>
          <button
            type="button"
            aria-label="Larger font size"
            onClick={() => handleFontSizeChange(1)}
            disabled={general.fontSize >= 26}
            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      {/* Line Height Ratio Stepper */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlignLeft className="w-4 h-4 text-[var(--theme-accent)]" />
          <span className="font-medium text-[var(--theme-text)]">Line Height</span>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--theme-bg)] p-1 rounded-lg border border-[var(--theme-border)]">
          <button
            type="button"
            aria-label="Tighter line height"
            onClick={() => handleLineHeightChange(-0.05)}
            disabled={general.lineHeightRatio <= 1.3}
            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
          >
            -
          </button>
          <span className="w-10 text-center font-mono font-bold text-[var(--theme-text)]">
            {general.lineHeightRatio.toFixed(2)}
          </span>
          <button
            type="button"
            aria-label="Looser line height"
            onClick={() => handleLineHeightChange(0.05)}
            disabled={general.lineHeightRatio >= 2.4}
            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};
