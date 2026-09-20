import type { BookMeta, ChapterMeta } from "./types.ts";
import { toSavedAnchor } from "./anchors.ts";

/**
 * Where you stopped reading.
 *
 * The app used to open chapter 1 of every book it loaded, and it kept the open book only in the browser storage of
 * the app window, which a release build, a new PC or a reinstall does not share (DS-11). Each book now keeps a
 * bookmark in the vault, `vault/notes/<book-id>/bookmark.json`: the chapter, and the paragraph in the middle of the
 * screen. The newest bookmark of all books names the book the app opens with.
 */

/** Where the reader stopped in one book. */
export interface Bookmark {
  chapterFile: string;
  /** The paragraph in the middle of the screen, in the saved form (`^p-012`). */
  anchor?: string;
  /** When the backend saved the bookmark (RFC 3339). */
  savedAt?: string;
}

/** The newest bookmark of all books, with the book it belongs to. */
export interface LastBookmark extends Bookmark {
  bookId: string;
}

/** One chapter of one book. */
export interface ChapterRef {
  bookId: string;
  chapterFile: string;
}

/** True when both names name the same chapter of the same book, or when both are empty. */
export function sameChapter(a: ChapterRef | null, b: ChapterRef | null): boolean {
  if (!a || !b) return a === b;
  return a.bookId === b.bookId && a.chapterFile === b.chapterFile;
}

/** The chapter a book opens at, and the paragraph to show there. */
export interface OpeningPlace {
  /** Null when the book has no chapters. */
  chapter: ChapterMeta | null;
  anchor?: string;
}

/**
 * The chapter and paragraph a book opens at: where the reader stopped. A book with no bookmark, or one that no longer
 * has the saved chapter, opens at its first chapter.
 */
export function openingPlace(book: BookMeta, bookmark: Bookmark | null): OpeningPlace {
  const saved = bookmark ? book.spine?.find((chapter) => chapter.file_path === bookmark.chapterFile) : undefined;
  if (!saved) {
    return { chapter: book.spine?.[0] ?? null };
  }
  const anchor = toSavedAnchor(bookmark?.anchor);
  return anchor ? { chapter: saved, anchor } : { chapter: saved };
}

/** The browser storage key where the app kept the open book before DS-11. It is read, never written. */
export const BROWSER_BOOK_KEY = "book_engine_active_book_id";

/** The open book that browser storage still remembers from before DS-11, or null. */
export function readBrowserBookId(storage: () => Pick<Storage, "getItem">): string | null {
  try {
    return storage().getItem(BROWSER_BOOK_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * The book the app opens with: the book of the newest bookmark, then the book browser storage remembers from before
 * DS-11, then the first book of the library. A book that is no longer in the library is passed over.
 */
export function startingBookId(
  library: readonly { id: string }[],
  last: LastBookmark | null,
  fromBrowser: string | null
): string | null {
  const inLibrary = (bookId: string | null | undefined): bookId is string =>
    !!bookId && library.some((book) => book.id === bookId);
  const readLast = last?.bookId;
  if (inLibrary(readLast)) return readLast;
  if (inLibrary(fromBrowser)) return fromBrowser;
  return library[0]?.id ?? null;
}

/** A paragraph on screen: its `data-anchor` and the top edge of its box. */
export interface ParagraphBox {
  anchor: string | null;
  top: number;
}

/**
 * The paragraph in the middle of the reader, in the saved form (`^p-012`): the lowest paragraph that starts at or above
 * the middle line, or the first paragraph when all of them start below it.
 *
 * A book reopens with this paragraph in the middle of the screen. The paragraph then still starts above the middle
 * line and the next one still starts below it, so closing and opening a book again and again keeps the same place.
 */
export function paragraphAtMiddle(paragraphs: readonly ParagraphBox[], middle: number): string | undefined {
  let above: ParagraphBox | undefined;
  let first: ParagraphBox | undefined;
  for (const paragraph of paragraphs) {
    if (!toSavedAnchor(paragraph.anchor)) continue;
    if (!first || paragraph.top < first.top) first = paragraph;
    if (paragraph.top <= middle && (!above || paragraph.top >= above.top)) above = paragraph;
  }
  return toSavedAnchor((above ?? first)?.anchor);
}

/** Reports where the reader is, once the reader stops moving. */
export interface PlaceWatcher {
  /** The words of `place` are on screen now, or of no chapter (`null`). */
  shown(place: ChapterRef | null): void;
  /** The reader scrolled. The place is reported when `delayMs` pass without another move. */
  moved(): void;
  /**
   * Reports now the place that is waiting, if one is, and gives back that save.
   *
   * The reader calls it when it closes, and the window waits for what comes back before it closes (DS-17).
   */
  flush(): Promise<void>;
}

/**
 * Watches the reader and reports its place `delayMs` after the last move, so a long scroll makes one save.
 *
 * `readAnchor` reads the paragraph in the middle of the screen at the moment of the report. The report names the
 * chapter whose words were on screen then (`shown`), not a chapter picked since: the words of the chapter you left
 * stay on screen until the next chapter's words arrive, and a paragraph read from them belongs to the chapter you left.
 */
export function createPlaceWatcher(
  delayMs: number,
  readAnchor: () => string | undefined,
  report: (place: ChapterRef, anchor: string | undefined) => unknown
): PlaceWatcher {
  let onScreen: ChapterRef | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const reportNow = (): unknown => {
    timer = null;
    return onScreen ? report(onScreen, readAnchor()) : undefined;
  };

  return {
    shown(place) {
      onScreen = place;
    },
    moved() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(reportNow, delayMs);
    },
    async flush() {
      if (timer === null) return;
      clearTimeout(timer);
      await reportNow();
    },
  };
}

/** Saves bookmarks, and never over a bookmark that could not be read. */
export interface BookmarkKeeper {
  /** A book opened. `bookmarkRead` is false when its bookmark could not be read. */
  bookOpened(bookId: string, bookmarkRead: boolean): void;
  /** Saves where the reader is, and gives back that save so the window can wait for it (DS-17). */
  save(place: ChapterRef, anchor: string | undefined): Promise<void>;
}

/**
 * Saves where the reader is through `persist`. The bookmark of a book that could not be read is left alone for as long
 * as that book stays unreadable, because a save would write over it: the reader was told once, when the book opened.
 */
export function createBookmarkKeeper(
  persist: (bookId: string, chapterFile: string, anchor?: string) => Promise<void>,
  reportError: (action: string, cause: unknown) => void
): BookmarkKeeper {
  const unreadable = new Set<string>();
  return {
    bookOpened(bookId, bookmarkRead) {
      if (bookmarkRead) unreadable.delete(bookId);
      else unreadable.add(bookId);
    },
    save(place, anchor) {
      if (unreadable.has(place.bookId)) return Promise.resolve();
      return persist(place.bookId, place.chapterFile, anchor).catch((err) =>
        reportError("Where you stopped reading was not saved.", err)
      );
    },
  };
}
