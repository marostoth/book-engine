import React, { useEffect, useState, useCallback } from "react";
import { Theme, ViewMode, ReaderPreferences, ReadingLevelMode } from "./lib/types";
import type { AnchoredCitation } from "./lib/types/analytical";
import type { ChapterRef } from "./lib/readingPlace";
import { createPreferencesSaver, themeOf, withTheme, type LoadedPreferences } from "./lib/preferences";
import { persistPreferences } from "./lib/api";
import { reportBackendError } from "./lib/backendErrors";
import { appShortcut, shortcutKey } from "./lib/readerShortcuts";
import { useBookSession } from "./hooks/useBookSession";
import { SettingsContext, useSettingsValue } from "./hooks/useSettings";
import { LibraryContext, useLibraryValue } from "./hooks/useLibrary";
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
import { saversBeforeClose, saveWhenTheWindowCloses } from "./lib/savingBeforeClose";
import { letTheWindowClose, listenForWindowClose } from "./lib/api/windowApi";
import { useSaveBeforeClose } from "./hooks/useSaveBeforeClose";

/** A changed setting is saved this long after the last change, so holding a key down makes one save. */
const PREFERENCES_SAVE_DELAY_MS = 400;

interface AppProps {
  /** The reader settings, read from the vault before the app starts (`components/PreferencesGate.tsx`). */
  startingPreferences: LoadedPreferences;
}

export const App: React.FC<AppProps> = ({ startingPreferences }) => {
  const [viewMode, setViewMode] = useState<ViewMode>("reading");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [activeLevel, setActiveLevel] = useState<ReadingLevelMode>("elementary");
  const [isPacingRunning, setIsPacingRunning] = useState<boolean>(false);

  // Reader Preferences v2, kept in the vault (`vault/preferences.json`), not in browser storage (DS-11)
  const [preferences, setPreferences] = useState<ReaderPreferences>(startingPreferences.preferences);
  const [preferencesSaver] = useState(() =>
    createPreferencesSaver(PREFERENCES_SAVE_DELAY_MS, persistPreferences, reportBackendError, startingPreferences.canSave)
  );
  useEffect(() => () => void preferencesSaver.flush(), [preferencesSaver]);
  useSaveBeforeClose(() => preferencesSaver.flush());

  // The reader closed the window. Everything that is waiting is saved first, and the window is told last (DS-17).
  useEffect(() => {
    const listening = saveWhenTheWindowCloses(
      listenForWindowClose,
      saversBeforeClose,
      letTheWindowClose,
      reportBackendError
    );
    return () => {
      void listening.then((stop) => stop());
    };
  }, []);

  // Made once, because the reader is only drawn again for new props of its own (RD-06).
  const handlePreferencesChange = useCallback(
    (newPrefs: ReaderPreferences) => {
      setPreferences(newPrefs);
      preferencesSaver.change(newPrefs);
    },
    [preferencesSaver]
  );

  // The reading theme is one of the saved settings, so the app starts with the theme the reader chose (DS-11).
  const theme = themeOf(preferences);
  const handleThemeChange = (next: Theme) => handlePreferencesChange(withTheme(preferences, next));

  // Bionic Reading is one saved setting now, read through `useBionic` by the button in the top navigation, the switch
  // in Settings and the reader itself (RD-09). There used to be a second flag here, held only while the window was
  // open: the button wrote that one, the switch wrote the saved one, and nothing ever read the saved one back.

  /** The settings, for every part of the app. One value while the settings do not change, so `Reader` stays put (RD-06). */
  const settingsValue = useSettingsValue(preferences, handlePreferencesChange);

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

  // The paragraph the reader is on. A citation that opens from a button names it, so none names a made-up one (RD-04).
  const [readingAnchor, setReadingAnchor] = useState<string | undefined>();

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

  /** The books of the vault and the one that is open, for the navigation, the sidebar and the windows (RD-09). */
  const libraryValue = useLibraryValue({
    activeBookId,
    bookMeta,
    availableBooks,
    selectBook: handleSelectBook,
    rescan: libraryRescan,
  });

  /** Keeps where the reader stopped, and remembers the paragraph for a citation that opens from a button (RD-04). */
  const handleSettled = useCallback(
    (place: ChapterRef, anchor: string | undefined) => {
      setReadingAnchor(anchor);
      handlePlaceSettled(place, anchor);
    },
    [handlePlaceSettled]
  );

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
    currentAnchor: readingAnchor,
  });
  const syntopiconSession = useSyntopiconSession();

  /**
   * Where a passage of the open chapter is, for a citation that the reader stages. The reader gives the anchor of the
   * block that holds the passage and stages nothing without one, so no citation gets an anchor of the app's own (RD-04).
   */
  const citation = useCallback(
    (quote: string, anchor: string): AnchoredCitation | null =>
      activeChapter ? { chapterFile: activeChapter.file_path, anchor, quote } : null,
    [activeChapter]
  );

  // Every handler of the reader is made once, so a render of the app leaves the chapter on screen alone (RD-06).
  // The modal openers come one by one, because each session hook gives back a new object on every render.
  const { openTermModal, openArgumentModal, openCritiqueModal, openInquiryModal } = analyticalSession;
  const { stageCitation } = syntopiconSession;

  const handleNoteFromSelection = useCallback((quote: string, anchorId?: string) => {
    setInsertedQuote({ quote, anchorId });
    setViewMode((mode) => (mode === "dual" ? mode : "dual"));
  }, []);
  const handleOpenInSplit = useCallback(() => setViewMode((mode) => (mode === "dual" ? mode : "dual")), []);
  const handleAddTerm = useCallback(
    (quote: string, anchor: string) => {
      const cite = citation(quote, anchor);
      if (cite) openTermModal(cite);
    },
    [citation, openTermModal]
  );
  const handleAddArgument = useCallback(
    (quote: string, anchor: string) => {
      const cite = citation(quote, anchor);
      if (cite) openArgumentModal(cite);
    },
    [citation, openArgumentModal]
  );
  const handleAddCritique = useCallback(
    (quote: string, anchor: string) => {
      const cite = citation(quote, anchor);
      if (cite) openCritiqueModal(undefined, cite);
    },
    [citation, openCritiqueModal]
  );
  const handleAddInquiry = useCallback(
    (quote: string, anchor: string) => {
      const cite = citation(quote, anchor);
      if (cite) openInquiryModal(cite);
    },
    [citation, openInquiryModal]
  );
  const handleAddSyntopic = useCallback(
    (quote: string, anchor: string) => {
      const cite = citation(quote, anchor);
      if (cite) stageCitation({ bookId: activeBookId, ...cite });
    },
    [citation, stageCitation, activeBookId]
  );

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

  // The settings and the library are held once here, and read where they are needed. They used to be passed down as
  // props through every component on the way, whether it read them or not (RD-09).
  return (
    <SettingsContext.Provider value={settingsValue}>
    <LibraryContext.Provider value={libraryValue}>
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--theme-bg)] text-[var(--theme-text)]">
      {/* 36px Fixed Outer Level Rail */}
      <LevelRail activeLevel={activeLevel} onSelectLevel={setActiveLevel} />

      {!isFocus && (
        <Sidebar
          isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)}
          activeChapterId={activeChapter?.id || ""} onSelectChapter={openChapter}
          onOpenNotesDrawer={handleOpenNotesDrawer}
          activeLevel={activeLevel} activeSubView={inspectionalSession.activeSubView}
          onSelectSubView={inspectionalSession.setActiveSubView}
        />
      )}

      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <TopNav
          chapterTitle={activeChapter?.title || "Reading"} progressPercent={progressPercent}
          sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          theme={theme} onThemeChange={handleThemeChange}
          viewMode={viewMode} onViewModeChange={setViewMode}
          onOpenSearch={() => setSearchOpen(true)} dueCardsCount={dueCardsCount}
          onOpenPractice={() => setPracticeModalOpen(true)}
          onOpenNotesDrawer={handleOpenNotesDrawer}
          onOpenAnalytics={() => setAnalyticsModalOpen(true)}
          onOpenGuide={() => setGuideOpen(true)}
          onResyncDeck={refreshPracticeCards}
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
                vaultPath={vaultPath} markdown={chapterMarkdown}
                markdownSource={markdownSource} onPlaceSettled={handleSettled}
                highlights={highlights} targetAnchor={targetAnchor}
                onProgressChange={handleProgressChange} onAddHighlight={handleAddHighlight}
                onAddNoteFromSelection={handleNoteFromSelection}
                onAddTerm={handleAddTerm} onAddArgument={handleAddArgument}
                onAddCritique={handleAddCritique} onAddInquiry={handleAddInquiry}
                onAddSyntopic={handleAddSyntopic}
                analyticalStore={analyticalSession.analyticalStore}
                currentChapterFile={activeChapter?.file_path}
                activeLevel={activeLevel}
                onOpenInSplit={handleOpenInSplit}
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
        inspectionalSession={inspectionalSession}
        analyticalSession={analyticalSession} syntopiconSession={syntopiconSession} currentChapterFile={activeChapter?.file_path}
      />

      {/* Every failed backend load or save shows here */}
      <BackendErrorBar />
    </div>
    </LibraryContext.Provider>
    </SettingsContext.Provider>
  );
};
