import React from "react";
import { ReadingLevelMode } from "../../lib/types";
import { Compass, BookOpen, Layers, GitFork } from "lucide-react";

interface LevelRailProps {
  activeLevel: ReadingLevelMode;
  onSelectLevel: (level: ReadingLevelMode) => void;
}

interface LevelItem {
  id: ReadingLevelMode;
  numeral: string;
  name: string;
  subtitle: string;
  enabled: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

const LEVELS: LevelItem[] = [
  {
    id: "elementary",
    numeral: "I",
    name: "Elementary Reading",
    subtitle: "Active reader, chapter text, anchors",
    enabled: true,
    icon: BookOpen,
  },
  {
    id: "inspectional",
    numeral: "II",
    name: "Inspectional Reading",
    subtitle: "Blueprint, dip stream, timed skimming",
    enabled: true,
    icon: Compass,
  },
  {
    id: "analytical",
    numeral: "III",
    name: "Analytical Reading",
    subtitle: "Interpretive workbench, terms & arguments",
    enabled: true,
    icon: Layers,
  },
  {
    id: "syntopical",
    numeral: "IV",
    name: "Syntopical Reading",
    subtitle: "Comparative syntopicon & cross-book issue matrix",
    enabled: true,
    icon: GitFork,
  },
];

export const LevelRail: React.FC<LevelRailProps> = ({
  activeLevel,
  onSelectLevel,
}) => {
  return (
    <aside
      className="w-9 min-w-[36px] max-w-[36px] h-full flex flex-col items-center justify-between py-3 border-r border-[var(--theme-border)] bg-[var(--theme-surface)]/95 backdrop-blur-md z-40 select-none transition-colors duration-150"
      aria-label="Reading Levels Navigation"
    >
      {/* Top section: Adler level badges */}
      <div className="flex flex-col items-center gap-2.5 w-full">
        {/* Subtle decorative indicator */}
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold font-mono tracking-tighter text-[var(--theme-muted)]/70 cursor-default"
          title="Mortimer Adler's 4 Reading Levels"
        >
          <span>L</span>
          <span className="text-[9px] opacity-60">v</span>
        </div>

        <div className="w-4 h-[1px] bg-[var(--theme-border)]/60 my-0.5" />

        {/* 4 Level Badges */}
        {LEVELS.map((lvl) => {
          const isActive = activeLevel === lvl.id;
          const isEnabled = lvl.enabled;

          return (
            <div key={lvl.id} className="relative group flex items-center justify-center">
              <button
                type="button"
                disabled={!isEnabled}
                onClick={() => isEnabled && onSelectLevel(lvl.id)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-serif font-bold transition-all duration-150 ${
                  isActive
                    ? "bg-[var(--theme-accent)] text-white shadow-sm ring-2 ring-[var(--theme-accent)]/30 scale-105"
                    : isEnabled
                    ? "text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                    : "text-[var(--theme-muted)]/40 cursor-not-allowed opacity-40 hover:opacity-50"
                }`}
                aria-label={`${lvl.numeral}: ${lvl.name}`}
              >
                {lvl.numeral}
              </button>

              {/* Floating Tooltip positioned immediately to the right */}
              <div className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 ml-2 hidden group-hover:flex flex-col px-2.5 py-1.5 rounded-lg bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 text-[11px] shadow-lg border border-neutral-700/40 dark:border-neutral-200/40 whitespace-nowrap z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center gap-1.5 font-semibold">
                  <span>Level {lvl.numeral}:</span>
                  <span>{lvl.name}</span>
                  {!isEnabled && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 dark:text-amber-800 font-mono font-normal">
                      Planned
                    </span>
                  )}
                </div>
                <div className="text-[10px] opacity-75 font-sans mt-0.5">
                  {lvl.subtitle}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom active mode indicator */}
      <div className="flex flex-col items-center">
        <div
          className="w-1.5 h-1.5 rounded-full bg-[var(--theme-accent)] transition-all"
          title={`Active: Level ${LEVELS.find((l) => l.id === activeLevel)?.numeral || "I"}`}
        />
      </div>
    </aside>
  );
};
