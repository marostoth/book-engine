import React, { useEffect, useState, useCallback } from "react";
import {
  ChapterMeta,
  Theme,
  ViewMode,
  PracticeCardItem,
  CardSchedule,
  ReaderPreferences,
} from "./lib/types";
import {
  syncPracticeDeck,
  getDueCards,
} from "./lib/api";
import { useBookSession } from "./hooks/useBookSession";
import { Sidebar } from "./components/Sidebar";
import { TopNav } from "./components/TopNav";
import { Reader } from "./components/Reader";
import { NotesPane } from "./components/NotesPane";
import { OmniSearchModal } from "./components/OmniSearchModal";
import { PracticeModal } from "./components/PracticeModal";
import { GatekeeperModal } from "./components/GatekeeperModal";
import { NotesDrawer } from "./components/NotesDrawer";
import { AnalyticsModal } from "./components/AnalyticsModal";

export const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>("paper");
  const [viewMode, setViewMode] = useState<ViewMode>("reading");
  const [isBionic, setIsBionic] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  // Reader Preferences (Gatekeeper mode & Daily Target)
  const [preferences, setPreferences] = useState<ReaderPreferences>(() => {
    try {
      const saved = localStorage.getItem("book_engine_preferences");
      if (saved) return JSON.parse(saved);
    } catch {}
    return { gatekeeperMode: false, dailyTarget: 20 };
  });

  const handlePreferencesChange = (newPrefs: ReaderPreferences) => {
    setPreferences(newPrefs);
    localStorage.setItem("book_engine_preferences", JSON.stringify(newPrefs));
  };

  // Practice Suite & Due Cards State
  const [dueCards, setDueCards] = useState<PracticeCardItem[]>([]);
  const [practiceModalOpen, setPracticeModalOpen] = useState<boolean>(false);
  const [gatekeeperModalOpen, setGatekeeperModalOpen] = useState<boolean>(false);
  const [pendingChapter, setPendingChapter] = useState<ChapterMeta | null>(null);

  // Drawers & Analytics Modals
  const [notesDrawerOpen, setNotesDrawerOpen] = useState<boolean>(false);
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState<boolean>(false);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);

  // Quote passed from SelectionMenu to NotesPane
  const [insertedQuote, setInsertedQuote] = useState<{ quote: string; anchorId?: string } | null>(null);

  const refreshPracticeCards = useCallback(async (bId: string) => {
    if (!bId) return;
    try {
      await syncPracticeDeck(bId);
      const cards = await getDueCards(bId);
      setDueCards(cards);
    } catch (err) {
      console.warn("Failed to refresh practice cards:", err);
    }
  }, []);

  // Book session state hook
  const {
    vaultPath,
    availableBooks,
    activeBookId,
    bookMeta,
    activeChapter,
    setActiveChapter,
    chapterMarkdown,
    progressPercent,
    setProgressPercent,
    highlights,
    targetAnchor,
    setTargetAnchor,
    handleSelectBook,
    handleAddHighlight,
    handleSelectSearchResult,
  } = useBookSession(refreshPracticeCards);

  // Sync theme to body class
  useEffect(() => {
    document.body.className = `theme-${theme} antialiased overflow-hidden select-none`;
  }, [theme]);

  // Global Ctrl + K / Cmd + K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelectChapter = (chapter: ChapterMeta) => {
    if (
      preferences.gatekeeperMode &&
      activeChapter &&
      chapter.id !== activeChapter.id
    ) {
      const chapterCards = dueCards.filter(
        (c) =>
          c.chapter_file === activeChapter.file_path ||
          c.chapter_file.includes(activeChapter.id)
      );
      const candidates = chapterCards.length > 0 ? chapterCards : dueCards;

      if (candidates.length > 0) {
        setPendingChapter(chapter);
        setGatekeeperModalOpen(true);
        return;
      }
    }

    setTargetAnchor(undefined);
    setActiveChapter(chapter);
  };

  const handleGatekeeperComplete = () => {
    if (pendingChapter) {
      setTargetAnchor(undefined);
      setActiveChapter(pendingChapter);
      setPendingChapter(null);
    }
    setGatekeeperModalOpen(false);
  };

  const handleReviewSubmitted = (cardId: string, schedule: CardSchedule) => {
    if (schedule.interval_days > 0) {
      setDueCards((prev) => prev.filter((c) => c.card_id !== cardId));
    }
  };

  const isFocus = viewMode === "focus";
  const isDual = viewMode === "dual";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--theme-bg)] text-[var(--theme-text)]">
      {!isFocus && (
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          bookMeta={bookMeta}
          availableBooks={availableBooks}
          onSelectBook={handleSelectBook}
          activeChapterId={activeChapter?.id || ""}
          onSelectChapter={handleSelectChapter}
          onOpenNotesDrawer={() => setNotesDrawerOpen(true)}
        />
      )}

      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <TopNav
          currentBookId={activeBookId}
          bookTitle={bookMeta?.title}
          bookAuthor={bookMeta?.author}
          availableBooks={availableBooks}
          onSelectBook={handleSelectBook}
          chapterTitle={activeChapter?.title || "Reading"}
          progressPercent={progressPercent}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          theme={theme}
          onThemeChange={setTheme}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isBionic={isBionic}
          onToggleBionic={() => setIsBionic(!isBionic)}
          onOpenSearch={() => setSearchOpen(true)}
          dueCardsCount={dueCards.length}
          onOpenPractice={() => setPracticeModalOpen(true)}
          onOpenNotesDrawer={() => setNotesDrawerOpen(true)}
          onOpenAnalytics={() => setAnalyticsModalOpen(true)}
          preferences={preferences}
          onPreferencesChange={handlePreferencesChange}
          onResyncDeck={() => refreshPracticeCards(activeBookId)}
        />

        <div className="flex-1 flex h-[calc(100vh-3.5rem)] overflow-hidden">
          <Reader
            bookId={bookMeta?.book_id || activeBookId}
            vaultPath={vaultPath}
            markdown={chapterMarkdown}
            isBionic={isBionic}
            highlights={highlights}
            targetAnchor={targetAnchor}
            onProgressChange={setProgressPercent}
            onAddHighlight={handleAddHighlight}
            onAddNoteFromSelection={(quote, anchorId) => {
              setInsertedQuote({ quote, anchorId });
              if (viewMode !== "dual") {
                setViewMode("dual");
              }
            }}
          />

          {isDual && !isFocus && activeChapter && bookMeta && (
            <NotesPane
              bookId={bookMeta.book_id}
              chapterFile={activeChapter.file_path}
              insertedQuote={insertedQuote}
              onClearInsertedQuote={() => setInsertedQuote(null)}
            />
          )}
        </div>
      </div>

      <OmniSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectResult={handleSelectSearchResult}
      />

      <PracticeModal
        isOpen={practiceModalOpen}
        onClose={() => setPracticeModalOpen(false)}
        cards={dueCards}
        onReviewSubmitted={handleReviewSubmitted}
        onJumpToAnchor={handleSelectSearchResult}
        bookTitle={bookMeta?.title || "Book Engine"}
      />

      <GatekeeperModal
        isOpen={gatekeeperModalOpen}
        onClose={() => setGatekeeperModalOpen(false)}
        targetChapterTitle={pendingChapter?.title || "Next Chapter"}
        cards={dueCards}
        onComplete={handleGatekeeperComplete}
        onReviewSubmitted={handleReviewSubmitted}
      />

      <NotesDrawer
        isOpen={notesDrawerOpen}
        onClose={() => setNotesDrawerOpen(false)}
        bookMeta={bookMeta}
        onNavigateToAnchor={handleSelectSearchResult}
      />

      <AnalyticsModal
        isOpen={analyticsModalOpen}
        onClose={() => setAnalyticsModalOpen(false)}
        activeBookId={activeBookId}
        bookMeta={bookMeta}
        preferences={preferences}
      />
    </div>
  );
};
