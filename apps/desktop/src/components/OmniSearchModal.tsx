import React, { useEffect, useRef, useState } from "react";
import { BookOpen, Hash, Search, X } from "lucide-react";
import { SearchResult } from "../lib/types";
import { searchVault } from "../lib/api";

interface OmniSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (chapterFile: string, anchor: string) => void;
}

export const OmniSearchModal: React.FC<OmniSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectResult,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      searchVault(query.trim())
        .then((res) => {
          setResults(res);
          setSelectedIndex(0);
        })
        .finally(() => setIsSearching(false));
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        const item = results[selectedIndex];
        onSelectResult(item.chapter_file, item.anchor);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl shadow-2xl border bg-white/95 dark:bg-nord-surface/95 backdrop-blur-xl border-black/10 dark:border-white/10 overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/10 dark:border-white/10">
          <Search className="w-5 h-5 text-neutral-400 dark:text-neutral-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vault chapters and paragraph anchors (e.g. consensus, ^p-003)..."
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-neutral-400 text-neutral-900 dark:text-neutral-100"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1 rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/5 dark:bg-white/10 text-neutral-400 border border-black/5 dark:border-white/5">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-black/5 dark:divide-white/5">
          {isSearching && (
            <div className="p-8 text-center text-xs text-neutral-400 animate-pulse">
              Querying SQLite FTS5 index...
            </div>
          )}

          {!isSearching && results.length === 0 && query.trim() && (
            <div className="p-8 text-center text-xs text-neutral-400">
              No matching paragraphs found for &quot;{query}&quot;
            </div>
          )}

          {!isSearching && !query.trim() && (
            <div className="p-8 text-center text-xs text-neutral-400">
              Type keywords to search across all book chapters with sub-15ms FTS5 retrieval.
            </div>
          )}

          {results.map((res, index) => {
            const isSelected = index === selectedIndex;
            return (
              <div
                key={`${res.chapter_id}-${res.anchor}-${index}`}
                onClick={() => {
                  onSelectResult(res.chapter_file, res.anchor);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`p-3 rounded-xl cursor-pointer transition-all duration-150 flex flex-col gap-1.5 ${
                  isSelected
                    ? "bg-amber-500/10 dark:bg-nord-accent/15 border border-amber-500/25 dark:border-nord-accent/30"
                    : "hover:bg-black/5 dark:hover:bg-white/5 border border-transparent"
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-neutral-800 dark:text-neutral-200">
                    <BookOpen className="w-3.5 h-3.5 text-amber-600 dark:text-nord-accent" />
                    {res.chapter_title}
                  </span>
                  {res.anchor && (
                    <span className="flex items-center gap-1 font-mono text-[11px] text-neutral-400 dark:text-neutral-500 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">
                      <Hash className="w-3 h-3" />
                      {res.anchor}
                    </span>
                  )}
                </div>

                <div
                  className="font-serif text-xs leading-relaxed text-neutral-600 dark:text-neutral-300 line-clamp-2 select-none [&_mark]:bg-amber-300/80 [&_mark]:dark:bg-nord-accent/40 [&_mark]:rounded [&_mark]:px-0.5 [&_mark]:text-inherit font-normal"
                  dangerouslySetInnerHTML={{ __html: res.snippet }}
                />
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-black/[0.02] dark:bg-white/[0.02] border-t border-black/5 dark:border-white/5 text-[10px] text-neutral-400 flex items-center justify-between">
          <span>
            {results.length > 0 ? `${results.length} results found` : "SQLite FTS5 Query Accelerator"}
          </span>
          <div className="flex items-center gap-2">
            <span>↑↓ Navigate</span>
            <span>↵ Jump to Anchor</span>
          </div>
        </div>
      </div>
    </div>
  );
};
