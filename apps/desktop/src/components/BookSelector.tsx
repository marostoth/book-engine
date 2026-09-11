import React, { useState, useRef, useEffect } from "react";
import { Library, ChevronDown, Check, BookOpen, Layers } from "lucide-react";
import { BookMetadata } from "../lib/types";

interface BookSelectorProps {
  currentBookId: string;
  currentTitle: string;
  currentAuthor: string;
  books: BookMetadata[];
  onSelectBook: (bookId: string) => void;
  compact?: boolean;
}

export const BookSelector: React.FC<BookSelectorProps> = ({
  currentBookId,
  currentTitle,
  currentAuthor,
  books,
  onSelectBook,
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
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 dark:bg-nord-accent/15 border border-amber-500/20 dark:border-nord-accent/30 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <Library className="w-4 h-4 text-amber-700 dark:text-nord-accent" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-xs font-semibold truncate tracking-tight text-neutral-900 dark:text-neutral-100">
              {currentTitle || "Select a Book"}
            </h2>
            <p className="text-[10.5px] text-neutral-500 dark:text-neutral-400 truncate">
              {currentAuthor || "Local Vault Library"}
            </p>
          </div>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-neutral-700 dark:text-neutral-200" : "group-hover:text-neutral-700 dark:group-hover:text-neutral-200"
          }`}
        />
      </button>

      {/* Dropdown Popover Menu with 100% Solid Opaque Background */}
      {isOpen && (
        <div
          className="absolute left-0 top-full mt-2 w-84 max-w-[90vw] z-50 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl p-2.5 bg-white dark:bg-stone-900 overflow-hidden"
          style={{ backgroundColor: "var(--theme-surface)" }}
        >
          {/* Popover Header */}
          <div className="px-3 py-2 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-neutral-600 dark:text-neutral-300">
              <BookOpen className="w-3.5 h-3.5 text-amber-600 dark:text-nord-accent" />
              <span>Vault Library</span>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
              {books.length} {books.length === 1 ? "Book" : "Books"}
            </span>
          </div>

          {/* Book List */}
          <div className="mt-2 max-h-80 overflow-y-auto space-y-1.5 p-1">
            {books.length === 0 ? (
              <div className="p-4 text-center text-xs text-neutral-500">
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
                        ? "bg-amber-500/15 dark:bg-nord-accent/20 border-amber-500/40 dark:border-nord-accent/40 text-amber-950 dark:text-nord-accent shadow-sm"
                        : "bg-black/[0.03] dark:bg-white/[0.04] border-black/5 dark:border-white/5 hover:bg-black/[0.07] dark:hover:bg-white/[0.08] hover:border-black/15 dark:hover:border-white/15 text-neutral-800 dark:text-neutral-200"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs font-bold leading-snug line-clamp-2">
                        {book.title}
                      </h3>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate font-medium">
                        {book.author}
                      </p>

                      <div className="flex items-center gap-2 mt-2 text-[10px] text-neutral-500 dark:text-neutral-400">
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
                      <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-amber-600 dark:bg-nord-accent text-white flex items-center justify-center shadow-sm">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
