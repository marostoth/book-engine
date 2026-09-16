import React, { useState, useRef, useEffect } from "react";
import { Library, ChevronDown, Check, BookOpen, Layers, RefreshCw } from "lucide-react";
import { BookMetadata } from "../lib/types";
import type { LibraryRescanControl } from "../lib/libraryRescan";

interface BookSelectorProps {
  currentBookId: string;
  currentTitle: string;
  currentAuthor: string;
  books: BookMetadata[];
  onSelectBook: (bookId: string) => void;
  /** The "Rescan library" button under the list, for books imported while the app is open (DS-13). */
  libraryRescan?: LibraryRescanControl;
  compact?: boolean;
}

export const BookSelector: React.FC<BookSelectorProps> = ({
  currentBookId,
  currentTitle,
  currentAuthor,
  books,
  onSelectBook,
  libraryRescan,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (bookId: string) => {
    onSelectBook(bookId);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left w-full">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full group text-left rounded-xl transition-all duration-150 flex items-center justify-between gap-2 border ${
          isOpen
            ? "bg-black/[0.06] dark:bg-white/[0.08] border-black/15 dark:border-white/20 shadow-sm"
            : "hover:bg-black/[0.04] dark:hover:bg-white/[0.05] border-transparent hover:border-black/5 dark:hover:border-white/5"
        } ${compact ? "p-1.5" : "p-2"}`}
        title="Switch Book in Vault Library"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <Library className="w-4 h-4 text-[var(--theme-accent)]" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-xs font-semibold truncate tracking-tight text-[var(--theme-text)]">
              {currentTitle || "Select a Book"}
            </h2>
            <p className="text-[10.5px] text-[var(--theme-muted)] truncate">
              {currentAuthor || "Local Vault Library"}
            </p>
          </div>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--theme-muted)] flex-shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-[var(--theme-text)]" : "group-hover:text-[var(--theme-text)]"
          }`}
        />
      </button>

      {/* Dropdown Popover Menu with 100% Solid Opaque Background */}
      {isOpen && (
        <div
          className="absolute left-0 top-full mt-2 w-84 max-w-[90vw] z-50 rounded-2xl border border-[var(--theme-border)] shadow-2xl p-2.5 bg-[var(--theme-surface)] text-[var(--theme-text)] overflow-hidden"
          style={{ backgroundColor: "var(--theme-surface)" }}
        >
          {/* Popover Header */}
          <div className="px-3 py-2 border-b border-[var(--theme-border)] flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-[var(--theme-text)]">
              <BookOpen className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
              <span>Vault Library</span>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-muted)]">
              {books.length} {books.length === 1 ? "Book" : "Books"}
            </span>
          </div>

          {/* Book List */}
          <div className="mt-2 max-h-80 overflow-y-auto space-y-1.5 p-1">
            {books.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--theme-muted)]">
                No books discovered in vault/books/
              </div>
            ) : (
              books.map((book) => {
                const isSelected = book.id === currentBookId;
                return (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => handleSelect(book.id)}
                    className={`w-full text-left p-3 rounded-xl transition-all duration-150 flex items-start justify-between gap-3 border ${
                      isSelected
                        ? "bg-[var(--theme-accent)]/15 border-[var(--theme-accent)]/40 text-[var(--theme-text)] shadow-sm"
                        : "bg-[var(--theme-bg)]/60 border-[var(--theme-border)]/50 hover:bg-[var(--theme-bg)] hover:border-[var(--theme-border)] text-[var(--theme-text)]"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs font-bold leading-snug line-clamp-2 text-[var(--theme-text)]">
                        {book.title}
                      </h3>
                      <p className="text-[11px] text-[var(--theme-muted)] mt-0.5 truncate font-medium">
                        {book.author}
                      </p>

                      <div className="flex items-center gap-2 mt-2 text-[10px] text-[var(--theme-muted)]">
                        <span className="flex items-center gap-1 font-medium">
                          <Layers className="w-3 h-3" />
                          {book.chapter_count} {book.chapter_count === 1 ? "chapter" : "chapters"}
                        </span>
                        {book.total_words > 0 && (
                          <span>• {book.total_words.toLocaleString()} words</span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-[var(--theme-accent)] text-white flex items-center justify-center shadow-sm">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Rescan: books imported while the app is open, in the list and in search (DS-13) */}
          {libraryRescan && (
            <div className="mt-2 pt-2 px-1 border-t border-[var(--theme-border)]">
              <button
                type="button"
                onClick={libraryRescan.run}
                disabled={libraryRescan.running}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--theme-border)] bg-[var(--theme-bg)]/60 hover:bg-[var(--theme-bg)] text-[var(--theme-text)] transition-colors disabled:opacity-60 disabled:cursor-wait"
                title="Find books you imported while the app was open, and add them to search"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-[var(--theme-accent)] ${libraryRescan.running ? "animate-spin" : ""}`}
                />
                {libraryRescan.running ? "Rescanning…" : "Rescan library"}
              </button>
              <p
                role="status"
                className={`px-2 text-center text-[10.5px] leading-snug text-[var(--theme-muted)] ${
                  libraryRescan.note && !libraryRescan.running ? "mt-1.5" : ""
                }`}
              >
                {libraryRescan.running ? "" : libraryRescan.note}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
