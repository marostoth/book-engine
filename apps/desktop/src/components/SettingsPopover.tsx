import React, { useState, useRef, useEffect } from "react";
import { Settings, ShieldCheck, Target, RefreshCw, X, Sliders, BarChart3 } from "lucide-react";
import { ReaderPreferences } from "../lib/types";

interface SettingsPopoverProps {
  preferences: ReaderPreferences;
  onPreferencesChange: (prefs: ReaderPreferences) => void;
  onResyncDeck?: () => void;
  onOpenAnalytics?: () => void;
  dueCardsCount?: number;
}

export const SettingsPopover: React.FC<SettingsPopoverProps> = ({
  preferences,
  onPreferencesChange,
  onResyncDeck,
  onOpenAnalytics,
  dueCardsCount = 0,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover on click outside or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleToggleGatekeeper = () => {
    const updated = {
      ...preferences,
      gatekeeperMode: !preferences.gatekeeperMode,
    };
    onPreferencesChange(updated);
  };

  const handleTargetChange = (delta: number) => {
    const newTarget = Math.max(5, Math.min(100, preferences.dailyTarget + delta));
    const updated = {
      ...preferences,
      dailyTarget: newTarget,
    };
    onPreferencesChange(updated);
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`h-8 w-8 rounded-lg transition-colors flex items-center justify-center flex-shrink-0 ${
          isOpen
            ? "bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]"
            : "text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent)]/10"
        }`}
        title="Reader Preferences & Gatekeeper Settings"
        aria-label="Settings"
        aria-expanded={isOpen}
      >
        <Settings className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-45" : ""}`} />
      </button>

      {/* Popover Card with 100% Solid Opaque Theme Background */}
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-80 min-w-[320px] max-w-[90vw] z-50 rounded-2xl border border-[var(--theme-border)] shadow-2xl p-5 bg-[var(--theme-surface)] text-[var(--theme-text)] overflow-hidden select-none animate-in fade-in zoom-in-95 duration-100"
          style={{ backgroundColor: "var(--theme-surface)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[var(--theme-border)]">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wide uppercase text-[var(--theme-text)]">
              <Sliders className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
              <span>Reader Settings</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-[var(--theme-muted)] hover:text-[var(--theme-text)] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4 pt-3.5">
            {/* Chapter Gatekeeper Mode Toggle */}
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
                  <span className="text-xs font-semibold text-[var(--theme-text)]">
                    Chapter Gatekeeper
                  </span>
                </div>
                <p className="text-[11px] text-[var(--theme-muted)] mt-1 leading-relaxed">
                  Require solving 3 recall cards before unlocking subsequent chapters.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={preferences.gatekeeperMode}
                onClick={handleToggleGatekeeper}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out flex-shrink-0 cursor-pointer ${
                  preferences.gatekeeperMode
                    ? "bg-[var(--theme-accent)]"
                    : "bg-black/20 dark:bg-white/20"
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    preferences.gatekeeperMode ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="h-[1px] bg-[var(--theme-border)]" />

            {/* Daily Review Target Stepper */}
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
                  <span className="text-xs font-semibold text-[var(--theme-text)]">
                    Daily Review Target
                  </span>
                </div>
                <p className="text-[11px] text-[var(--theme-muted)] mt-1 leading-relaxed">
                  Target cards scheduled per study session.
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-[var(--theme-bg)] p-1 rounded-lg border border-[var(--theme-border)] flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleTargetChange(-5)}
                  className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface)] active:scale-95 transition-all"
                  disabled={preferences.dailyTarget <= 5}
                >
                  -
                </button>
                <span className="w-7 text-center text-xs font-bold text-[var(--theme-text)] font-mono">
                  {preferences.dailyTarget}
                </span>
                <button
                  type="button"
                  onClick={() => handleTargetChange(5)}
                  className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface)] active:scale-95 transition-all"
                  disabled={preferences.dailyTarget >= 100}
                >
                  +
                </button>
              </div>
            </div>

            {/* Re-sync Deck & Analytics Actions */}
            <div className="h-[1px] bg-[var(--theme-border)]" />
            <div className="pt-1 flex items-center justify-between gap-2 text-xs">
              {onOpenAnalytics && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenAnalytics();
                    setIsOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--theme-text)] bg-[var(--theme-bg)] hover:bg-[var(--theme-border)]/30 border border-[var(--theme-border)] transition-colors"
                >
                  <BarChart3 className="w-3 h-3 text-[var(--theme-accent)]" />
                  <span>Analytics</span>
                </button>
              )}

              {onResyncDeck && (
                <button
                  type="button"
                  onClick={() => {
                    onResyncDeck();
                    setIsOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--theme-accent)] bg-[var(--theme-accent)]/10 hover:bg-[var(--theme-accent)]/20 border border-[var(--theme-accent)]/30 transition-colors ml-auto"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Sync Deck ({dueCardsCount})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
