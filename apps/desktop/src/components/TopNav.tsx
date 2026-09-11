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
import { Theme, ViewMode, BookMetadata, ReaderPreferences } from "../lib/types";
import { BookSelector } from "./BookSelector";
import { SettingsPopover } from "./SettingsPopover";

interface TopNavProps {
  currentBookId?: string;
  bookTitle?: string;
  bookAuthor?: string;
  availableBooks?: BookMetadata[];
  onSelectBook?: (bookId: string) => void;
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
  preferences: ReaderPreferences;
  onPreferencesChange: (prefs: ReaderPreferences) => void;
  onResyncDeck?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentBookId,
  bookTitle,
  bookAuthor,
  availableBooks,
  onSelectBook,
  chapterTitle,
  progressPercent,
  sidebarOpen,
  onToggleSidebar,
  theme,
  onThemeChange,
  viewMode,
  onViewModeChange,
  isBionic,
  onToggleBionic,
  onOpenSearch,
  dueCardsCount = 0,
  onOpenPractice,
  onOpenNotesDrawer,
  onOpenAnalytics,
  preferences,
  onPreferencesChange,
  onResyncDeck,
}) => {
  const isFocus = viewMode === "focus";

  return (
    <header className="relative z-20 flex-shrink-0 h-14 border-b border-black/10 dark:border-white/10 bg-white/70 dark:bg-nord-surface/70 backdrop-blur-md flex items-center justify-between px-4">
      {/* Reading Progress Bar pinned to very top of header */}
      <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-black/5 dark:bg-white/5">
        <div
          className="h-full bg-amber-600 dark:bg-nord-accent transition-all duration-150 ease-out"
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
              compact
            />
          </div>
        )}

        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <h1 className="text-sm font-semibold truncate text-neutral-800 dark:text-neutral-100">
            {chapterTitle}
          </h1>
          <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 flex-shrink-0">
            {progressPercent}%
          </span>
        </div>
      </div>

      {/* Right controls: Practice, Analytics, Notes Drawer, Search, Bionic, Split, Themes, Settings */}
      <div className="flex items-center gap-1.5 flex-shrink-0 flex-nowrap">
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
            title="Study & Reading Analytics (FSRS Heatmap, Retention, Velocity)"
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
          <button
            onClick={() => onThemeChange("paper")}
            className={`p-1 rounded-md text-xs transition-all ${
              theme === "paper"
                ? "bg-white text-neutral-900 shadow-sm font-semibold"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
            title="Warm Paper Theme (#FBFBFA)"
          >
            <Sun className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => onThemeChange("sepia")}
            className={`p-1 rounded-md text-xs transition-all ${
              theme === "sepia"
                ? "bg-[#EAE0C8] text-[#3D3226] shadow-sm font-semibold"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
            title="Sepia Parchment Theme (#F4ECD8)"
          >
            <Coffee className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => onThemeChange("nord")}
            className={`p-1 rounded-md text-xs transition-all ${
              theme === "nord"
                ? "bg-[#3B4252] text-[#88C0D0] shadow-sm font-semibold"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
            title="Nord Dark Theme (#2E3440)"
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="w-[1px] h-4 bg-black/10 dark:bg-white/10 mx-1 flex-shrink-0" />

        {/* Settings Popover */}
        <SettingsPopover
          preferences={preferences}
          onPreferencesChange={onPreferencesChange}
          onResyncDeck={onResyncDeck}
          dueCardsCount={dueCardsCount}
        />
      </div>
    </header>
  );
};

