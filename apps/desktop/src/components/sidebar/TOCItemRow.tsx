import React from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { TOCItem, ChapterMeta } from "../../lib/types";
import type { ContentsTarget } from "../../lib/tableOfContents";

interface TOCItemRowProps {
  item: TOCItem;
  /** Where the entry opens, or null when no chapter of the book holds it (CQ-01). */
  target: ContentsTarget | null;
  activeChapterId: string;
  isCollapsed: boolean;
  onToggleSection: (id: string, e: React.MouseEvent) => void;
  onSelectChapter: (ch: ChapterMeta, anchor?: string) => void;
  findTarget: (item: TOCItem) => ContentsTarget | null;
}

/** The tooltip of an entry that opens nothing, such as endnotes that the import moved into the chapters. */
const NO_CHAPTER = "No chapter of this book holds this entry";

export const TOCItemRow: React.FC<TOCItemRowProps> = ({
  item,
  target,
  activeChapterId,
  isCollapsed,
  onToggleSection,
  onSelectChapter,
  findTarget,
}) => {
  const isActive = target?.chapter.id === activeChapterId;
  const hasSubs = Boolean(item.subitems && item.subitems.length > 0);

  return (
    <div className="space-y-0.5">
      {/* Level 1 Node */}
      <div
        onClick={() => {
          if (target) {
            onSelectChapter(target.chapter, target.anchor);
          }
        }}
        title={target ? undefined : NO_CHAPTER}
        className={`group w-full text-left p-2 rounded-xl transition-all duration-150 flex items-start justify-between gap-1.5 border ${
          isActive
            ? "cursor-pointer bg-[var(--theme-accent)]/15 text-[var(--theme-text)] border-[var(--theme-accent)]/30 font-semibold shadow-sm"
            : target
              ? "cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 border-transparent text-[var(--theme-text)]/80 hover:text-[var(--theme-text)]"
              : "cursor-default border-transparent text-[var(--theme-muted)]"
        }`}
      >
        <div className="flex items-start gap-1.5 min-w-0 flex-1">
          {hasSubs && (
            <button
              type="button"
              onClick={(e) => onToggleSection(item.id, e)}
              className="mt-0.5 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[var(--theme-muted)] flex-shrink-0"
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
            <span className="text-xs leading-snug line-clamp-2">{item.title}</span>
            {/* The words of the whole chapter, so only for an entry that opens the chapter at its top */}
            {target && !target.anchor && (
              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[var(--theme-muted)] font-normal">
                <span>{target.chapter.word_count} words</span>
              </div>
            )}
          </div>
        </div>

        {isActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-accent)] animate-pulse flex-shrink-0 mt-1" />
        )}
      </div>

      {/* Level 2 Subitems */}
      {hasSubs && !isCollapsed && (
        <div className="pl-4 ml-2 border-l border-[var(--theme-border)] space-y-0.5">
          {item.subitems?.map((sub) => {
            const subTarget = findTarget(sub);
            const isSubActive = subTarget?.chapter.id === activeChapterId;

            return (
              <button
                key={sub.id}
                type="button"
                disabled={!subTarget}
                title={subTarget ? undefined : NO_CHAPTER}
                onClick={() => {
                  if (subTarget) onSelectChapter(subTarget.chapter, subTarget.anchor);
                }}
                className={`w-full text-left p-2 rounded-lg transition-all duration-150 flex items-center justify-between gap-1 text-xs ${
                  isSubActive
                    ? "bg-[var(--theme-accent)]/15 text-[var(--theme-text)] font-medium border border-[var(--theme-accent)]/30 shadow-sm"
                    : subTarget
                      ? "hover:bg-black/5 dark:hover:bg-white/5 text-[var(--theme-text)]/80 hover:text-[var(--theme-text)]"
                      : "cursor-default text-[var(--theme-muted)]"
                }`}
              >
                <span className="truncate flex-1">{sub.title}</span>
                {isSubActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-accent)] animate-pulse flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
