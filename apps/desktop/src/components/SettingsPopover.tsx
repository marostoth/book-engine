import React, { useState, useRef, useEffect } from "react";
import { Settings, ShieldCheck, Target, RefreshCw, X, Sliders } from "lucide-react";
import { ReaderPreferences } from "../lib/types";

interface SettingsPopoverProps {
  preferences: ReaderPreferences;
  onPreferencesChange: (prefs: ReaderPreferences) => void;
  onResyncDeck?: () => void;
  dueCardsCount?: number;
}

export const SettingsPopover: React.FC<SettingsPopoverProps> = ({
  preferences,
  onPreferencesChange,
  onResyncDeck,
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
            ? "bg-black/10 dark:bg-white/10 text-neutral-900 dark:text-neutral-100"
            : "text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5"
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
          className="absolute right-0 top-full mt-2 w-80 min-w-[320px] max-w-[90vw] z-50 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl p-5 bg-white dark:bg-stone-900 overflow-hidden select-none animate-in fade-in zoom-in-95 duration-100"
          style={{ backgroundColor: "var(--theme-surface)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wide uppercase text-neutral-700 dark:text-neutral-200">
              <Sliders className="w-3.5 h-3.5 text-amber-600 dark:text-nord-accent" />
              <span>Reader Settings</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4 pt-3.5">
            {/* Chapter Gatekeeper Mode Toggle */}
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-nord-accent flex-shrink-0" />
                  <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                    Chapter Gatekeeper
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
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
                    ? "bg-amber-600 dark:bg-nord-accent"
                    : "bg-neutral-300 dark:bg-neutral-700"
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    preferences.gatekeeperMode ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="h-[1px] bg-black/5 dark:bg-white/5" />

            {/* Daily Review Target Stepper */}
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-amber-600 dark:text-nord-accent flex-shrink-0" />
                  <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                    Daily Review Target
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                  Target cards scheduled per study session.
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-black/[0.04] dark:bg-white/[0.06] p-1 rounded-lg border border-black/5 dark:border-white/5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleTargetChange(-5)}
                  className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all"
                  disabled={preferences.dailyTarget <= 5}
                >
                  -
                </button>
                <span className="w-7 text-center text-xs font-bold text-neutral-900 dark:text-neutral-100 font-mono">
                  {preferences.dailyTarget}
                </span>
                <button
                  type="button"
                  onClick={() => handleTargetChange(5)}
                  className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all"
                  disabled={preferences.dailyTarget >= 100}
                >
                  +
                </button>
              </div>
            </div>

            {/* Re-sync Deck / Database Cache Action */}
            {onResyncDeck && (
              <>
                <div className="h-[1px] bg-black/5 dark:bg-white/5" />
                <div className="pt-1 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {dueCardsCount} cards due currently
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onResyncDeck();
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-amber-700 dark:text-nord-accent bg-amber-500/10 dark:bg-nord-accent/15 hover:bg-amber-500/20 dark:hover:bg-nord-accent/25 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Sync Deck</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
