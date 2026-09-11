import React, { useEffect, useState } from "react";
import { BookMeta, ChapterMeta, HighlightItem, Theme, ViewMode } from "./lib/types";
import { fetchBookMeta, fetchChapter, fetchNotes, persistNotes } from "./lib/api";
import { parseHighlightsFromNotes, serializeHighlightsToNotes } from "./lib/highlights";
import { Sidebar } from "./components/Sidebar";
import { TopNav } from "./components/TopNav";
import { Reader } from "./components/Reader";
import { NotesPane } from "./components/NotesPane";
import { OmniSearchModal } from "./components/OmniSearchModal";

export const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>("paper");
  const [viewMode, setViewMode] = useState<ViewMode>("reading");
  const [isBionic, setIsBionic] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

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

  // Load initial book metadata
  useEffect(() => {
    fetchBookMeta("sample").then((meta) => {
      setBookMeta(meta);
      if (meta.spine.length > 0) {
        const firstCh = meta.spine[0];
        setActiveChapter(firstCh);
      }
    });
  }, []);

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
    setTargetAnchor(undefined);
    setActiveChapter(chapter);
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
          activeChapterId={activeChapter?.id || ""}
          onSelectChapter={handleSelectChapter}
        />
      )}

      {/* Main Reading Canvas */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Editorial Top Navigation Header */}
        <TopNav
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
    </div>
  );
};
