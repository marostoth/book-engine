import { createContext, useContext, useMemo } from "react";
import type { BookMeta, BookMetadata } from "../lib/types.ts";
import type { LibraryRescanControl } from "../lib/libraryRescan.ts";

/**
 * Which books the vault holds, which one is open, and how to switch (RD-09).
 *
 * These five travelled as six props to `TopNav`, four to `Sidebar` and three to `AppModals`, and two of the six were
 * only `bookMeta.title` and `bookMeta.author` taken apart and passed on separately.
 */
export interface Library {
  /** The book the reader has open. An empty string before the first book loads. */
  readonly activeBookId: string;
  /** Everything the open book's `_meta.json` holds, or null while it loads. */
  readonly bookMeta: BookMeta | null;
  /** Every book of the vault, for the book list. */
  readonly availableBooks: BookMetadata[];
  readonly selectBook: (bookId: string) => void;
  /** The "Rescan library" button of the book list (DS-13). */
  readonly rescan: LibraryRescanControl;
}

/** Holds the library for everything inside it. `App.tsx` builds the only provider. */
export const LibraryContext = createContext<Library | null>(null);

/**
 * The books of the vault and the one that is open.
 *
 * This throws when it is called outside the provider, on purpose. An empty book list here would show the reader
 * "no books found" while their vault is full, and nothing would look broken.
 */
export function useLibrary(): Library {
  const found = useContext(LibraryContext);
  if (!found) {
    throw new Error("useLibrary was called outside LibraryContext.Provider. App.tsx holds the only one.");
  }
  return found;
}

/**
 * Packs the library into one value for the provider.
 *
 * The value keeps the same identity until one of its five parts changes, for the same reason as `useSettingsValue`:
 * a value built fresh on each render draws every reader of the context again on every scroll (RD-06).
 */
export function useLibraryValue(parts: Library): Library {
  const { activeBookId, bookMeta, availableBooks, selectBook, rescan } = parts;
  return useMemo(
    () => ({ activeBookId, bookMeta, availableBooks, selectBook, rescan }),
    [activeBookId, bookMeta, availableBooks, selectBook, rescan]
  );
}
