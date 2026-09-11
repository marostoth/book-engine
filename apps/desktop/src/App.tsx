import React, { useEffect, useState } from "react";
import {
  BookMeta,
  BookMetadata,
  ChapterMeta,
  HighlightItem,
  Theme,
  ViewMode,
  PracticeCardItem,
  CardSchedule,
  ReaderPreferences,
} from "./lib/types";
import {
  fetchBookMeta,
  fetchChapter,
  fetchLibraryBooks,
  fetchNotes,
  persistNotes,
  syncPracticeDeck,
  getDueCards,
} from "./lib/api";
import { parseHighlightsFromNotes, serializeHighlightsToNotes } from "./lib/highlights";
import { Sidebar } from "./components/Sidebar";
import { TopNav } from "./components/TopNav";
import { Reader } from "./components/Reader";
import { NotesPane } from "./components/NotesPane";
import { OmniSearchModal } from "./components/OmniSearchModal";
import { PracticeModal } from "./components/PracticeModal";
import { GatekeeperModal } from "./components/GatekeeperModal";

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

  // Vault Library & Active Book
  const [availableBooks, setAvailableBooks] = useState<BookMetadata[]>([]);
  const [activeBookId, setActiveBookId] = useState<string>(() => {
    return localStorage.getItem("book_engine_active_book_id") || "sample";
  });

  const [bookMeta, setBookMeta] = useState<BookMeta | null>(null);
  const [activeChapter, setActiveChapter] = useState<ChapterMeta | null>(null);
  const [chapterMarkdown, setChapterMarkdown] = useState<string>("");
  const [progressPercent, setProgressPercent] = useState<number>(0);

  // W3C Highlights
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);

  // Search & Target Anchor Jumping
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [targetAnchor, setTargetAnchor] = useState<string | undefined>();

  // Quote passed from SelectionMenu to NotesPane
  const [insertedQuote, setInsertedQuote] = useState<{ quote: string; anchorId?: string } | null>(null);

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

  // Refresh and synchronize practice cards for active book
  const refreshPracticeCards = async (bookId?: string) => {
    const bId = bookId || activeBookId;
    if (!bId) return;
    try {
      await syncPracticeDeck(bId);
      const cards = await getDueCards(bId);
      setDueCards(cards);
    } catch (err) {
      console.warn("Failed to refresh practice cards:", err);
    }
  };

  // Discover available library books and hydrate active book from localStorage
  useEffect(() => {
    fetchLibraryBooks().then((books) => {
      setAvailableBooks(books);
      const savedId = localStorage.getItem("book_engine_active_book_id");
      const targetId =
        savedId && books.some((b) => b.id === savedId)
          ? savedId
          : books[0]?.id || "sample";

      setActiveBookId(targetId);
      loadBook(targetId);
    });
  }, []);

  const loadBook = async (bookId: string) => {
    try {
      const meta = await fetchBookMeta(bookId);
      setBookMeta(meta);
      if (meta.spine && meta.spine.length > 0) {
        const firstCh = meta.spine[0];
        setActiveChapter(firstCh);
        setTargetAnchor(undefined);
      }
      refreshPracticeCards(bookId);
    } catch (err) {
      console.error("Failed to load book metadata:", bookId, err);
    }
  };

  const handleSelectBook = (bookId: string) => {
    setActiveBookId(bookId);
    localStorage.setItem("book_engine_active_book_id", bookId);
    loadBook(bookId);
  };

  // Load chapter text and hydrate highlights when activeChapter changes (Single-Chapter Virtualization)
  useEffect(() => {
    if (!bookMeta || !activeChapter) return;

    fetchChapter(bookMeta.book_id, activeChapter.file_path).then((md) => {
      setChapterMarkdown(md);
      setProgressPercent(0);
    });

    // Hydrate W3C highlights from chapter notes file
    const notesFile = activeChapter.file_path.replace(".md", "-notes.md");
    fetchNotes(bookMeta.book_id, notesFile).then((notesContent) => {
      const parsedHighlights = parseHighlightsFromNotes(notesContent);
      setHighlights(parsedHighlights);
    });
  }, [bookMeta, activeChapter]);

  const handleSelectChapter = (chapter: ChapterMeta) => {
    // Check Chapter Gatekeeper Mode
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

  const handleAddHighlight = (newHighlight: HighlightItem) => {
    if (!bookMeta || !activeChapter) return;

    const updated = [...highlights, newHighlight];
    setHighlights(updated);

    // Asynchronously persist highlights to vault notes
    const notesFile = activeChapter.file_path.replace(".md", "-notes.md");
    fetchNotes(bookMeta.book_id, notesFile).then((currentNotes) => {
      const updatedNotes = serializeHighlightsToNotes(currentNotes, updated);
      persistNotes(bookMeta.book_id, notesFile, updatedNotes);
    });
  };

  const handleSelectSearchResult = (chapterFile: string, anchor: string) => {
    if (!bookMeta) return;

    // Check if target chapter is different from active chapter
    if (!activeChapter || activeChapter.file_path !== chapterFile) {
      const targetChapter = bookMeta.spine.find((ch) => ch.file_path === chapterFile);
      if (targetChapter) {
        setActiveChapter(targetChapter);
      }
    }

    setTargetAnchor(anchor);
  };

  const isFocus = viewMode === "focus";
  const isDual = viewMode === "dual";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--theme-bg)] text-[var(--theme-text)]">
      {/* Translucent Collapsible Sidebar (hidden in Focus Mode) */}
      {!isFocus && (
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          bookMeta={bookMeta}
          availableBooks={availableBooks}
          onSelectBook={handleSelectBook}
          activeChapterId={activeChapter?.id || ""}
          onSelectChapter={handleSelectChapter}
        />
      )}

      {/* Main Reading Canvas */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Editorial Top Navigation Header */}
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
          preferences={preferences}
          onPreferencesChange={handlePreferencesChange}
          onResyncDeck={() => refreshPracticeCards()}
        />

        {/* Content Container (Reader + Optional Dual-Pane Notes) */}
        <div className="flex-1 flex h-[calc(100vh-3.5rem)] overflow-hidden">
          {/* TipTap Virtualized Chapter Reader */}
          <Reader
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

          {/* Dual-Pane Side-by-Side Reflection Notes (when in dual mode) */}
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

      {/* Omni-Search Modal Command Palette */}
      <OmniSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectResult={handleSelectSearchResult}
      />

      {/* Extractive Practice Suite Modal */}
      <PracticeModal
        isOpen={practiceModalOpen}
        onClose={() => setPracticeModalOpen(false)}
        cards={dueCards}
        onReviewSubmitted={handleReviewSubmitted}
        onJumpToAnchor={handleSelectSearchResult}
        bookTitle={bookMeta?.title || "Book Engine"}
      />

      {/* Chapter Gatekeeper Modal */}
      <GatekeeperModal
        isOpen={gatekeeperModalOpen}
        onClose={() => setGatekeeperModalOpen(false)}
        targetChapterTitle={pendingChapter?.title || "Next Chapter"}
        cards={dueCards}
        onComplete={handleGatekeeperComplete}
        onReviewSubmitted={handleReviewSubmitted}
      />
    </div>
  );
};
