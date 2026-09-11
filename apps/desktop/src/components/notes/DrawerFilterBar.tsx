import React from "react";
import { Search, Highlighter, FileText, X } from "lucide-react";

interface DrawerFilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterType: "all" | "highlight" | "note";
  onFilterChange: (t: "all" | "highlight" | "note") => void;
  totalCount: number;
  highlightCount: number;
  noteCount: number;
  filteredCount: number;
}

export const DrawerFilterBar: React.FC<DrawerFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  filterType,
  onFilterChange,
  totalCount,
  highlightCount,
  noteCount,
  filteredCount,
}) => {
  return (
    <div className="p-3 border-b border-black/5 dark:border-white/5 space-y-2.5 bg-black/[0.01] dark:bg-white/[0.01] flex-shrink-0">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          placeholder="Search highlights, reflections, or ^p-anchors..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-8.5 pr-3 py-1.5 text-xs rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-black/20 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center p-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] border border-black/5 dark:border-white/5">
          <button
            onClick={() => onFilterChange("all")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              filterType === "all"
                ? "bg-white dark:bg-nord-surface text-neutral-900 dark:text-neutral-100 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
            }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => onFilterChange("highlight")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              filterType === "highlight"
                ? "bg-white dark:bg-nord-surface text-neutral-900 dark:text-neutral-100 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
            }`}
          >
            <Highlighter className="w-3 h-3 text-amber-600 dark:text-nord-accent" />
            <span>Highlights ({highlightCount})</span>
          </button>
          <button
            onClick={() => onFilterChange("note")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              filterType === "note"
                ? "bg-white dark:bg-nord-surface text-neutral-900 dark:text-neutral-100 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
            }`}
          >
            <FileText className="w-3 h-3 text-amber-600 dark:text-nord-accent" />
            <span>Notes ({noteCount})</span>
          </button>
        </div>

        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
          Showing {filteredCount} entries
        </span>
      </div>
    </div>
  );
};
