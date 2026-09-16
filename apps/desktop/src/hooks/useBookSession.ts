import { useState, useEffect, useCallback, useRef } from "react";
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
  getChapterHighlights,
  saveChapterHighlights,
  recordReadingProgress,
  getVaultPath,
} from "../lib/api";
import { reportBackendError } from "../lib/backendErrors";
import { ReaderLocation, resolveLocation } from "../lib/readerLocation";
import { createLoadGuard, loadBookOnto, loadChapterOnto } from "../lib/readerLoads";
import { ChapterMoveRequest } from "./useChapterGate";

interface BookSessionOptions {
  onCardsRefreshNeeded?: (bookId: string) => void;
  /** Checks a move to another chapter of the open book, and calls its `open` now or after the Chapter Gatekeeper. */
  requestChapterMove?: (move: ChapterMoveRequest) => void;
}

/** Reading time is saved in the background every 15 seconds. A failure shows once in the error bar, with a count. */
function reportReadingTimeError(err: unknown): void {
  reportBackendError("Your reading time was not saved.", err);
}

export function useBookSession({ onCardsRefreshNeeded, requestChapterMove }: BookSessionOptions = {}) {
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
  // The chapter ("book/file") whose highlights are shown. It is null while they load and after a failed load.
  // A new highlight is saved only for this chapter: a save with highlights that did not load would erase the saved ones.
  const [highlightsChapter, setHighlightsChapter] = useState<string | null>(null);

  // One reader, one newest load. A book or a chapter that answers after the reader moved on changes
  // nothing, so the words of the chapter you left are never shown under the chapter you opened (DS-07).
  const loads = useRef(createLoadGuard()).current;

  // Load canonical vault path on mount
  useEffect(() => {
    getVaultPath()
      .then(setVaultPath)
      .catch((err) => reportBackendError("Could not find the vault folder, so book images may not show.", err));
  }, []);

  const loadBook = useCallback(
    async (bookId: string) => {
      await loadBookOnto(fetchBookMeta, loads, bookId, {
        showBook: (meta, firstChapter) => {
          setBookMeta(meta);
          if (firstChapter) {
            setActiveChapter(firstChapter);
            setTargetAnchor(undefined);
          }
          onCardsRefreshNeeded?.(bookId);
        },
      }, reportBackendError);
    },
    [loads, onCardsRefreshNeeded]
  );

  // Discover available library books and hydrate active book from localStorage
  useEffect(() => {
    fetchLibraryBooks()
      .then((books) => {
        setAvailableBooks(books);
        const savedId = localStorage.getItem("book_engine_active_book_id");
        const targetId =
          savedId && books.some((b) => b.id === savedId)
            ? savedId
            : books[0]?.id || "sample";

        setActiveBookId(targetId);
        loadBook(targetId);
      })
      .catch((err) => reportBackendError("Could not load your library.", err));
  }, [loadBook]);

  const handleSelectBook = (bookId: string) => {
    setActiveBookId(bookId);
    localStorage.setItem("book_engine_active_book_id", bookId);
    loadBook(bookId);
  };

  // Load chapter text and hydrate highlights when activeChapter changes
  useEffect(() => {
    if (!bookMeta || !activeChapter) return;

    void loadChapterOnto(
      { fetchChapter, getChapterHighlights },
      loads,
      bookMeta,
      activeChapter,
      {
        clear: () => {
          setChapterMarkdown("");
          setProgressPercent(0);
          setHighlights([]);
          setHighlightsChapter(null);
        },
        showMarkdown: setChapterMarkdown,
        showHighlights: (items, source) => {
          setHighlights(items);
          setHighlightsChapter(source);
        },
      },
      reportBackendError
    );
  }, [bookMeta, activeChapter, loads]);

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
          ).catch(reportReadingTimeError);
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
        ).catch(reportReadingTimeError);
      }
    };
  }, [activeBookId, activeChapter, progressPercent]);

  const handleAddHighlight = (newHighlight: HighlightItem) => {
    if (!bookMeta || !activeChapter) return;

    const chapterFile = activeChapter.file_path;
    if (highlightsChapter !== `${bookMeta.book_id}/${chapterFile}`) {
      reportBackendError(
        "The highlight was not saved.",
        "The saved highlights of this chapter did not load, and a save now would erase them. Open the chapter again."
      );
      return;
    }

    const updated = [...highlights, newHighlight];
    setHighlights(updated);

    saveChapterHighlights(bookMeta.book_id, chapterFile, updated).catch((err) =>
      reportBackendError("The highlight was not saved.", err)
    );
  };

  /**
   * Opens a chapter of the open book, at `anchor` when given. Every chapter change inside the open book comes here
   * (table of contents, blueprint, dips, search, notes, citations, practice cards), so the Chapter Gatekeeper sees
   * each one. `onOpen` runs when the chapter opens, for example to leave the inspectional level.
   */
  const openChapter = useCallback(
    (chapter: ChapterMeta, anchor?: string, onOpen?: () => void) => {
      const sameChapter = chapter.file_path === activeChapter?.file_path;
      const open = () => {
        onOpen?.();
        setTargetAnchor(anchor);
        if (!sameChapter) {
          setActiveChapter(chapter);
        }
      };
      if (!bookMeta || !requestChapterMove || sameChapter) {
        open();
        return;
      }
      requestChapterMove({ bookId: bookMeta.book_id, spine: bookMeta.spine, from: activeChapter, to: chapter, open });
    },
    [bookMeta, activeChapter, requestChapterMove]
  );

  /** Opens a chapter file of the open book. Only for links that stay in one book: practice cards, notes, analytical citations. */
  const handleNavigateAnchor = (chapterFile: string, anchor?: string) => {
    if (!bookMeta) return;

    const targetChapter = bookMeta.spine.find((ch) => ch.file_path === chapterFile);
    if (targetChapter) {
      openChapter(targetChapter, anchor);
    } else {
      setTargetAnchor(anchor);
    }
  };

  /** Opens a location in its own book, loading that book first when another book is open: search hits, syntopicon citations. */
  const navigateToCrossBookCitation = useCallback(
    async (location: ReaderLocation) => {
      // A citation inside the open book needs no read from the disk, so it cannot come back late. Only
      // another book is read, and the reader may move on while that happens, so that load takes a ticket (DS-07).
      const isNewest = bookMeta?.book_id === location.bookId ? null : loads.start();
      try {
        const target = await resolveLocation(location, bookMeta, fetchBookMeta);
        if (isNewest && !isNewest()) return;
        if (target.book === bookMeta) {
          if (target.chapter) {
            openChapter(target.chapter, location.anchor);
          } else {
            setTargetAnchor(location.anchor);
          }
          return;
        }
        // Another book opens without the gate, which guards only the moves inside one book.
        setActiveBookId(location.bookId);
        localStorage.setItem("book_engine_active_book_id", location.bookId);
        setBookMeta(target.book);
        if (target.chapter) {
          setActiveChapter(target.chapter);
        }
        setTargetAnchor(location.anchor);
      } catch (err) {
        console.error("Failed to open location in book:", location.bookId, err);
      }
    },
    [bookMeta, openChapter, loads]
  );

  return {
    vaultPath,
    availableBooks,
    activeBookId,
    bookMeta,
    activeChapter,
    chapterMarkdown,
    progressPercent,
    setProgressPercent,
    highlights,
    targetAnchor,
    handleSelectBook,
    handleAddHighlight,
    openChapter,
    handleNavigateAnchor,
    navigateToCrossBookCitation,
    loadBook,
  };
}
