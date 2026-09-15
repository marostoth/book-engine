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
import { reportBackendError } from "../lib/backendErrors";
import { ReaderLocation, resolveLocation } from "../lib/readerLocation";
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
  // The notes file ("book/file") whose highlights are shown. It is null while they load and after a failed load.
  // A new highlight is saved only into this file: a save with highlights that did not load would erase the saved ones.
  const [highlightsFile, setHighlightsFile] = useState<string | null>(null);

  // Load canonical vault path on mount
  useEffect(() => {
    getVaultPath()
      .then(setVaultPath)
      .catch((err) => reportBackendError("Could not find the vault folder, so book images may not show.", err));
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
        reportBackendError(`Could not open the book "${bookId}".`, err);
      }
    },
    [onCardsRefreshNeeded]
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

    fetchChapter(bookMeta.book_id, activeChapter.file_path)
      .then((md) => {
        setChapterMarkdown(md);
        setProgressPercent(0);
      })
      .catch((err) => {
        setChapterMarkdown("");
        reportBackendError(`Could not load the chapter "${activeChapter.title}".`, err);
      });

    const notesFile = activeChapter.file_path.replace(".md", "-notes.md");
    const highlightsSource = `${bookMeta.book_id}/${notesFile}`;
    setHighlightsFile(null);
    fetchNotes(bookMeta.book_id, notesFile)
      .then((notesContent) => {
        const parsedHighlights = parseHighlightsFromNotes(notesContent);
        setHighlights(parsedHighlights);
        setHighlightsFile(highlightsSource);
      })
      .catch((err) => {
        setHighlights([]);
        reportBackendError(`Could not load the highlights of "${activeChapter.title}".`, err);
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

    const notesFile = activeChapter.file_path.replace(".md", "-notes.md");
    if (highlightsFile !== `${bookMeta.book_id}/${notesFile}`) {
      reportBackendError(
        "The highlight was not saved.",
        "The saved highlights of this chapter did not load, and a save now would erase them. Open the chapter again."
      );
      return;
    }

    const updated = [...highlights, newHighlight];
    setHighlights(updated);

    fetchNotes(bookMeta.book_id, notesFile)
      .then((currentNotes) => {
        const updatedNotes = serializeHighlightsToNotes(currentNotes, updated);
        return persistNotes(bookMeta.book_id, notesFile, updatedNotes);
      })
      .catch((err) => reportBackendError("The highlight was not saved.", err));
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
      try {
        const target = await resolveLocation(location, bookMeta, fetchBookMeta);
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
    [bookMeta, openChapter]
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
