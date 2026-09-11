import React, { useEffect, useState, useMemo } from "react";
import {
  X,
  BookMarked,
  Download,
  Search,
  Highlighter,
  FileText,
  ExternalLink,
  CheckCircle2,
  BookOpen,
  Hash,
  Sparkles,
} from "lucide-react";
import { BookMeta, AggregatedNoteItem } from "../lib/types";
import { getAllBookNotes, exportBookSummary } from "../lib/api";

interface NotesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bookMeta: BookMeta | null;
  onNavigateToAnchor: (chapterFile: string, anchor?: string) => void;
}

export const NotesDrawer: React.FC<NotesDrawerProps> = ({
  isOpen,
  onClose,
  bookMeta,
  onNavigateToAnchor,
}) => {
  const [allEntries, setAllEntries] = useState<AggregatedNoteItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<"all" | "highlight" | "note">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Load notes across all chapters when drawer opens or book changes
  useEffect(() => {
    if (!isOpen || !bookMeta) return;

    setLoading(true);
    getAllBookNotes(bookMeta.book_id)
      .then((items) => {
        setAllEntries(items);
      })
      .catch((err) => {
        console.warn("Failed to load book notes:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, bookMeta]);

  // Global Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Filter entries based on filterType and searchQuery
  const filteredEntries = useMemo(() => {
    return allEntries.filter((entry) => {
      // Type filter
      if (filterType !== "all" && entry.item_type !== filterType) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const textMatch = entry.text.toLowerCase().includes(q);
        const chapterMatch = entry.chapter_title.toLowerCase().includes(q);
        const anchorMatch = entry.anchor ? entry.anchor.toLowerCase().includes(q) : false;
        const headingMatch = entry.section_heading ? entry.section_heading.toLowerCase().includes(q) : false;
        return textMatch || chapterMatch || anchorMatch || headingMatch;
      }
      return true;
    });
  }, [allEntries, filterType, searchQuery]);

  // Group filtered entries by chapter
  const groupedByChapter = useMemo(() => {
    const map = new Map<string, { title: string; order: number; entries: AggregatedNoteItem[] }>();

    for (const entry of filteredEntries) {
      if (!map.has(entry.chapter_file)) {
        map.set(entry.chapter_file, {
          title: entry.chapter_title,
          order: entry.chapter_order,
          entries: [],
        });
      }
      map.get(entry.chapter_file)!.entries.push(entry);
    }

    return Array.from(map.entries()).sort((a, b) => a[1].order - b[1].order);
  }, [filteredEntries]);

  const highlightCount = useMemo(() => allEntries.filter((e) => e.item_type === "highlight").length, [allEntries]);
  const noteCount = useMemo(() => allEntries.filter((e) => e.item_type === "note").length, [allEntries]);

  // Handle Markdown summary export directly via backend
  const handleExportSummary = async () => {
    if (!bookMeta || isExporting) return;

    setIsExporting(true);
    try {
      const exportedPath = await exportBookSummary(bookMeta.book_id);
      setExportNotice(`Exported cleanly to ${exportedPath}`);
      setTimeout(() => {
        setExportNotice(null);
      }, 4500);
    } catch (err) {
      console.error("Export summary failed:", err);
      setExportNotice("Failed to export summary file.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleEntryClick = (entry: AggregatedNoteItem) => {
    onNavigateToAnchor(entry.chapter_file, entry.anchor || undefined);
    onClose();
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-150 select-none">
      {/* Semi-transparent backdrop blur */}
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Drawer Canvas */}
      <div
        className="relative z-10 w-full max-w-lg md:max-w-xl bg-[var(--theme-bg)] border-l border-black/10 dark:border-white/10 shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-200"
        style={{ backgroundColor: "var(--theme-bg)", color: "var(--theme-text)" }}
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between bg-black/[0.02] dark:bg-white/[0.02] flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/10 dark:bg-nord-accent/15 text-amber-700 dark:text-nord-accent flex-shrink-0">
              <BookMarked className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold truncate text-neutral-900 dark:text-neutral-100">
                Notes & Highlights Drawer
              </h2>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                {bookMeta?.title || "Active Book"} • {allEntries.length} aggregated entries
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Export Summary Action */}
            <button
              onClick={handleExportSummary}
              disabled={isExporting || allEntries.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 dark:bg-nord-accent dark:text-nord-bg dark:hover:bg-nord-accent/90 disabled:opacity-50 transition-all shadow-sm active:scale-95 cursor-pointer"
              title="Compile and export all highlights and reflections to summary-export.md"
            >
              <Download className={`w-3.5 h-3.5 ${isExporting ? "animate-bounce" : ""}`} />
              <span className="hidden sm:inline">{isExporting ? "Exporting..." : "Export Summary"}</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              title="Close Drawer (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Export Success Banner */}
        {exportNotice && (
          <div className="px-4 py-2 bg-emerald-500/15 border-b border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between gap-2 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="truncate font-mono text-[11px]">{exportNotice}</span>
            </div>
            <button
              onClick={() => setExportNotice(null)}
              className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 text-[10px] font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Filter and Search Bar */}
        <div className="p-3 border-b border-black/5 dark:border-white/5 space-y-2.5 bg-black/[0.01] dark:bg-white/[0.01] flex-shrink-0">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search highlights, reflections, or ^p-anchors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8.5 pr-3 py-1.5 text-xs rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-black/20 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Segmented Filter Pills */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center p-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] border border-black/5 dark:border-white/5">
              <button
                onClick={() => setFilterType("all")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  filterType === "all"
                    ? "bg-white dark:bg-nord-surface text-neutral-900 dark:text-neutral-100 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
                }`}
              >
                All ({allEntries.length})
              </button>
              <button
                onClick={() => setFilterType("highlight")}
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
                onClick={() => setFilterType("note")}
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
              Showing {filteredEntries.length} entries
            </span>
          </div>
        </div>

        {/* Aggregated List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-neutral-400 gap-2">
              <Sparkles className="w-5 h-5 animate-spin text-amber-600" />
              <span className="text-xs">Scanning vault notes...</span>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-center text-neutral-400 p-6 border-2 border-dashed border-black/10 dark:border-white/10 rounded-2xl">
              <BookOpen className="w-8 h-8 mb-2 opacity-40 text-amber-600" />
              <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                No entries found
              </h3>
              <p className="text-[11px] max-w-xs text-neutral-400">
                {searchQuery
                  ? "No highlights or reflection notes matched your filter criteria."
                  : "Highlight passages in the text or jot notes in the editor to populate this drawer."}
              </p>
            </div>
          ) : (
            groupedByChapter.map(([chapterFile, { title, entries }]) => (
              <div key={chapterFile} className="space-y-2.5">
                {/* Chapter Section Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between pb-1 pt-0.5 border-b border-black/10 dark:border-white/10 bg-[var(--theme-bg)]/95 backdrop-blur-sm">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-nord-accent truncate">
                      {title}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 flex-shrink-0">
                    {entries.length} items
                  </span>
                </div>

                {/* Chapter Entries List */}
                <div className="space-y-2">
                  {entries.map((entry) => {
                    const isHighlight = entry.item_type === "highlight";
                    return (
                      <div
                        key={entry.id}
                        onClick={() => handleEntryClick(entry)}
                        className={`group p-3 rounded-xl border transition-all cursor-pointer select-text ${
                          isHighlight
                            ? "bg-amber-500/[0.04] dark:bg-nord-accent/[0.05] border-amber-500/20 dark:border-nord-accent/20 hover:border-amber-500/50 dark:hover:border-nord-accent/50 hover:shadow-sm"
                            : "bg-black/[0.02] dark:bg-white/[0.03] border-black/10 dark:border-white/10 hover:border-black/25 dark:hover:border-white/25 hover:shadow-sm"
                        }`}
                      >
                        {/* Entry Meta Header */}
                        <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px]">
                          <div className="flex items-center gap-1.5">
                            {isHighlight ? (
                              <span className="flex items-center gap-1 font-semibold text-amber-700 dark:text-nord-accent uppercase tracking-wide">
                                <Highlighter className="w-2.5 h-2.5" />
                                Highlight
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wide">
                                <FileText className="w-2.5 h-2.5 text-neutral-400" />
                                {entry.section_heading || "Reflection"}
                              </span>
                            )}


                            {entry.anchor && (
                              <span className="inline-flex items-center gap-0.5 font-mono px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10 text-neutral-500 dark:text-neutral-400">
                                <Hash className="w-2.5 h-2.5" />
                                {entry.anchor.replace(/^\^/, "")}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 text-neutral-400 group-hover:text-amber-600 dark:group-hover:text-nord-accent transition-colors">
                            <span className="text-[10px] hidden group-hover:inline font-sans">
                              Jump to text
                            </span>
                            <ExternalLink className="w-3 h-3" />
                          </div>
                        </div>

                        {/* Entry Body */}
                        {isHighlight ? (
                          <blockquote className="text-xs font-serif leading-relaxed italic pl-2.5 border-l-2 border-amber-500 dark:border-nord-accent text-neutral-800 dark:text-neutral-200">
                            "{entry.text}"
                          </blockquote>
                        ) : (
                          <p className="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 font-sans">
                            {entry.text}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Drawer Footer Status */}
        <div className="p-3 border-t border-black/10 dark:border-white/10 text-[11px] text-neutral-400 dark:text-neutral-500 flex items-center justify-between bg-black/[0.02] dark:bg-white/[0.02] flex-shrink-0">
          <span>
            Clicking any entry jumps directly to the paragraph in reader
          </span>
          <span className="font-mono text-[10px]">ESC to close</span>
        </div>
      </div>
    </div>
  );
};
