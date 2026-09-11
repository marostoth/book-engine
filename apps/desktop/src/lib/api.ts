import {
  BookMeta,
  BookMetadata,
  BookSummary,
  SearchResult,
} from "./types";
import { isTauri, tauriInvoke } from "./api/clientBase";
import {
  FALLBACK_META,
  FALLBACK_CHAPTERS,
  fallbackSearchVault,
} from "./api/mockData";

export * from "./api/practiceApi";
export * from "./api/notesApi";
export * from "./api/analyticsApi";
export { isTauri, tauriInvoke } from "./api/clientBase";

export async function fetchLibraryBooks(): Promise<BookMetadata[]> {
  if (isTauri) {
    try {
      return await tauriInvoke<BookMetadata[]>("get_library_books");
    } catch (e) {
      console.warn("Tauri get_library_books failed, trying list_books fallback:", e);
      try {
        const summaries = await tauriInvoke<BookSummary[]>("list_books");
        return summaries.map((s) => ({
          id: s.book_id,
          title: s.title,
          author: s.author,
          chapter_count: s.total_chapters,
          total_words: s.total_words,
        }));
      } catch (e2) {
        console.warn("Tauri list_books failed, falling back to mock:", e2);
      }
    }
  }

  return [
    {
      id: "sample",
      title: "Principles of Distributed Systems",
      author: "Leslie Lamport & Friends",
      chapter_count: 2,
      total_words: 458,
    },
    {
      id: "wealth-of-nations",
      title: "An Inquiry into the Nature and Causes of the Wealth of Nations",
      author: "Adam Smith",
      chapter_count: 37,
      total_words: 387438,
    },
  ];
}

export async function fetchAvailableBooks(): Promise<BookSummary[]> {
  const lib = await fetchLibraryBooks();
  return lib.map((b) => ({
    book_id: b.id,
    title: b.title,
    author: b.author,
    total_chapters: b.chapter_count,
    total_words: b.total_words,
  }));
}

export async function fetchBookMeta(bookId: string): Promise<BookMeta> {
  if (isTauri) {
    try {
      const json = await tauriInvoke<string>("load_book_meta", { bookId });
      return JSON.parse(json);
    } catch (e) {
      console.warn("Tauri load_book_meta failed, falling back:", e);
    }
  }
  return FALLBACK_META;
}

export async function fetchChapter(bookId: string, chapterFile: string): Promise<string> {
  if (isTauri) {
    try {
      if (!cachedVaultPath) {
        getVaultPath().catch(() => {});
      }
      return await tauriInvoke<string>("load_chapter", { bookId, chapterFile });
    } catch (e) {
      console.warn("Tauri load_chapter failed, falling back:", e);
    }
  }
  return FALLBACK_CHAPTERS[chapterFile] || FALLBACK_CHAPTERS["ch-01.md"];
}

export async function fetchNotes(bookId: string, notesFile: string): Promise<string> {
  if (isTauri) {
    try {
      return await tauriInvoke<string>("load_notes", { bookId, notesFile });
    } catch (e) {
      console.warn("Tauri load_notes failed, falling back:", e);
    }
  }
  const stored = localStorage.getItem(`notes_${bookId}_${notesFile}`);
  if (stored) return stored;
  return `# Reflections: ${bookId}\n\n## Key Takeaways\n\n- Linearizability creates the illusion of single-copy atomic operations.\n- Vector clocks track partial ordering without global wall clocks.\n\n## Questions\n\n- How does Raft handle network partitions during leader election?\n`;
}

export async function persistNotes(bookId: string, notesFile: string, content: string): Promise<void> {
  if (isTauri) {
    try {
      await tauriInvoke<void>("save_notes", { bookId, notesFile, content });
      return;
    } catch (e) {
      console.warn("Tauri save_notes failed, falling back to localStorage:", e);
    }
  }
  localStorage.setItem(`notes_${bookId}_${notesFile}`, content);
}

export async function searchVault(query: string): Promise<SearchResult[]> {
  if (isTauri) {
    try {
      return await tauriInvoke<SearchResult[]>("search_vault", { query });
    } catch (e) {
      console.warn("Tauri search_vault failed, falling back:", e);
    }
  }
  return fallbackSearchVault(query);
}

export async function indexVault(): Promise<{ chapters_indexed: number; paragraphs_indexed: number }> {
  if (isTauri) {
    try {
      return await tauriInvoke("index_vault");
    } catch (e) {
      console.warn("Tauri index_vault failed:", e);
    }
  }
  return { chapters_indexed: 2, paragraphs_indexed: 20 };
}

let cachedVaultPath: string | null = null;

export async function getVaultPath(): Promise<string> {
  if (cachedVaultPath) return cachedVaultPath;
  if (isTauri) {
    try {
      cachedVaultPath = await tauriInvoke<string>("get_vault_path");
      return cachedVaultPath;
    } catch (e) {
      console.warn("Failed to retrieve vault path from backend:", e);
    }
  }
  return "";
}

export function resolveAssetUrl(bookId: string, src: string, vaultPath?: string): string {
  if (!src || /^(?:https?|asset|data|blob):/i.test(src)) {
    return src;
  }

  const vPath = vaultPath || cachedVaultPath;
  if (!isTauri || !vPath) {
    return src;
  }

  const filename = src.split("/").pop()?.split("\\").pop() || src;
  const cleanVault = vPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const fullPath = `${cleanVault}/books/${bookId}/assets/${filename}`;

  if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__?.convertFileSrc) {
    return (window as any).__TAURI_INTERNALS__.convertFileSrc(fullPath, "asset");
  }

  return src;
}
