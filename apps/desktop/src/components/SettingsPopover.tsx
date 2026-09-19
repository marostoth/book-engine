import React, { useState, useRef, useEffect } from "react";
import { Settings, X, Sliders, BookOpen, Clock, Brain } from "lucide-react";
import { Theme } from "../lib/types";
import { GeneralTab } from "./settings/GeneralTab";
import { ElementaryTab } from "./settings/ElementaryTab";
import { InspectionalTab } from "./settings/InspectionalTab";
import { PracticeTab } from "./settings/PracticeTab";

/** Every tab inside reads the settings through `useSettings`, so this window passes none of them on (RD-09). */
interface SettingsPopoverProps {
  onResyncDeck?: () => void;
  onOpenAnalytics?: () => void;
  dueCardsCount?: number;
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
  isPacingRunning?: boolean;
  onTogglePacer?: () => void;
}

type TabKey = "general" | "elementary" | "inspectional" | "practice";

export const SettingsPopover: React.FC<SettingsPopoverProps> = ({
  onResyncDeck,
  onOpenAnalytics,
  dueCardsCount = 0,
  theme,
  onThemeChange,
  isPacingRunning,
  onTogglePacer,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const containerRef = useRef<HTMLDivElement>(null);

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

  const tabs = [
    { id: "general" as const, label: "General", icon: Sliders },
    { id: "elementary" as const, label: "Elementary", icon: BookOpen },
    { id: "inspectional" as const, label: "Inspectional", icon: Clock },
    { id: "practice" as const, label: "Practice", icon: Brain },
  ];

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
        title="Reader Preferences & Learning Levels"
        aria-label="Settings"
        aria-expanded={isOpen}
      >
        <Settings className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-45" : ""}`} />
      </button>

      {/* Popover Card */}
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-[380px] min-w-[340px] max-w-[95vw] z-50 rounded-2xl border border-[var(--theme-border)] shadow-2xl p-5 bg-[var(--theme-surface)] text-[var(--theme-text)] overflow-hidden select-none animate-in fade-in zoom-in-95 duration-100"
          style={{ backgroundColor: "var(--theme-surface)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[var(--theme-border)]">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wide uppercase text-[var(--theme-text)]">
              <Sliders className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
              <span>Reader Settings</span>
            </div>
            <button
              aria-label="Close the reader settings"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-[var(--theme-muted)] hover:text-[var(--theme-text)] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-1 border-b border-[var(--theme-border)] pt-2 pb-2 -mx-1 px-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                    isActive
                      ? "bg-[var(--theme-accent)] text-white font-semibold shadow-sm"
                      : "text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-bg)]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Panes */}
          <div className="pt-3.5 max-h-[460px] overflow-y-auto pr-0.5">
            {activeTab === "general" && (
              <GeneralTab
                theme={theme}
                onThemeChange={onThemeChange}
              />
            )}

            {activeTab === "elementary" && (
              <ElementaryTab
                isPacingRunning={isPacingRunning}
                onTogglePacer={onTogglePacer}
              />
            )}

            {activeTab === "inspectional" && (
              <InspectionalTab />
            )}

            {activeTab === "practice" && (
              <PracticeTab
                onResyncDeck={onResyncDeck}
                onOpenAnalytics={onOpenAnalytics}
                dueCardsCount={dueCardsCount}
                onClosePopover={() => setIsOpen(false)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

