import React, { useEffect, useState, useCallback } from "react";
import { Theme, ViewMode, ReaderPreferences, ReadingLevelMode } from "./lib/types";
import { createPreferencesSaver, themeOf, withTheme, type LoadedPreferences } from "./lib/preferences";
import { persistPreferences } from "./lib/api";
import { reportBackendError } from "./lib/backendErrors";
import { appShortcut, shortcutKey } from "./lib/readerShortcuts";
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
import { BackendErrorBar } from "./components/BackendErrorBar";
import { useAnalyticalSession } from "./hooks/useAnalyticalSession";
import { useSyntopiconSession } from "./hooks/useSyntopiconSession";
import { LevelCompanionPane } from "./components/LevelCompanionPane";

/** A changed setting is saved this long after the last change, so holding a key down makes one save. */
const PREFERENCES_SAVE_DELAY_MS = 400;

interface AppProps {
  /** The reader settings, read from the vault before the app starts (`components/PreferencesGate.tsx`). */
  startingPreferences: LoadedPreferences;
}

export const App: React.FC<AppProps> = ({ startingPreferences }) => {
  const [viewMode, setViewMode] = useState<ViewMode>("reading");
  const [isBionic, setIsBionic] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [activeLevel, setActiveLevel] = useState<ReadingLevelMode>("elementary");
  const [isPacingRunning, setIsPacingRunning] = useState<boolean>(false);

  // Reader Preferences v2, kept in the vault (`vault/preferences.json`), not in browser storage (DS-11)
  const [preferences, setPreferences] = useState<ReaderPreferences>(startingPreferences.preferences);
  const [preferencesSaver] = useState(() =>
    createPreferencesSaver(PREFERENCES_SAVE_DELAY_MS, persistPreferences, reportBackendError, startingPreferences.canSave)
  );
  useEffect(() => () => preferencesSaver.flush(), [preferencesSaver]);

  const handlePreferencesChange = (newPrefs: ReaderPreferences) => {
    setPreferences(newPrefs);
    preferencesSaver.change(newPrefs);
  };

  // The reading theme is one of the saved settings, so the app starts with the theme the reader chose (DS-11).
  const theme = themeOf(preferences);
  const handleThemeChange = (next: Theme) => handlePreferencesChange(withTheme(preferences, next));

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
    libraryRescan,
    activeBookId,
    bookMeta,
    activeChapter,
    chapterMarkdown,
    markdownSource,
    handlePlaceSettled,
    progressPercent,
    handleProgressChange,
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

  // Global keyboard shortcuts (Ctrl+K for search, Alt+P for Pacer, ? / F1 for Field Guide).
  // This is the only Alt+P handler: lib/readerShortcuts.ts gives every shortcut one listener.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const shortcut = appShortcut(shortcutKey(e));
      if (!shortcut) return;
      e.preventDefault();
      if (shortcut === "search") {
        setSearchOpen((prev) => !prev);
      } else if (shortcut === "togglePacer") {
        handleTogglePacer();
      } else {
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
          libraryRescan={libraryRescan}
          activeChapterId={activeChapter?.id || ""} onSelectChapter={openChapter}
          onOpenNotesDrawer={handleOpenNotesDrawer}
          activeLevel={activeLevel} activeSubView={inspectionalSession.activeSubView}
          onSelectSubView={inspectionalSession.setActiveSubView}
        />
      )}

      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <TopNav
          currentBookId={activeBookId} bookTitle={bookMeta?.title} bookAuthor={bookMeta?.author}
          availableBooks={availableBooks} onSelectBook={handleSelectBook} libraryRescan={libraryRescan}
          chapterTitle={activeChapter?.title || "Reading"} progressPercent={progressPercent}
          sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          theme={theme} onThemeChange={handleThemeChange}
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
                exitAssessment={inspectionalSession.exitAssessment}
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
                markdownSource={markdownSource} onPlaceSettled={handlePlaceSettled}
                highlights={highlights} targetAnchor={targetAnchor}
                onProgressChange={handleProgressChange} onAddHighlight={handleAddHighlight}
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
                  key={`${bookMeta.book_id}/${activeChapter.file_path}`}
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

      {/* Every failed backend load or save shows here */}
      <BackendErrorBar />
    </div>
  );
};
