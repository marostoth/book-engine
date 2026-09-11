import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Hash,
  ListTree,
  ListOrdered,
  Search,
  BookMarked,
} from "lucide-react";
import { BookMeta, ChapterMeta, BookMetadata, TOCItem } from "../lib/types";
import { BookSelector } from "./BookSelector";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  bookMeta: BookMeta | null;
  availableBooks: BookMetadata[];
  onSelectBook: (bookId: string) => void;
  activeChapterId: string;
  onSelectChapter: (chapter: ChapterMeta) => void;
  onOpenNotesDrawer?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  bookMeta,
  availableBooks,
  onSelectBook,
  activeChapterId,
  onSelectChapter,
  onOpenNotesDrawer,
}) => {
  const [activeTab, setActiveTab] = useState<"toc" | "chapters">("toc");
  const [searchFilter, setSearchFilter] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Helper to map a TOC item to its corresponding spine chapter
  const findChapterForTOC = useMemo(() => {
    return (item: TOCItem): ChapterMeta | null => {
      if (!bookMeta) return null;
      const spine = bookMeta.spine;
      const tTitle = item.title.trim().toLowerCase();

      // 1. Exact title match
      for (const ch of spine) {
        if (ch.title.trim().toLowerCase() === tTitle) return ch;
      }

      // 2. Prefix/substring match
      for (const ch of spine) {
        const cTitle = ch.title.trim().toLowerCase();
        if (tTitle.startsWith(cTitle) || cTitle.startsWith(tTitle)) return ch;
      }

      // 3. Fallback: match first subitem
      if (item.subitems && item.subitems.length > 0) {
        for (const sub of item.subitems) {
          for (const ch of spine) {
            const cTitle = ch.title.trim().toLowerCase();
            const sTitle = sub.title.trim().toLowerCase();
            if (sTitle.startsWith(cTitle) || cTitle.startsWith(sTitle)) return ch;
          }
        }
      }

      return null;
    };
  }, [bookMeta]);

  // Filtered chapters for search
  const filteredSpine = useMemo(() => {
    if (!bookMeta) return [];
    if (!searchFilter.trim()) return bookMeta.spine;
    const q = searchFilter.toLowerCase();
    return bookMeta.spine.filter((ch) => ch.title.toLowerCase().includes(q));
  }, [bookMeta, searchFilter]);

  // Filtered TOC for search
  const filteredTOC = useMemo(() => {
    if (!bookMeta) return [];
    if (!searchFilter.trim()) return bookMeta.toc;
    const q = searchFilter.toLowerCase();
    const results: TOCItem[] = [];

    for (const item of bookMeta.toc) {
      const itemMatches = item.title.toLowerCase().includes(q);
      const matchedSubs = (item.subitems || []).filter((sub) =>
        sub.title.toLowerCase().includes(q)
      );
      if (itemMatches || matchedSubs.length > 0) {
        results.push({
          ...item,
          subitems: matchedSubs.length > 0 ? matchedSubs : item.subitems,
        });
      }
    }
    return results;
  }, [bookMeta, searchFilter]);

  const hasNestedTOC = bookMeta?.toc && bookMeta.toc.length > 0;

  return (
    <aside
      className={`relative z-30 h-full flex-shrink-0 transition-all duration-300 ease-in-out border-r border-black/10 dark:border-white/10 bg-white/60 dark:bg-nord-surface/60 backdrop-blur-md flex flex-col ${
        isOpen ? "w-80" : "w-0 overflow-hidden border-none"
      }`}
    >
      {/* Header with Interactive Book Selector */}
      <div className="p-3 border-b border-black/5 dark:border-white/5 flex items-center justify-between gap-1">
        <div className="min-w-0 flex-1">
          <BookSelector
            currentBookId={bookMeta?.book_id || ""}
            currentTitle={bookMeta?.title || "Select a Book"}
            currentAuthor={bookMeta?.author || "Local Vault Library"}
            books={availableBooks}
            onSelectBook={onSelectBook}
          />
        </div>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors flex-shrink-0"
          title="Collapse Sidebar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation View Switcher (TOC vs Chapters) */}
      <div className="px-3 pt-2.5 pb-1 flex items-center gap-1">
        <div className="flex-1 flex p-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] border border-black/5 dark:border-white/5 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("toc")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-md font-medium transition-all ${
              activeTab === "toc"
                ? "bg-white dark:bg-nord-surface text-neutral-900 dark:text-neutral-100 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
            }`}
          >
            <ListTree className="w-3.5 h-3.5 text-amber-600 dark:text-nord-accent" />
            <span>Contents</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("chapters")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-md font-medium transition-all ${
              activeTab === "chapters"
                ? "bg-white dark:bg-nord-surface text-neutral-900 dark:text-neutral-100 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5 text-amber-600 dark:text-nord-accent" />
            <span>Chapters ({bookMeta?.spine.length || 0})</span>
          </button>
        </div>
      </div>

      {/* Search filter within active book */}
      <div className="px-3 py-1.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder={activeTab === "toc" ? "Filter contents..." : "Filter chapters..."}
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
        </div>
      </div>

      {/* Main List Area */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
        {activeTab === "toc" && hasNestedTOC ? (
          /* Hierarchical Nested TOC Tree */
          <div className="space-y-1">
            {filteredTOC.map((item) => {
              const matchedCh = findChapterForTOC(item);
              const isActive = matchedCh?.id === activeChapterId;
              const hasSubs = Boolean(item.subitems && item.subitems.length > 0);
              const isCollapsed = Boolean(collapsedSections[item.id]);

              return (
                <div key={item.id} className="space-y-0.5">
                  {/* Level 1 Node */}
                  <div
                    onClick={() => {
                      if (matchedCh) {
                        onSelectChapter(matchedCh);
                      }
                    }}
                    className={`group w-full text-left p-2 rounded-xl transition-all duration-150 flex items-start justify-between gap-1.5 cursor-pointer border ${
                      isActive
                        ? "bg-amber-500/10 dark:bg-nord-accent/15 text-amber-900 dark:text-nord-accent border-amber-500/20 dark:border-nord-accent/30 font-semibold"
                        : "hover:bg-black/5 dark:hover:bg-white/5 border-transparent text-neutral-800 dark:text-neutral-200"
                    }`}
                  >
                    <div className="flex items-start gap-1.5 min-w-0 flex-1">
                      {hasSubs && (
                        <button
                          type="button"
                          onClick={(e) => toggleSection(item.id, e)}
                          className="mt-0.5 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-neutral-400 flex-shrink-0"
                          title={isCollapsed ? "Expand Section" : "Collapse Section"}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}

                      <div className="min-w-0 flex-1">
                        <span className="text-xs leading-snug line-clamp-2">
                          {item.title}
                        </span>
                        {matchedCh && (
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-neutral-400 dark:text-neutral-500 font-normal">
                            <span>{matchedCh.word_count} words</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-nord-accent animate-pulse flex-shrink-0 mt-1" />
                    )}
                  </div>

                  {/* Level 2 Subitems */}
                  {hasSubs && !isCollapsed && (
                    <div className="pl-4 ml-2 border-l border-black/5 dark:border-white/5 space-y-0.5">
                      {item.subitems?.map((sub) => {
                        const subCh = findChapterForTOC(sub);
                        const isSubActive = subCh?.id === activeChapterId;

                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => {
                              if (subCh) onSelectChapter(subCh);
                            }}
                            className={`w-full text-left p-2 rounded-lg transition-all duration-150 flex items-center justify-between gap-1 text-xs ${
                              isSubActive
                                ? "bg-amber-500/10 dark:bg-nord-accent/15 text-amber-900 dark:text-nord-accent font-medium border border-amber-500/20 dark:border-nord-accent/30"
                                : "hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-300"
                            }`}
                          >
                            <span className="truncate flex-1">{sub.title}</span>
                            {isSubActive && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-nord-accent animate-pulse flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Linear Chapter Sequence */
          <div className="space-y-1">
            {filteredSpine.map((chapter, idx) => {
              const isActive = chapter.id === activeChapterId;
              return (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => onSelectChapter(chapter)}
                  className={`w-full text-left p-2.5 rounded-xl transition-all duration-150 flex flex-col gap-1 border ${
                    isActive
                      ? "bg-amber-500/10 dark:bg-nord-accent/15 text-amber-900 dark:text-nord-accent border-amber-500/20 dark:border-nord-accent/30 font-medium shadow-sm"
                      : "border-transparent hover:bg-black/5 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-[10px] text-neutral-400 flex-shrink-0 w-4 text-right">
                        {idx + 1}.
                      </span>
                      <span className="truncate font-medium">{chapter.title}</span>
                    </div>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-nord-accent animate-pulse flex-shrink-0 ml-1" />
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-500 pl-5.5">
                    <span className="flex items-center gap-0.5">
                      <BookOpen className="w-3 h-3" />
                      {chapter.word_count.toLocaleString()} words
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Hash className="w-3 h-3" />
                      {chapter.anchor_count} anchors
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Stats & Quick Notes Drawer Link */}
      {bookMeta && (
        <div className="p-3 border-t border-black/5 dark:border-white/5 text-[11px] text-neutral-400 dark:text-neutral-500 flex items-center justify-between">
          <span>{bookMeta.total_chapters} Chapters</span>
          {onOpenNotesDrawer && (
            <button
              onClick={onOpenNotesDrawer}
              className="flex items-center gap-1 font-medium text-amber-700 dark:text-nord-accent hover:underline cursor-pointer"
              title="Open Unified Notes & Highlights Drawer"
            >
              <BookMarked className="w-3 h-3" />
              <span>Notes Drawer</span>
            </button>
          )}
          <span>{bookMeta.total_words.toLocaleString()} Words</span>
        </div>
      )}
    </aside>
  );
};
