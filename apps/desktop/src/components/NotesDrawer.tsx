import React, { useEffect, useState, useMemo } from "react";
import {
  X,
  BookMarked,
  Download,
  CheckCircle2,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { BookMeta, AggregatedNoteItem } from "../lib/types";
import { getAllBookNotes, exportBookSummary } from "../lib/api";
import { NoteEntryCard } from "./notes/NoteEntryCard";
import { DrawerFilterBar } from "./notes/DrawerFilterBar";

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

  const filteredEntries = useMemo(() => {
    return allEntries.filter((entry) => {
      if (filterType !== "all" && entry.item_type !== filterType) {
        return false;
      }
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
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

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
            <button
              onClick={handleExportSummary}
              disabled={isExporting || allEntries.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 dark:bg-nord-accent dark:text-nord-bg dark:hover:bg-nord-accent/90 disabled:opacity-50 transition-all shadow-sm active:scale-95 cursor-pointer"
              title="Compile and export all highlights and reflections to summary-export.md"
            >
              <Download className={`w-3.5 h-3.5 ${isExporting ? "animate-bounce" : ""}`} />
              <span className="hidden sm:inline">{isExporting ? "Exporting..." : "Export Summary"}</span>
            </button>

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

        {/* Filter and Search Bar Subcomponent */}
        <DrawerFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterType={filterType}
          onFilterChange={setFilterType}
          totalCount={allEntries.length}
          highlightCount={highlightCount}
          noteCount={noteCount}
          filteredCount={filteredEntries.length}
        />

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

                <div className="space-y-2">
                  {entries.map((entry) => (
                    <NoteEntryCard
                      key={entry.id}
                      entry={entry}
                      onClick={() => handleEntryClick(entry)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Drawer Footer Status */}
        <div className="p-3 border-t border-black/10 dark:border-white/10 text-[11px] text-neutral-400 dark:text-neutral-500 flex items-center justify-between bg-black/[0.02] dark:bg-white/[0.02] flex-shrink-0">
          <span>Clicking any entry jumps directly to the paragraph in reader</span>
          <span className="font-mono text-[10px]">ESC to close</span>
        </div>
      </div>
    </div>
  );
};
