import React from "react";
import { BookOpen, ChevronLeft, Hash } from "lucide-react";
import { BookMeta, ChapterMeta } from "../lib/types";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  bookMeta: BookMeta | null;
  activeChapterId: string;
  onSelectChapter: (chapter: ChapterMeta) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  bookMeta,
  activeChapterId,
  onSelectChapter,
}) => {
  return (
    <aside
      className={`relative z-30 h-full flex-shrink-0 transition-all duration-300 ease-in-out border-r border-black/10 dark:border-white/10 bg-white/60 dark:bg-nord-surface/60 backdrop-blur-md flex flex-col ${
        isOpen ? "w-72" : "w-0 overflow-hidden border-none"
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
        <div className="min-w-0 pr-2">
          <h2 className="text-sm font-semibold truncate tracking-tight text-neutral-900 dark:text-neutral-100">
            {bookMeta?.title || "Book Index"}
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            {bookMeta?.author || "Local Vault"}
          </p>
        </div>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
          title="Collapse Sidebar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Chapter List / TOC */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Table of Contents
        </div>

        {bookMeta?.spine.map((chapter) => {
          const isActive = chapter.id === activeChapterId;
          return (
            <button
              key={chapter.id}
              onClick={() => onSelectChapter(chapter)}
              className={`w-full text-left p-2.5 rounded-xl transition-all duration-150 flex flex-col gap-1 ${
                isActive
                  ? "bg-amber-500/10 dark:bg-nord-accent/15 text-amber-900 dark:text-nord-accent border border-amber-500/20 dark:border-nord-accent/30 font-medium"
                  : "hover:bg-black/5 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300"
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="truncate font-medium">{chapter.title}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-nord-accent animate-pulse flex-shrink-0 ml-1" />
                )}
              </div>

              <div className="flex items-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-500">
                <span className="flex items-center gap-0.5">
                  <BookOpen className="w-3 h-3" />
                  {chapter.word_count} words
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

      {/* Footer Stats */}
      {bookMeta && (
        <div className="p-3 border-t border-black/5 dark:border-white/5 text-[11px] text-neutral-400 dark:text-neutral-500 flex items-center justify-between">
          <span>{bookMeta.total_chapters} Chapters</span>
          <span>{bookMeta.total_words.toLocaleString()} Words</span>
        </div>
      )}
    </aside>
  );
};
