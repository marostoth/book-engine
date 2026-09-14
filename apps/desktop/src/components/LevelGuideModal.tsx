import React, { useState, useEffect } from "react";
import { ReadingLevelMode } from "../lib/types";
import { LEVEL_GUIDE_SECTIONS, UNIVERSAL_SHORTCUTS, LevelGuideSection } from "../lib/levelGuideData";
import { HelpCircle, X, CheckCircle2, Sparkles } from "lucide-react";

interface LevelGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeLevel?: ReadingLevelMode;
}

const TAB_LEVELS: ReadingLevelMode[] = ["elementary", "inspectional", "analytical", "syntopical"];

export const LevelGuideModal: React.FC<LevelGuideModalProps> = ({
  isOpen,
  onClose,
  activeLevel = "elementary",
}) => {
  const [selectedTab, setSelectedTab] = useState<ReadingLevelMode>(activeLevel);

  useEffect(() => {
    if (isOpen) setSelectedTab(activeLevel);
  }, [isOpen, activeLevel]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const section: LevelGuideSection = LEVEL_GUIDE_SECTIONS[selectedTab];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-[var(--theme-text)] transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 px-4 border-b border-[var(--theme-border)] flex items-center justify-between shrink-0 bg-black/5 dark:bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--theme-accent)]/15 flex items-center justify-center text-[var(--theme-accent)]">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-tight">Adlerian Reading Field Guide</h2>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] text-neutral-500">
                  Active Mode: {LEVEL_GUIDE_SECTIONS[activeLevel].levelNum}
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Mortimer Adler's Four Levels of Reading & Interactive Cheatsheet
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-neutral-500 hover:text-[var(--theme-text)] transition-colors cursor-pointer"
            title="Close Guide (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Level Switcher Tabs */}
        <div className="grid grid-cols-4 border-b border-[var(--theme-border)] bg-[var(--theme-bg)] text-xs font-medium shrink-0">
          {TAB_LEVELS.map((lvl) => {
            const sec = LEVEL_GUIDE_SECTIONS[lvl];
            const isCurrent = selectedTab === lvl;
            const isAppLevel = activeLevel === lvl;
            return (
              <button
                key={lvl}
                onClick={() => setSelectedTab(lvl)}
                className={`py-2 px-1 text-center transition-all border-b-2 cursor-pointer relative ${
                  isCurrent
                    ? "border-[var(--theme-accent)] text-[var(--theme-accent)] font-semibold bg-[var(--theme-surface)]"
                    : "border-transparent text-neutral-500 hover:text-[var(--theme-text)] hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <span>{sec.levelNum}</span>
                <span className="hidden sm:inline ml-1 text-[11px] opacity-75">({sec.title.split(" ")[0]})</span>
                {isAppLevel && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--theme-accent)] ml-1 align-middle" title="Active Reading Level" />
                )}
              </button>
            );
          })}
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 max-h-[60vh] text-xs">
          {/* Goal & Overview Banner */}
          <div className="p-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] space-y-1">
            <div className="flex items-center gap-1.5 text-[var(--theme-accent)] font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{section.levelNum}: {section.title}</span>
              <span className="text-neutral-400 text-[11px] font-normal">— {section.subtitle}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-300">
              {section.goal}
            </p>
          </div>

          {/* Affordances & Mechanics */}
          <div className="space-y-2">
            <h3 className="font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">
              Active Workflows & Affordances
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {section.affordances.map((aff, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-md border border-[var(--theme-border)] bg-black/5 dark:bg-white/5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--theme-accent)] shrink-0 mt-0.5" />
                  <span className="text-[11px] leading-snug">{aff}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Gutter Badges (Level III specific) */}
          {section.gutterBadges && (
            <div className="space-y-2">
              <h3 className="font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">
                Right-Gutter Anchor Badges (Cited Paragraphs)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {section.gutterBadges.map((gb) => (
                  <div key={gb.badge} className="p-2 rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-4 h-4 rounded flex items-center justify-center font-mono font-bold text-[10px] border ${gb.colorClass}`}>
                        {gb.badge}
                      </span>
                      <span className="font-medium text-[11px] truncate">{gb.label}</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 leading-tight">{gb.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Keybindings Table */}
          <div className="space-y-2">
            <h3 className="font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">
              Level Hotkeys & Shortcuts
            </h3>
            <div className="border border-[var(--theme-border)] rounded-lg overflow-hidden divide-y divide-[var(--theme-border)]">
              {section.keybindings.map((kb, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-[var(--theme-bg)]/50 text-[11px]">
                  <span className="text-neutral-600 dark:text-neutral-300">{kb.desc}</span>
                  <kbd className="font-mono text-xs px-2 py-0.5 rounded border border-[var(--theme-border)] bg-[var(--theme-bg)] shadow-xs">
                    {kb.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Global Shortcuts Footer */}
        <div className="p-3 border-t border-[var(--theme-border)] bg-[var(--theme-bg)] shrink-0 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-semibold text-neutral-500 uppercase">
            <span>Universal App Keybindings</span>
            <span>Press Esc to dismiss</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px]">
            {UNIVERSAL_SHORTCUTS.map((sc, i) => (
              <div key={i} className="flex items-center justify-between p-1 px-1.5 rounded border border-[var(--theme-border)] bg-[var(--theme-surface)]">
                <span className="text-neutral-500 truncate mr-1">{sc.desc.split(" ")[0]} {sc.desc.split(" ")[1]}</span>
                <div className="flex gap-0.5 shrink-0">
                  {sc.keys.map((k) => (
                    <kbd key={k} className="font-mono text-[9px] px-1 rounded border border-[var(--theme-border)] bg-[var(--theme-bg)]">
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
