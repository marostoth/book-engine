import React from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { TOCItem, ChapterMeta } from "../../lib/types";

interface TOCItemRowProps {
  item: TOCItem;
  matchedCh: ChapterMeta | null;
  activeChapterId: string;
  isCollapsed: boolean;
  onToggleSection: (id: string, e: React.MouseEvent) => void;
  onSelectChapter: (ch: ChapterMeta) => void;
  findChapterForTOC: (item: TOCItem) => ChapterMeta | null;
}

export const TOCItemRow: React.FC<TOCItemRowProps> = ({
  item,
  matchedCh,
  activeChapterId,
  isCollapsed,
  onToggleSection,
  onSelectChapter,
  findChapterForTOC,
}) => {
  const isActive = matchedCh?.id === activeChapterId;
  const hasSubs = Boolean(item.subitems && item.subitems.length > 0);

  return (
    <div className="space-y-0.5">
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
              onClick={(e) => onToggleSection(item.id, e)}
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
            <span className="text-xs leading-snug line-clamp-2">{item.title}</span>
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
};
