import React from "react";
import {
  Sidebar as SidebarIcon,
  Columns,
  Maximize2,
  Minimize2,
  Sparkles,
  Search,
  Sun,
  Coffee,
  Moon,
  Brain,
  BarChart3,
  BookMarked,
} from "lucide-react";
import { Theme, ViewMode, BookMetadata, ReaderPreferences, ReadingLevelMode } from "../lib/types";
import { BookSelector } from "./BookSelector";
import type { LibraryRescanControl } from "../lib/libraryRescan";
import { SettingsPopover } from "./SettingsPopover";
import { InspectionalSessionState } from "../hooks/useInspectionalSession";
import { SkimTimerWidget } from "./inspectional/SkimTimerWidget";
import { ElementaryPacingControls } from "./elementary/ElementaryPacingControls";

interface TopNavProps {
  currentBookId?: string;
  bookTitle?: string;
  bookAuthor?: string;
  availableBooks?: BookMetadata[];
  onSelectBook?: (bookId: string) => void;
  /** The "Rescan library" button of the book list (DS-13). */
  libraryRescan?: LibraryRescanControl;
  chapterTitle: string;
  progressPercent: number;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isBionic: boolean;
  onToggleBionic: () => void;
  onOpenSearch: () => void;
  dueCardsCount?: number;
  onOpenPractice?: () => void;
  onOpenNotesDrawer?: () => void;
  onOpenAnalytics?: () => void;
  onOpenGuide?: () => void;
  preferences: ReaderPreferences;
  onPreferencesChange: (prefs: ReaderPreferences) => void;
  onResyncDeck?: () => void;
  activeLevel?: ReadingLevelMode;
  inspectionalSession?: InspectionalSessionState;
  isPacingRunning?: boolean;
  onTogglePacer?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentBookId, bookTitle, bookAuthor, availableBooks, onSelectBook, libraryRescan,
  chapterTitle, progressPercent, sidebarOpen, onToggleSidebar,
  theme, onThemeChange, viewMode, onViewModeChange, isBionic, onToggleBionic,
  onOpenSearch, dueCardsCount = 0, onOpenPractice, onOpenNotesDrawer,
  onOpenAnalytics, onOpenGuide, preferences, onPreferencesChange,
  onResyncDeck, activeLevel = "elementary", inspectionalSession,
  isPacingRunning, onTogglePacer,
}) => {
  const isFocus = viewMode === "focus";

  return (
    <header className="relative z-20 flex-shrink-0 h-14 border-b border-[var(--theme-border)] bg-[var(--theme-surface)]/85 backdrop-blur-md flex items-center justify-between px-4 transition-colors duration-150">
      {/* Reading Progress Bar pinned to very top of header */}
      <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-black/5 dark:bg-white/5">
        <div
          className="h-full bg-[var(--theme-accent)] transition-all duration-150 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Left controls: Sidebar toggle & Title */}
      <div className="flex items-center gap-3 min-w-0 flex-1 mr-3 overflow-hidden">
        {!isFocus && (
          <button
            onClick={onToggleSidebar}
            className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
              sidebarOpen
                ? "text-neutral-700 dark:text-neutral-300 bg-black/5 dark:bg-white/5"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5"
            }`}
            title="Toggle Sidebar (TOC)"
          >
            <SidebarIcon className="w-4 h-4" />
          </button>
        )}

        {/* Compact Book Selector shown when sidebar is collapsed */}
        {!sidebarOpen && availableBooks && onSelectBook && (
          <div className="w-52 max-w-[32vw] flex-shrink-0">
            <BookSelector
              currentBookId={currentBookId || ""}
              currentTitle={bookTitle || "Select Book"}
              currentAuthor={bookAuthor || ""}
              books={availableBooks}
              onSelectBook={onSelectBook}
              libraryRescan={libraryRescan}
              compact
            />
          </div>
        )}

        <div className="flex items-center gap-2 min-w-[200px] flex-1 max-w-md lg:max-w-xl overflow-hidden">
          <h1 className="text-sm font-semibold truncate text-[var(--theme-text)] flex-1 min-w-0" title={chapterTitle}>
            <span className="truncate">{chapterTitle}</span>
          </h1>
          <span className="text-[11px] font-medium text-[var(--theme-muted)] shrink-0 px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 font-mono">
            {progressPercent}%
          </span>
        </div>
      </div>

      {/* Right controls: Skim timer, Elementary pacing, Practice, Analytics, Notes Drawer, Search, Bionic, Split, Themes, Settings */}
      <div className="flex items-center gap-1.5 shrink-0 flex-nowrap">
        {activeLevel === "inspectional" && inspectionalSession && (
          <SkimTimerWidget session={inspectionalSession} />
        )}

        {(activeLevel === "elementary" || isPacingRunning) && (
          <ElementaryPacingControls
            preferences={preferences}
            onPreferencesChange={onPreferencesChange}
            isPacingRunning={isPacingRunning}
            onTogglePacer={onTogglePacer}
          />
        )}

        {/* Practice Suite Button with Due Badge */}
        {onOpenPractice && (
          <button
            onClick={onOpenPractice}
            className="flex items-center gap-1.5 px-2.5 h-8 flex-shrink-0 whitespace-nowrap rounded-lg border border-amber-500/30 dark:border-nord-accent/30 bg-amber-500/10 dark:bg-nord-accent/15 hover:bg-amber-500/20 dark:hover:bg-nord-accent/25 text-amber-900 dark:text-nord-accent text-xs font-medium transition-colors cursor-pointer"
            title="Open Extractive Practice Suite"
          >
            <Brain className="w-3.5 h-3.5 text-amber-600 dark:text-nord-accent flex-shrink-0" />
            <span className="hidden sm:inline">Practice</span>
            {dueCardsCount > 0 && (
              <span className="px-1.5 py-0.2 text-[9px] font-bold rounded-full bg-amber-600 dark:bg-nord-accent text-white flex-shrink-0">
                {dueCardsCount}
              </span>
            )}
          </button>
        )}

        {/* Analytics Dashboard Trigger Button */}
        {onOpenAnalytics && (
          <button
            onClick={onOpenAnalytics}
            className="flex items-center gap-1.5 px-2.5 h-8 flex-shrink-0 whitespace-nowrap rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/10 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300 text-xs font-medium transition-colors cursor-pointer"
            title="Study & Reading Analytics (FSRS Heatmap, Retention, Reading Time)"
          >
            <BarChart3 className="w-3.5 h-3.5 text-amber-600 dark:text-nord-accent flex-shrink-0" />
            <span className="hidden md:inline">Analytics</span>
          </button>
        )}

        {/* Unified Notes & Highlights Drawer Trigger Button */}
        {onOpenNotesDrawer && (
          <button
            onClick={onOpenNotesDrawer}
            className="flex items-center gap-1.5 px-2.5 h-8 flex-shrink-0 whitespace-nowrap rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/10 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300 text-xs font-medium transition-colors cursor-pointer"
            title="Open Unified Notes & Highlights Drawer"
          >
            <BookMarked className="w-3.5 h-3.5 text-amber-600 dark:text-nord-accent flex-shrink-0" />
            <span className="hidden sm:inline">Notes</span>
          </button>
        )}

        {/* Omni-Search Trigger Button */}
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-1.5 flex-nowrap whitespace-nowrap flex-shrink-0 h-8 px-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/10 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300 text-xs transition-colors cursor-pointer"
          title="Omni-Search (Ctrl + K / Cmd + K)"
        >
          <Search className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
          <span className="hidden md:inline">Search</span>
          <kbd className="font-mono text-[9px] px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/5 text-neutral-400 flex-shrink-0">
            Ctrl K
          </kbd>
        </button>
        <div className="w-[1px] h-4 bg-black/10 dark:bg-white/10 mx-0.5 flex-shrink-0" />

        {/* Bionic Reading Toggle */}
        <button
          onClick={onToggleBionic}
          className={`flex items-center gap-1 px-2.5 h-8 flex-shrink-0 whitespace-nowrap rounded-lg text-xs font-medium transition-all cursor-pointer ${
            isBionic
              ? "bg-amber-600 text-white shadow-sm"
              : "text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5"
          }`}
          title="Toggle Bionic Fixation Reading"
        >
          <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">Bionic</span>
        </button>

        <div className="w-[1px] h-4 bg-black/10 dark:bg-white/10 mx-1 flex-shrink-0" />

        {/* Dual-Pane View Mode Toggle (Split) */}
        {!isFocus && (
          <button
            onClick={() => onViewModeChange(viewMode === "dual" ? "reading" : "dual")}
            className={`flex items-center gap-1 px-2.5 h-8 flex-shrink-0 whitespace-nowrap rounded-lg text-xs font-medium transition-all cursor-pointer ${
              viewMode === "dual"
                ? "bg-neutral-800 dark:bg-nord-accent text-white dark:text-nord-bg shadow-sm"
                : "text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5"
            }`}
            title="Toggle Dual-Pane Side-by-Side Editor"
          >
            <Columns className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">Split</span>
          </button>
        )}

        {/* Focus Mode Toggle */}
        <button
          onClick={() => onViewModeChange(isFocus ? "reading" : "focus")}
          className={`h-8 w-8 flex items-center justify-center flex-shrink-0 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer ${
            isFocus ? "text-amber-600 dark:text-nord-accent font-semibold" : ""
          }`}
          title={isFocus ? "Exit Focus Mode" : "Enter Focus Mode"}
        >
          {isFocus ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        <div className="w-[1px] h-4 bg-black/10 dark:bg-white/10 mx-1 flex-shrink-0" />

        {/* Theme Selectors */}
        <div className="flex items-center gap-0.5 p-1 rounded-lg bg-black/5 dark:bg-white/5 flex-shrink-0 h-8">
          {(["paper", "sepia", "nord"] as const).map((t) => {
            const Icon = t === "paper" ? Sun : t === "sepia" ? Coffee : Moon;
            const isAct = theme === t;
            const activeClass = t === "paper" ? "bg-white text-neutral-900 shadow-sm font-semibold" : t === "sepia" ? "bg-[#EAE0C8] text-[#3D3226] shadow-sm font-semibold" : "bg-[#3B4252] text-[#88C0D0] shadow-sm font-semibold";
            return (
              <button
                key={t}
                onClick={() => onThemeChange(t)}
                className={`p-1 rounded-md text-xs transition-all ${isAct ? activeClass : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"}`}
                title={`${t.charAt(0).toUpperCase() + t.slice(1)} Theme`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>

        <div className="w-[1px] h-4 bg-black/10 dark:bg-white/10 mx-1 flex-shrink-0" />

        {/* Field Guide Trigger (?) */}
        {onOpenGuide && (
          <button
            onClick={onOpenGuide}
            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded border border-[var(--theme-border)] text-xs font-mono font-medium hover:text-[var(--theme-accent)] hover:border-[var(--theme-accent)]/60 bg-[var(--theme-surface)] transition-colors cursor-pointer"
            title="Field Guide & Hotkeys (?)"
          >
            ?
          </button>
        )}

        {/* Settings Popover */}
        <SettingsPopover
          preferences={preferences}
          onPreferencesChange={onPreferencesChange}
          onResyncDeck={onResyncDeck}
          dueCardsCount={dueCardsCount}
          theme={theme}
          onThemeChange={onThemeChange}
          isBionic={isBionic}
          onToggleBionic={onToggleBionic}
          isPacingRunning={isPacingRunning}
          onTogglePacer={onTogglePacer}
          onOpenAnalytics={onOpenAnalytics}
        />
      </div>
    </header>
  );
};
