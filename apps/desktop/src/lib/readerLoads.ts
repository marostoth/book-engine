import type { BookMeta, ChapterMeta, HighlightItem } from "./types";

/**
 * Keeps the newest load in charge of the reader.
 *
 * A load reads from the disk, so its answer comes back a moment later. If the reader moves on while it
 * runs, the answer belongs to a chapter or a book that is no longer open. Such a late answer used to land
 * on the screen: a slow chapter one showed its text and its highlights under chapter two, and a slow book
 * left the book on screen and the book the reader picked pointing at different books, so notes and
 * highlights were saved under the wrong one (DS-07).
 *
 * Every load takes a ticket before it starts. The ticket tells the load whether it is still the newest one
 * when its answer arrives. A ticket that is not the newest is never the newest again.
 */
export interface LoadGuard {
  /** Starts a load. The check it returns is true only while this load is the newest one. */
  start(): () => boolean;
}

export function createLoadGuard(): LoadGuard {
  let newest = 0;
  return {
    start() {
      newest += 1;
      const mine = newest;
      return () => mine === newest;
    },
  };
}

/** The chapter a list of highlights was read from, as `book-id/chapter-file`. */
export function highlightsSource(bookId: string, chapterFile: string): string {
  return `${bookId}/${chapterFile}`;
}

/** The two vault reads one chapter needs. */
export interface ChapterSource {
  fetchChapter(bookId: string, chapterFile: string): Promise<string>;
  getChapterHighlights(bookId: string, chapterFile: string): Promise<HighlightItem[]>;
}

/** What a chapter load may change on the screen. */
export interface ChapterScreen {
  /** Empties the chapter: no text, no highlights, and the progress back to the top. */
  clear(): void;
  showMarkdown(markdown: string): void;
  /** The saved highlights and the chapter they were read from. A new highlight is saved only for that chapter. */
  showHighlights(items: HighlightItem[], source: string): void;
}

/** Tells the reader that something did not load. */
export type ReportError = (message: string, cause: unknown) => void;

/**
 * Loads one chapter onto the screen. The screen is emptied at once, so the words of the chapter you left
 * are never shown under the title of the chapter you opened. The text and the highlights land only while
 * this load is still the newest one.
 */
export async function loadChapterOnto(
  source: ChapterSource,
  guard: LoadGuard,
  book: BookMeta,
  chapter: ChapterMeta,
  screen: ChapterScreen,
  reportError: ReportError
): Promise<void> {
  const isNewest = guard.start();
  screen.clear();

  const text = source.fetchChapter(book.book_id, chapter.file_path).then(
    (markdown) => {
      if (isNewest()) screen.showMarkdown(markdown);
    },
    (err) => {
      if (isNewest()) reportError(`Could not load the chapter "${chapter.title}".`, err);
    }
  );

  const marks = source.getChapterHighlights(book.book_id, chapter.file_path).then(
    (saved) => {
      if (isNewest()) screen.showHighlights(saved, highlightsSource(book.book_id, chapter.file_path));
    },
    (err) => {
      if (isNewest()) reportError(`Could not load the highlights of "${chapter.title}".`, err);
    }
  );

  await Promise.all([text, marks]);
}

/** What a book load may change on the screen. */
export interface BookScreen {
  /** The book, and the chapter it opens at, or null when the book has no chapters. */
  showBook(book: BookMeta, firstChapter: ChapterMeta | null): void;
}

/**
 * Loads one book onto the screen. The book lands only while this load is still the newest one, so the book
 * on screen is always the book the reader picked last.
 */
export async function loadBookOnto(
  fetchBookMeta: (bookId: string) => Promise<BookMeta>,
  guard: LoadGuard,
  bookId: string,
  screen: BookScreen,
  reportError: ReportError
): Promise<void> {
  const isNewest = guard.start();
  try {
    const book = await fetchBookMeta(bookId);
    if (!isNewest()) return;
    screen.showBook(book, book.spine?.[0] ?? null);
  } catch (err) {
    if (isNewest()) reportError(`Could not open the book "${bookId}".`, err);
  }
}
