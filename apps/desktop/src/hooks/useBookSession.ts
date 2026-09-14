import { useState, useEffect, useCallback } from "react";
import {
  BookMeta,
  BookMetadata,
  ChapterMeta,
  HighlightItem,
} from "../lib/types";
import {
  fetchBookMeta,
  fetchChapter,
  fetchLibraryBooks,
  fetchNotes,
  persistNotes,
  recordReadingProgress,
  getVaultPath,
} from "../lib/api";
import { parseHighlightsFromNotes, serializeHighlightsToNotes } from "../lib/highlights";

export function useBookSession(onCardsRefreshNeeded?: (bookId: string) => void) {
  const [vaultPath, setVaultPath] = useState<string>("");
  const [availableBooks, setAvailableBooks] = useState<BookMetadata[]>([]);
  const [activeBookId, setActiveBookId] = useState<string>(() => {
    return localStorage.getItem("book_engine_active_book_id") || "sample";
  });

  const [bookMeta, setBookMeta] = useState<BookMeta | null>(null);
  const [activeChapter, setActiveChapter] = useState<ChapterMeta | null>(null);
  const [chapterMarkdown, setChapterMarkdown] = useState<string>("");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [targetAnchor, setTargetAnchor] = useState<string | undefined>();

  // Load canonical vault path on mount
  useEffect(() => {
    getVaultPath().then(setVaultPath).catch(() => {});
  }, []);

  const loadBook = useCallback(
    async (bookId: string) => {
      try {
        const meta = await fetchBookMeta(bookId);
        setBookMeta(meta);
        if (meta.spine && meta.spine.length > 0) {
          const firstCh = meta.spine[0];
          setActiveChapter(firstCh);
          setTargetAnchor(undefined);
        }
        if (onCardsRefreshNeeded) {
          onCardsRefreshNeeded(bookId);
        }
      } catch (err) {
        console.error("Failed to load book metadata:", bookId, err);
      }
    },
    [onCardsRefreshNeeded]
  );

  // Discover available library books and hydrate active book from localStorage
  useEffect(() => {
    fetchLibraryBooks().then((books) => {
      setAvailableBooks(books);
      const savedId = localStorage.getItem("book_engine_active_book_id");
      const targetId =
        savedId && books.some((b) => b.id === savedId)
          ? savedId
          : books[0]?.id || "sample";

      setActiveBookId(targetId);
      loadBook(targetId);
    });
  }, [loadBook]);

  const handleSelectBook = (bookId: string) => {
    setActiveBookId(bookId);
    localStorage.setItem("book_engine_active_book_id", bookId);
    loadBook(bookId);
  };

  // Load chapter text and hydrate highlights when activeChapter changes
  useEffect(() => {
    if (!bookMeta || !activeChapter) return;

    fetchChapter(bookMeta.book_id, activeChapter.file_path).then((md) => {
      setChapterMarkdown(md);
      setProgressPercent(0);
    });

    const notesFile = activeChapter.file_path.replace(".md", "-notes.md");
    fetchNotes(bookMeta.book_id, notesFile).then((notesContent) => {
      const parsedHighlights = parseHighlightsFromNotes(notesContent);
      setHighlights(parsedHighlights);
    });
  }, [bookMeta, activeChapter]);

  // Track active reading time and record progress to SQLite backend
  useEffect(() => {
    if (!activeBookId || !activeChapter) return;

    let elapsedSecs = 0;
    const interval = setInterval(() => {
      if (document.hasFocus()) {
        elapsedSecs += 5;
        if (elapsedSecs % 15 === 0) {
          const isCompleted = progressPercent >= 90;
          recordReadingProgress(
            activeBookId,
            activeChapter.file_path,
            15,
            activeChapter.word_count,
            isCompleted
          );
        }
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      const remainder = elapsedSecs % 15;
      if (remainder > 0 && activeBookId && activeChapter) {
        recordReadingProgress(
          activeBookId,
          activeChapter.file_path,
          remainder,
          activeChapter.word_count,
          progressPercent >= 90
        );
      }
    };
  }, [activeBookId, activeChapter, progressPercent]);

  const handleAddHighlight = (newHighlight: HighlightItem) => {
    if (!bookMeta || !activeChapter) return;

    const updated = [...highlights, newHighlight];
    setHighlights(updated);

    const notesFile = activeChapter.file_path.replace(".md", "-notes.md");
    fetchNotes(bookMeta.book_id, notesFile).then((currentNotes) => {
      const updatedNotes = serializeHighlightsToNotes(currentNotes, updated);
      persistNotes(bookMeta.book_id, notesFile, updatedNotes);
    });
  };

  const handleSelectSearchResult = (chapterFile: string, anchor?: string) => {
    if (!bookMeta) return;

    if (!activeChapter || activeChapter.file_path !== chapterFile) {
      const targetChapter = bookMeta.spine.find((ch) => ch.file_path === chapterFile);
      if (targetChapter) {
        setActiveChapter(targetChapter);
      }
    }

    setTargetAnchor(anchor);
  };

  const navigateToCrossBookCitation = useCallback(
    async (citation: { bookId: string; chapterFile: string; anchor: string }) => {
      if (citation.bookId !== activeBookId) {
        setActiveBookId(citation.bookId);
        localStorage.setItem("book_engine_active_book_id", citation.bookId);
        try {
          const meta = await fetchBookMeta(citation.bookId);
          setBookMeta(meta);
          const targetChapter =
            meta.spine?.find((ch) => ch.file_path === citation.chapterFile) || meta.spine?.[0];
          if (targetChapter) {
            setActiveChapter(targetChapter);
          }
          setTargetAnchor(citation.anchor);
        } catch (err) {
          console.error("Failed to switch book for citation:", citation.bookId, err);
        }
      } else {
        handleSelectSearchResult(citation.chapterFile, citation.anchor);
      }
    },
    [activeBookId, handleSelectSearchResult]
  );

  return {
    vaultPath,
    availableBooks,
    activeBookId,
    bookMeta,
    activeChapter,
    setActiveChapter,
    chapterMarkdown,
    progressPercent,
    setProgressPercent,
    highlights,
    targetAnchor,
    setTargetAnchor,
    handleSelectBook,
    handleAddHighlight,
    handleSelectSearchResult,
    navigateToCrossBookCitation,
    loadBook,
  };
}
