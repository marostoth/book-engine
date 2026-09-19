import React, { useEffect, useRef, useState } from "react";
import { BookOpen, Hash, Search, X } from "lucide-react";
import { BookMetadata, SearchResult } from "../lib/types";
import { searchVault } from "../lib/api";
import { ReaderLocation, searchResultBookTitle, searchResultLocation } from "../lib/readerLocation";
import { MIN_SEARCH_CHARACTERS, isSearchable } from "../lib/searchQuery";
import { reportBackendError } from "../lib/backendErrors";
import { snippetNodes } from "../lib/searchSnippet";
import { useDialog } from "../hooks/useDialog";
import { useStartAgainWhen } from "../hooks/useStartAgainWhen";

interface OmniSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Library books, to show which book each hit comes from. */
  books: BookMetadata[];
  /** Receives the hit's own book, chapter file, and anchor: search covers all books. */
  onSelectResult: (location: ReaderLocation) => void;
}

/** The answer to one search, and the query it answers. An answer to an older query is not the answer to this one. */
interface SearchAnswer {
  to: string;
  results: SearchResult[];
  /** The search failed in the backend, so "No matching paragraphs" would not be true. */
  failed: boolean;
}

/**
 * The window is built only while it is open, so every opening starts with an empty box and no results. An effect
 * used to clear all three after the window with the last search in it was already on screen (TL-11).
 */
export const OmniSearchModal: React.FC<OmniSearchModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <OpenOmniSearchModal {...props} />;
};

const OpenOmniSearchModal: React.FC<OmniSearchModalProps> = ({
  isOpen,
  onClose,
  books,
  onSelectResult,
}) => {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<SearchAnswer | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const asked = query.trim();
  const searchable = isSearchable(query);
  /**
   * What is shown comes from the query in the box, never from what the last search left behind.
   *
   * These three used to be cleared in an effect when the query grew too short, one drawing after the short query
   * was on screen, so the reader could see results under a box that no longer matched them (TL-11).
   */
  const forThisQuery = searchable && answer?.to === asked ? answer : null;
  const results = forThisQuery?.results ?? [];
  const searchFailed = forThisQuery?.failed ?? false;
  const isSearching = searchable && forThisQuery === null;

  // The first control of the panel already takes the focus (`useDialog`), and this puts it in the box once the
  // window has been laid out, for a panel whose first control is not the box.
  useEffect(() => {
    const focusing = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(focusing);
  }, []);

  // The highlighted row belongs to the results of one query, and goes back to the first row with a new query.
  useStartAgainWhen(asked, () => setSelectedIndex(0));

  // Debounced search: a search shorter than MIN_SEARCH_CHARACTERS does not run.
  useEffect(() => {
    if (!isSearchable(query)) return;
    const asking = query.trim();
    const timer = setTimeout(() => {
      searchVault(asking)
        .then((found) => setAnswer({ to: asking, results: found, failed: false }))
        .catch((err) => {
          setAnswer({ to: asking, results: [], failed: true });
          reportBackendError("The search did not run.", err);
        });
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  /**
   * Escape, the focus and the role come from the one shared rule now (RD-07). This window has no heading of its own,
   * so it carries a plain name instead of pointing at one.
   *
   * Escape used to live in the handler below, on the panel element. React sends a key to the handlers above the
   * element the key reached, so Escape worked only while the focus was already inside the window. It works wherever
   * the focus is now.
   */
  const { panelProps, close } = useDialog({ isOpen, onClose, label: "Search every book of the vault" });

  // Moving through the hits, and opening one
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        onSelectResult(searchResultLocation(results[selectedIndex]));
        close();
      }
    }
  };


  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={close}
    >
      <div
        {...panelProps}
        className="relative w-full max-w-2xl rounded-2xl shadow-2xl border bg-[var(--theme-surface)] text-[var(--theme-text)] border-[var(--theme-border)] overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--theme-border)]">
          <Search className="w-5 h-5 text-[var(--theme-muted)] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vault chapters and paragraph anchors (e.g. consensus, ^p-003)..."
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-[var(--theme-muted)] text-[var(--theme-text)]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear the search box"
              className="p-1 rounded-full text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--theme-bg)] text-[var(--theme-muted)] border border-[var(--theme-border)]">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-[var(--theme-border)]">
          {isSearching && (
            <div className="p-8 text-center text-xs text-[var(--theme-muted)] animate-pulse">
              Querying SQLite FTS5 index...
            </div>
          )}

          {!isSearching && results.length === 0 && isSearchable(query) && (
            <div className="p-8 text-center text-xs text-[var(--theme-muted)]">
              {searchFailed ? (
                "The search did not run. The error shows at the bottom of the window."
              ) : (
                <>No matching paragraphs found for &quot;{query}&quot;</>
              )}
            </div>
          )}

          {!isSearching && !isSearchable(query) && (
            <div className="p-8 text-center text-xs text-[var(--theme-muted)]">
              {query.trim()
                ? `Type at least ${MIN_SEARCH_CHARACTERS} characters to search.`
                : "Type keywords to search across all book chapters with sub-15ms FTS5 retrieval."}
              <br />
              Use &quot;quotes&quot; for a phrase, and AND, OR, NOT in capitals.
            </div>
          )}

          {results.map((res, index) => {
            const isSelected = index === selectedIndex;
            const bookTitle = searchResultBookTitle(res, books);
            return (
              <div
                key={`${res.book_id}-${res.chapter_id}-${res.anchor}-${index}`}
                onClick={() => {
                  onSelectResult(searchResultLocation(res));
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`p-3 rounded-xl cursor-pointer transition-all duration-150 flex flex-col gap-1.5 ${
                  isSelected
                    ? "bg-[var(--theme-accent)]/15 border border-[var(--theme-accent)]/30 text-[var(--theme-text)]"
                    : "hover:bg-[var(--theme-bg)] border border-transparent text-[var(--theme-text)]"
                }`}
              >
                <div className="truncate text-[11px] text-[var(--theme-muted)]" title={bookTitle}>
                  {bookTitle}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-[var(--theme-text)]">
                    <BookOpen className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                    {res.chapter_title}
                  </span>
                  {res.anchor && (
                    <span className="flex items-center gap-1 font-mono text-[11px] text-[var(--theme-muted)] bg-[var(--theme-bg)] border border-[var(--theme-border)] px-2 py-0.5 rounded">
                      <Hash className="w-3 h-3" />
                      {res.anchor}
                    </span>
                  )}
                </div>

                <div className="font-serif text-xs leading-relaxed text-[var(--theme-muted)] line-clamp-2 select-none [&_mark]:bg-[var(--theme-accent)]/30 [&_mark]:text-[var(--theme-text)] [&_mark]:rounded [&_mark]:px-0.5 font-normal">
                  {/* Plain text with a mark around each hit: book text never becomes HTML here (SEC-01). */}
                  {snippetNodes(res.snippet)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-[var(--theme-bg)]/50 border-t border-[var(--theme-border)] text-[10px] text-[var(--theme-muted)] flex items-center justify-between">
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
