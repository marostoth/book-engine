import type { BookMeta, BookMetadata, ChapterMeta, SearchResult } from "./types";

/**
 * A place in the library. Every imported book names its chapters `ch-01.md`, `ch-02.md`, ...,
 * so a chapter file points at one chapter only together with its book id.
 */
export interface ReaderLocation {
  bookId: string;
  chapterFile: string;
  anchor?: string;
}

export interface ResolvedLocation {
  book: BookMeta;
  /** Undefined when the open book has no chapter with that file name; the reader then keeps its chapter. */
  chapter: ChapterMeta | undefined;
}

/** The location a search hit opens. Search covers all books, so the hit keeps its own book id. */
export function searchResultLocation(result: SearchResult): ReaderLocation {
  return { bookId: result.book_id, chapterFile: result.chapter_file, anchor: result.anchor || undefined };
}

/** The title of the book a search hit comes from, or its book id when the library does not list that book. */
export function searchResultBookTitle(result: SearchResult, books: BookMetadata[]): string {
  return books.find((book) => book.id === result.book_id)?.title || result.book_id;
}

/**
 * The book and chapter to show for `location`. The open book is used only when it is the location's book;
 * otherwise `loadBook` loads the location's own book, and a chapter file that book does not have opens its first chapter.
 */
export async function resolveLocation(
  location: ReaderLocation,
  openBook: BookMeta | null,
  loadBook: (bookId: string) => Promise<BookMeta>,
): Promise<ResolvedLocation> {
  const chapterIn = (book: BookMeta) => book.spine?.find((chapter) => chapter.file_path === location.chapterFile);
  if (openBook && openBook.book_id === location.bookId) {
    return { book: openBook, chapter: chapterIn(openBook) };
  }
  const book = await loadBook(location.bookId);
  return { book, chapter: chapterIn(book) ?? book.spine?.[0] };
}
