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
    <div className="p-3 border-b border-[var(--theme-border)] space-y-2.5 bg-[var(--theme-surface)]/30 flex-shrink-0">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-muted)]" />
        <input
          type="text"
          placeholder="Search highlights, reflections, or ^p-anchors..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-8.5 pr-3 py-1.5 text-xs rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-text)] placeholder:text-[var(--theme-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center p-0.5 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-border)]">
          <button
            onClick={() => onFilterChange("all")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              filterType === "all"
                ? "bg-[var(--theme-accent)]/20 text-[var(--theme-text)] shadow-sm font-semibold"
                : "text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
            }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => onFilterChange("highlight")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              filterType === "highlight"
                ? "bg-[var(--theme-accent)]/20 text-[var(--theme-text)] shadow-sm font-semibold"
                : "text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
            }`}
          >
            <Highlighter className="w-3 h-3 text-[var(--theme-accent)]" />
            <span>Highlights ({highlightCount})</span>
          </button>
          <button
            onClick={() => onFilterChange("note")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              filterType === "note"
                ? "bg-[var(--theme-accent)]/20 text-[var(--theme-text)] shadow-sm font-semibold"
                : "text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
            }`}
          >
            <FileText className="w-3 h-3 text-[var(--theme-accent)]" />
            <span>Notes ({noteCount})</span>
          </button>
        </div>

        <span className="text-[11px] text-[var(--theme-muted)]">
          Showing {filteredCount} entries
        </span>
      </div>
    </div>
  );
};
