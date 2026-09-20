import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  indexVault,
  getChapterHighlights,
  saveChapterHighlights,
  recordReadingProgress,
  getVaultPath,
  fetchBookmark,
  fetchLastBookmark,
  persistBookmark,
} from "../lib/api";
import { reportBackendError } from "../lib/backendErrors";
import { ReaderLocation, resolveLocation } from "../lib/readerLocation";
import { createLoadGuard, loadBookOnto, loadChapterOnto } from "../lib/readerLoads";
import { rescanLibrary, rescanSummary, type LibraryRescanControl } from "../lib/libraryRescan";
import { updateSearch } from "../lib/searchIndex";
import { createBookmarkKeeper, readBrowserBookId, startingBookId, type ChapterRef } from "../lib/readingPlace";
import { createReadingTimer, READING_TICK_MS } from "../lib/readingTime";
import { ChapterMoveRequest } from "./useChapterGate";
import { useSaveBeforeClose } from "./useSaveBeforeClose";

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
  // The open book. It is picked once the library loads: the book of the newest bookmark in the vault (DS-11).
  const [activeBookId, setActiveBookId] = useState<string>("");

  const [bookMeta, setBookMeta] = useState<BookMeta | null>(null);
  const [activeChapter, setActiveChapter] = useState<ChapterMeta | null>(null);
  const [chapterMarkdown, setChapterMarkdown] = useState<string>("");
  // The chapter whose words `chapterMarkdown` holds. A place is saved only for the words on screen (DS-11).
  const [markdownSource, setMarkdownSource] = useState<ChapterRef | null>(null);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [targetAnchor, setTargetAnchor] = useState<string | undefined>();
  // The chapter ("book/file") whose highlights are shown. It is null while they load and after a failed load.
  // A new highlight is saved only for this chapter: a save with highlights that did not load would erase the saved ones.
  const [highlightsChapter, setHighlightsChapter] = useState<string | null>(null);

  // One reader, one newest load. A book or a chapter that answers after the reader moved on changes
  // nothing, so the words of the chapter you left are never shown under the chapter you opened (DS-07).
  const [loads] = useState(createLoadGuard);

  // Where you stopped reading is saved in the vault, one bookmark per book, and never over a bookmark that could not
  // be read (DS-11).
  const [bookmarks] = useState(() => createBookmarkKeeper(persistBookmark, reportBackendError));

  // Load canonical vault path on mount
  useEffect(() => {
    getVaultPath()
      .then(setVaultPath)
      .catch((err) => reportBackendError("Could not find the vault folder, so book images may not show.", err));
  }, []);

  const loadBook = useCallback(
    async (bookId: string) => {
      await loadBookOnto({ fetchBookMeta, fetchBookmark }, loads, bookId, {
        // The book opens where the reader stopped, not at chapter 1 (DS-11).
        showBook: (meta, opening, bookmarkRead) => {
          bookmarks.bookOpened(meta.book_id, bookmarkRead);
          setBookMeta(meta);
          if (opening.chapter) {
            setActiveChapter(opening.chapter);
            setTargetAnchor(opening.anchor);
          }
          onCardsRefreshNeeded?.(bookId);
        },
      }, reportBackendError);
    },
    [loads, bookmarks, onCardsRefreshNeeded]
  );

  // Discover the library and open the book the reader read last: the book of the newest bookmark in the vault.
  // Browser storage is read only for the open book an older version of the app remembered there (DS-11).
  useEffect(() => {
    const lastPlace = fetchLastBookmark().catch((err) => {
      reportBackendError("Could not find the book you read last, so the app opens your first book.", err);
      return null;
    });
    fetchLibraryBooks()
      .then(async (books) => {
        setAvailableBooks(books);
        const targetId = startingBookId(books, await lastPlace, readBrowserBookId(() => window.localStorage));
        if (!targetId) return;

        setActiveBookId(targetId);
        loadBook(targetId);
      })
      .catch((err) => reportBackendError("Could not load your library.", err));
  }, [loadBook]);

  // Search is brought up to date when the app opens, and a file it could not read shows in the error bar (SI-02). The
  // ref keeps it to one run when React runs this effect twice in a dev build.
  const searchStarted = useRef(false);
  useEffect(() => {
    if (searchStarted.current) return;
    searchStarted.current = true;
    void updateSearch(indexVault, reportBackendError);
  }, []);

  const handleSelectBook = (bookId: string) => {
    setActiveBookId(bookId);
    loadBook(bookId);
  };

  // A book imported while the app is open shows after "Rescan library": the library is read again, and search is
  // updated (DS-13).
  const [rescanRunning, setRescanRunning] = useState(false);
  const [rescanNote, setRescanNote] = useState("");
  const runLibraryRescan = useCallback(async () => {
    setRescanRunning(true);
    try {
      const result = await rescanLibrary(
        { fetchLibraryBooks, indexVault },
        availableBooks,
        setAvailableBooks,
        reportBackendError
      );
      setRescanNote(rescanSummary(result));
    } finally {
      setRescanRunning(false);
    }
  }, [availableBooks]);
  const libraryRescan = useMemo<LibraryRescanControl>(
    () => ({ run: () => void runLibraryRescan(), running: rescanRunning, note: rescanNote }),
    [runLibraryRescan, rescanRunning, rescanNote]
  );

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
          setMarkdownSource(null);
          setProgressPercent(0);
          setHighlights([]);
          setHighlightsChapter(null);
        },
        showMarkdown: (markdown, source) => {
          setChapterMarkdown(markdown);
          setMarkdownSource(source);
        },
        showHighlights: (items, source) => {
          setHighlights(items);
          setHighlightsChapter(source);
        },
      },
      reportBackendError
    );
  }, [bookMeta, activeChapter, loads]);

  // Reading time counts while the words of a chapter are on screen and the window has focus. A scroll only tells the
  // timer how far down the chapter you are, so it never starts the count again. The app cannot see how many words you
  // read, so no word count is saved (AN-01).
  const [readingTimer] = useState(() =>
    createReadingTimer((chapter, piece) =>
      recordReadingProgress(chapter.bookId, chapter.chapterFile, piece.seconds, piece.completed).catch(
        reportReadingTimeError
      )
    )
  );
  useEffect(() => {
    void readingTimer.show(markdownSource, Date.now(), document.hasFocus());
  }, [readingTimer, markdownSource]);
  useEffect(() => {
    const ticks = setInterval(() => readingTimer.tick(Date.now(), document.hasFocus()), READING_TICK_MS);
    return () => {
      clearInterval(ticks);
      void readingTimer.show(null, Date.now(), document.hasFocus());
    };
  }, [readingTimer]);
  // The reading session in hand is written down in that clean-up only, and a window that closes runs no clean-up.
  // Taking the chapter off the screen is what saves the time, so the window waits for it (DS-17).
  useSaveBeforeClose(() => readingTimer.show(null, Date.now(), document.hasFocus()));

  /** The reader scrolled: the progress bar moves, and the reading timer learns how far down the chapter on screen you are. */
  const handleProgressChange = useCallback(
    (percent: number, chapter: ChapterRef | null) => {
      setProgressPercent(percent);
      readingTimer.scrolled(chapter, percent);
    },
    [readingTimer]
  );

  // Made once for the chapter on screen, because the reader is drawn again only for new props of its own (RD-06).
  const handleAddHighlight = useCallback(
    (newHighlight: HighlightItem) => {
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
    },
    [bookMeta, activeChapter, highlightsChapter, highlights]
  );

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

  /** Saves where the reader stopped, once the reader stops scrolling: the chapter on screen and its middle paragraph. */
  const handlePlaceSettled = useCallback(
    (place: ChapterRef, anchor: string | undefined) => bookmarks.save(place, anchor),
    [bookmarks]
  );

  return {
    vaultPath,
    availableBooks,
    libraryRescan,
    activeBookId,
    bookMeta,
    activeChapter,
    chapterMarkdown,
    markdownSource,
    handlePlaceSettled,
    progressPercent,
    handleProgressChange,
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
