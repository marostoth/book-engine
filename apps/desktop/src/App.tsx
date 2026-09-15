import React, { useEffect, useState, useCallback } from "react";
import { Theme, ViewMode, ReaderPreferences, ReadingLevelMode } from "./lib/types";
import { loadPreferences, savePreferences } from "./lib/preferences";
import { useBookSession } from "./hooks/useBookSession";
import { usePracticeDeck } from "./hooks/usePracticeDeck";
import { useChapterGate } from "./hooks/useChapterGate";
import { useInspectionalSession } from "./hooks/useInspectionalSession";
import { LevelRail } from "./components/navigation/LevelRail";
import { Sidebar } from "./components/Sidebar";
import { TopNav } from "./components/TopNav";
import { Reader } from "./components/Reader";
import { NotesPane } from "./components/NotesPane";
import { BlueprintView } from "./components/inspectional/BlueprintView";
import { DipStream } from "./components/inspectional/DipStream";
import { AppModals } from "./components/AppModals";
import { useAnalyticalSession } from "./hooks/useAnalyticalSession";
import { useSyntopiconSession } from "./hooks/useSyntopiconSession";
import { LevelCompanionPane } from "./components/LevelCompanionPane";

export const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>("paper");
  const [viewMode, setViewMode] = useState<ViewMode>("reading");
  const [isBionic, setIsBionic] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [activeLevel, setActiveLevel] = useState<ReadingLevelMode>("elementary");
  const [isPacingRunning, setIsPacingRunning] = useState<boolean>(false);

  // Reader Preferences v2 (with automatic migration from v1)
  const [preferences, setPreferences] = useState<ReaderPreferences>(loadPreferences);

  const handlePreferencesChange = (newPrefs: ReaderPreferences) => {
    setPreferences(newPrefs);
    savePreferences(newPrefs);
  };

  const handleTogglePacer = useCallback(() => {
    setIsPacingRunning((prev) => {
      const next = !prev;
      if (next && activeLevel !== "elementary") {
        setActiveLevel("elementary");
      }
      return next;
    });
  }, [activeLevel]);

  // Drawers & Analytics Modals
  const [notesDrawerOpen, setNotesDrawerOpen] = useState<boolean>(false);
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState<boolean>(false);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [guideOpen, setGuideOpen] = useState<boolean>(false);

  // Quote passed from SelectionMenu to NotesPane
  const [insertedQuote, setInsertedQuote] = useState<{ quote: string; anchorId?: string } | null>(null);

  // Chapter Gatekeeper: every chapter change inside the open book asks it first
  const { chapterGate, requestChapterMove, completeChapterGate, closeChapterGate } = useChapterGate(
    preferences,
    activeLevel
  );

  // Book session state hook
  const {
    vaultPath,
    availableBooks,
    activeBookId,
    bookMeta,
    activeChapter,
    chapterMarkdown,
    progressPercent,
    setProgressPercent,
    highlights,
    targetAnchor,
    handleSelectBook,
    handleAddHighlight,
    openChapter,
    handleNavigateAnchor,
    navigateToCrossBookCitation,
  } = useBookSession({ requestChapterMove });

  // Practice deck state hook
  const {
    dueCards,
    dueCardsCount,
    practiceModalOpen,
    setPracticeModalOpen,
    refreshPracticeCards,
    handleReviewSubmitted,
  } = usePracticeDeck(activeBookId, preferences);

  // Inspectional, Analytical, & Syntopical session states
  const inspectionalSession = useInspectionalSession(activeBookId, preferences);
  const analyticalSession = useAnalyticalSession({
    bookId: activeBookId,
    currentChapterFile: activeChapter?.file_path,
  });
  const syntopiconSession = useSyntopiconSession();

  // Sync theme and dark mode class to root / body
  useEffect(() => {
    const isDark = theme === "nord";
    document.documentElement.classList.toggle("dark", isDark);
    document.body.className = `theme-${theme} ${isDark ? "dark" : ""} antialiased overflow-hidden select-none`;
  }, [theme]);

  const handleOpenNotesDrawer = useCallback(() => {
    if (activeLevel !== "inspectional" || !preferences.inspectional?.autoHideDrawerOnSkim) {
      setNotesDrawerOpen(true);
    }
  }, [activeLevel, preferences.inspectional?.autoHideDrawerOnSkim]);

  // Global keyboard shortcuts (Ctrl+K for search, Alt+P for Pacer, ? / F1 for Field Guide)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handleTogglePacer();
        return;
      }
      if (e.key === "?" || e.key === "F1") {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        setGuideOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleTogglePacer]);


  const isFocus = viewMode === "focus";
  const isDual = viewMode === "dual";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--theme-bg)] text-[var(--theme-text)]">
      {/* 36px Fixed Outer Level Rail */}
      <LevelRail activeLevel={activeLevel} onSelectLevel={setActiveLevel} />

      {!isFocus && (
        <Sidebar
          isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)}
          bookMeta={bookMeta} availableBooks={availableBooks} onSelectBook={handleSelectBook}
          activeChapterId={activeChapter?.id || ""} onSelectChapter={openChapter}
          onOpenNotesDrawer={handleOpenNotesDrawer}
          activeLevel={activeLevel} activeSubView={inspectionalSession.activeSubView}
          onSelectSubView={inspectionalSession.setActiveSubView}
        />
      )}

      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <TopNav
          currentBookId={activeBookId} bookTitle={bookMeta?.title} bookAuthor={bookMeta?.author}
          availableBooks={availableBooks} onSelectBook={handleSelectBook}
          chapterTitle={activeChapter?.title || "Reading"} progressPercent={progressPercent}
          sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          theme={theme} onThemeChange={setTheme}
          viewMode={viewMode} onViewModeChange={setViewMode}
          isBionic={isBionic} onToggleBionic={() => setIsBionic(!isBionic)}
          onOpenSearch={() => setSearchOpen(true)} dueCardsCount={dueCardsCount}
          onOpenPractice={() => setPracticeModalOpen(true)}
          onOpenNotesDrawer={handleOpenNotesDrawer}
          onOpenAnalytics={() => setAnalyticsModalOpen(true)}
          onOpenGuide={() => setGuideOpen(true)}
          preferences={preferences} onPreferencesChange={handlePreferencesChange}
          onResyncDeck={() => refreshPracticeCards(activeBookId)}
          activeLevel={activeLevel} inspectionalSession={inspectionalSession}
          isPacingRunning={isPacingRunning} onTogglePacer={handleTogglePacer}
        />

        <div className="flex-1 flex h-[calc(100vh-3.5rem)] overflow-hidden">
          {activeLevel === "inspectional" ? (
            inspectionalSession.activeSubView === "blueprint" ? (
              <BlueprintView
                bookMeta={bookMeta}
                onSelectChapter={openChapter}
                onSwitchToDips={() => inspectionalSession.setActiveSubView("dips")}
                onOpenExitModal={inspectionalSession.openExitModal}
              />
            ) : (
              <DipStream
                bookMeta={bookMeta}
                singleKeyPagingEnabled={preferences.inspectional?.singleKeyPagingEnabled}
                onReadFullChapter={(chapter, anchor) => openChapter(chapter, anchor, () => setActiveLevel("elementary"))}
              />
            )
          ) : (
            <>
              <Reader
                bookId={bookMeta?.book_id || activeBookId}
                vaultPath={vaultPath} markdown={chapterMarkdown} isBionic={isBionic}
                highlights={highlights} targetAnchor={targetAnchor}
                onProgressChange={setProgressPercent} onAddHighlight={handleAddHighlight}
                onAddNoteFromSelection={(quote, anchorId) => {
                  setInsertedQuote({ quote, anchorId });
                  if (viewMode !== "dual") setViewMode("dual");
                }}
                onAddTerm={(quote, anchor) => analyticalSession.openTermModal({ chapterFile: activeChapter?.file_path || "ch-01.md", anchor: anchor || "^p-001", quote })}
                onAddArgument={(quote, anchor) => analyticalSession.openArgumentModal({ chapterFile: activeChapter?.file_path || "ch-01.md", anchor: anchor || "^p-001", quote })}
                onAddCritique={(quote, anchor) => analyticalSession.openCritiqueModal(undefined, { chapterFile: activeChapter?.file_path || "ch-01.md", anchor: anchor || "^p-001", quote })}
                onAddInquiry={(quote, anchor) => analyticalSession.openInquiryModal({ quote, anchor: anchor || "^p-001", chapterFile: activeChapter?.file_path || "ch-01.md" })}
                onAddSyntopic={(quote, anchor) => syntopiconSession.stageCitation({ bookId: activeBookId, chapterFile: activeChapter?.file_path || "ch-01.md", anchor: anchor || "^p-001", quote })}
                analyticalStore={analyticalSession.analyticalStore}
                currentChapterFile={activeChapter?.file_path}
                preferences={preferences} onPreferencesChange={handlePreferencesChange}
                activeLevel={activeLevel}
                onOpenInSplit={() => { if (viewMode !== "dual") setViewMode("dual"); }}
                isPacingRunning={isPacingRunning} onTogglePacer={handleTogglePacer}
              />

              {isDual && !isFocus && activeChapter && bookMeta && (
                <NotesPane
                  bookId={bookMeta.book_id}
                  chapterFile={activeChapter.file_path}
                  insertedQuote={insertedQuote}
                  onClearInsertedQuote={() => setInsertedQuote(null)}
                />
              )}

              <LevelCompanionPane
                activeLevel={activeLevel} isFocus={isFocus}
                analyticalSession={analyticalSession} syntopiconSession={syntopiconSession}
                onNavigateCitation={handleNavigateAnchor}
                onNavigateCrossBookCitation={navigateToCrossBookCitation}
                currentBookId={activeBookId}
              />
            </>
          )}
        </div>
      </div>

      <AppModals
        searchOpen={searchOpen} onCloseSearch={() => setSearchOpen(false)}
        practiceModalOpen={practiceModalOpen} onClosePractice={() => setPracticeModalOpen(false)}
        chapterGate={chapterGate} onCloseGatekeeper={closeChapterGate}
        notesDrawerOpen={notesDrawerOpen} onCloseNotesDrawer={() => setNotesDrawerOpen(false)}
        analyticsModalOpen={analyticsModalOpen} onCloseAnalytics={() => setAnalyticsModalOpen(false)}
        guideOpen={guideOpen} onCloseGuide={() => setGuideOpen(false)} activeLevel={activeLevel}
        dueCards={dueCards}
        onGatekeeperComplete={completeChapterGate} onReviewSubmitted={handleReviewSubmitted}
        onNavigateAnchor={handleNavigateAnchor} onNavigateLocation={navigateToCrossBookCitation}
        activeBookId={activeBookId} bookMeta={bookMeta} availableBooks={availableBooks}
        preferences={preferences} inspectionalSession={inspectionalSession}
        analyticalSession={analyticalSession} syntopiconSession={syntopiconSession} currentChapterFile={activeChapter?.file_path}
      />
    </div>
  );
};
