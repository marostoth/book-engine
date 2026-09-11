import React, { useEffect, useState } from "react";
import { BookMeta, ChapterMeta, Theme, ViewMode } from "./lib/types";
import { fetchBookMeta, fetchChapter } from "./lib/api";
import { Sidebar } from "./components/Sidebar";
import { TopNav } from "./components/TopNav";
import { Reader } from "./components/Reader";
import { NotesPane } from "./components/NotesPane";

export const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>("paper");
  const [viewMode, setViewMode] = useState<ViewMode>("reading");
  const [isBionic, setIsBionic] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  const [bookMeta, setBookMeta] = useState<BookMeta | null>(null);
  const [activeChapter, setActiveChapter] = useState<ChapterMeta | null>(null);
  const [chapterMarkdown, setChapterMarkdown] = useState<string>("");
  const [progressPercent, setProgressPercent] = useState<number>(0);

  // Quote passed from SelectionMenu to NotesPane
  const [insertedQuote, setInsertedQuote] = useState<{ quote: string; anchorId?: string } | null>(null);

  // Sync theme to body class
  useEffect(() => {
    document.body.className = `theme-${theme} antialiased overflow-hidden select-none`;
  }, [theme]);

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

  // Load chapter text when activeChapter changes (Single-Chapter Virtualization)
  useEffect(() => {
    if (!bookMeta || !activeChapter) return;
    fetchChapter(bookMeta.book_id, activeChapter.file_path).then((md) => {
      setChapterMarkdown(md);
      setProgressPercent(0);
    });
  }, [bookMeta, activeChapter]);

  const handleSelectChapter = (chapter: ChapterMeta) => {
    setActiveChapter(chapter);
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
        />

        {/* Content Container (Reader + Optional Dual-Pane Notes) */}
        <div className="flex-1 flex h-[calc(100vh-3.5rem)] overflow-hidden">
          {/* TipTap Virtualized Chapter Reader */}
          <Reader
            markdown={chapterMarkdown}
            isBionic={isBionic}
            onProgressChange={setProgressPercent}
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
    </div>
  );
};
