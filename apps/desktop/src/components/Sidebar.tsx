import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  BookOpen,
  Hash,
  ListTree,
  ListOrdered,
  Search,
  BookMarked,
} from "lucide-react";
import { BookMeta, ChapterMeta, BookMetadata, TOCItem, ReadingLevelMode, InspectionalSubView } from "../lib/types";
import { BookSelector } from "./BookSelector";
import type { LibraryRescanControl } from "../lib/libraryRescan";
import { TOCItemRow } from "./sidebar/TOCItemRow";
import { contentsOpenChapters, contentsTarget, type ContentsTarget } from "../lib/tableOfContents";
import { Compass, BookCheck } from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  bookMeta: BookMeta | null;
  availableBooks: BookMetadata[];
  onSelectBook: (bookId: string) => void;
  /** The "Rescan library" button of the book list (DS-13). */
  libraryRescan?: LibraryRescanControl;
  activeChapterId: string;
  /** Opens a chapter, at the paragraph `anchor` when given: an entry of the contents can start inside a chapter. */
  onSelectChapter: (chapter: ChapterMeta, anchor?: string) => void;
  onOpenNotesDrawer?: () => void;
  activeLevel?: ReadingLevelMode;
  activeSubView?: InspectionalSubView;
  onSelectSubView?: (subView: InspectionalSubView) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  bookMeta,
  availableBooks,
  onSelectBook,
  libraryRescan,
  activeChapterId,
  onSelectChapter,
  onOpenNotesDrawer,
  activeLevel = "elementary",
  activeSubView = "blueprint",
  onSelectSubView,
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

  // An entry opens the chapter file and the paragraph that the import wrote into it. Many chapters can share a title,
  // so titles are never compared (CQ-01).
  const findTarget = useMemo(() => {
    return (item: TOCItem): ContentsTarget | null => (bookMeta ? contentsTarget(item, bookMeta.spine) : null);
  }, [bookMeta]);

  const filteredSpine = useMemo(() => {
    if (!bookMeta) return [];
    if (!searchFilter.trim()) return bookMeta.spine;
    const q = searchFilter.toLowerCase();
    return bookMeta.spine.filter((ch) => ch.title.toLowerCase().includes(q));
  }, [bookMeta, searchFilter]);

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

  // The contents of a book imported before CQ-01 name source files and open no chapter: its chapter list shows
  const hasNestedTOC = Boolean(bookMeta && contentsOpenChapters(bookMeta.toc ?? [], bookMeta.spine));

  return (
    <aside
      className={`relative z-30 h-full flex-shrink-0 transition-all duration-300 ease-in-out border-r border-[var(--theme-border)] bg-[var(--theme-surface)]/85 backdrop-blur-md flex flex-col ${
        isOpen ? "w-80" : "w-0 overflow-hidden border-none"
      }`}
    >
      {/* Header with Book Selector */}
      <div className="p-3 border-b border-[var(--theme-border)] flex items-center justify-between gap-1">
        <div className="min-w-0 flex-1">
          <BookSelector
            currentBookId={bookMeta?.book_id || ""}
            currentTitle={bookMeta?.title || "Select a Book"}
            currentAuthor={bookMeta?.author || "Local Vault Library"}
            books={availableBooks}
            onSelectBook={onSelectBook}
            libraryRescan={libraryRescan}
          />
        </div>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-[var(--theme-muted)] hover:text-[var(--theme-text)] transition-colors flex-shrink-0"
          title="Collapse Sidebar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Inspectional Sub-Mode Switcher */}
      {activeLevel === "inspectional" && onSelectSubView && (
        <div className="px-3 pt-2 pb-0.5 flex items-center gap-1">
          <div className="flex-1 flex p-0.5 rounded-lg bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20 text-xs font-medium">
            <button
              type="button"
              onClick={() => onSelectSubView("blueprint")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-md transition-all cursor-pointer ${
                activeSubView === "blueprint"
                  ? "bg-[var(--theme-accent)] text-white shadow-sm font-semibold"
                  : "text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Blueprint</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectSubView("dips")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-md transition-all cursor-pointer ${
                activeSubView === "dips"
                  ? "bg-[var(--theme-accent)] text-white shadow-sm font-semibold"
                  : "text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
              }`}
            >
              <BookCheck className="w-3.5 h-3.5" />
              <span>Dip Sampler</span>
            </button>
          </div>
        </div>
      )}

      {/* Navigation View Switcher (TOC vs Chapters) */}
      <div className="px-3 pt-2.5 pb-1 flex items-center gap-1">
        <div className="flex-1 flex p-0.5 rounded-lg bg-[var(--theme-bg)]/80 border border-[var(--theme-border)] text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("toc")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-md font-medium transition-all ${
              activeTab === "toc"
                ? "bg-[var(--theme-surface)] text-[var(--theme-text)] shadow-sm"
                : "text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
            }`}
          >
            <ListTree className="w-3.5 h-3.5" />
            <span>Contents</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chapters")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-md font-medium transition-all ${
              activeTab === "chapters"
                ? "bg-[var(--theme-surface)] text-[var(--theme-text)] shadow-sm"
                : "text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Spine</span>
          </button>
        </div>
      </div>

      {/* Search Filter */}
      <div className="px-3 py-1.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-muted)]" />
          <input
            type="text"
            placeholder={activeTab === "toc" ? "Filter contents..." : "Filter chapters..."}
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)]/80 text-[var(--theme-text)] placeholder:text-[var(--theme-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]/50 transition-colors"
          />
        </div>
      </div>

      {/* Main List Area */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
        {activeTab === "toc" && hasNestedTOC ? (
          <div className="space-y-1">
            {filteredTOC.map((item) => (
              <TOCItemRow
                key={item.id}
                item={item}
                target={findTarget(item)}
                activeChapterId={activeChapterId}
                isCollapsed={Boolean(collapsedSections[item.id])}
                onToggleSection={toggleSection}
                onSelectChapter={onSelectChapter}
                findTarget={findTarget}
              />
            ))}
          </div>
        ) : (
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
                      ? "bg-[var(--theme-accent)]/15 text-[var(--theme-text)] border-[var(--theme-accent)]/30 font-medium shadow-sm"
                      : "border-transparent hover:bg-black/5 dark:hover:bg-white/5 text-[var(--theme-text)]/80 hover:text-[var(--theme-text)]"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-[10px] text-[var(--theme-muted)] flex-shrink-0 w-4 text-right">
                        {idx + 1}.
                      </span>
                      <span className="truncate font-medium">{chapter.title}</span>
                    </div>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-accent)] animate-pulse flex-shrink-0 ml-1" />
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

      {/* Footer Stats */}
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
