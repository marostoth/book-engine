import type {
  BookMeta,
  BookMetadata,
  BookSummary,
  IndexSummary,
  SearchResult,
  InspectionalBlueprint,
  ExitAssessmentPayload,
} from "./types.ts";
import { callBackend, isTauri } from "./api/clientBase.ts";

/** What the desktop app puts on `window`. A browser tab has none of it. */
interface TauriWindow {
  __TAURI_INTERNALS__?: { convertFileSrc?: (path: string, protocol: string) => string };
}

export * from "./api/practiceApi.ts";
export * from "./api/notesApi.ts";
export * from "./api/highlightsApi.ts";
export * from "./api/analyticsApi.ts";
export * from "./api/lexiconApi.ts";
export * from "./api/analyticalApi.ts";
export * from "./api/vaultApi.ts";
export * from "./api/bookmarkApi.ts";
export * from "./api/preferencesApi.ts";
export { isTauri, tauriInvoke } from "./api/clientBase.ts";

// Every function below rejects when its backend command fails: see callBackend in api/clientBase.ts.

export async function fetchLibraryBooks(): Promise<BookMetadata[]> {
  return callBackend<BookMetadata[]>("get_library_books", undefined, (dev) => dev.fetchLibraryBooks());
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
  const json = await callBackend<string>("load_book_meta", { bookId }, (dev) => dev.loadBookMetaJson());
  return JSON.parse(json);
}

export async function getInspectionalBlueprint(bookId: string): Promise<InspectionalBlueprint> {
  return callBackend<InspectionalBlueprint>("get_inspectional_blueprint", { bookId }, (dev) =>
    dev.getInspectionalBlueprint(bookId)
  );
}

/** The reader's exit assessment of a book, or null when there is none (DS-09). */
export async function getInspectionalExitAssessment(bookId: string): Promise<ExitAssessmentPayload | null> {
  return callBackend<ExitAssessmentPayload | null>("get_inspectional_exit_assessment", { bookId }, (dev) =>
    dev.getInspectionalExitAssessment(bookId)
  );
}

/** Saves the reader's exit assessment next to the book's notes, never into the book file (DS-09). */
export async function saveInspectionalExitAssessment(
  bookId: string,
  assessment: ExitAssessmentPayload
): Promise<void> {
  return callBackend<void>("save_inspectional_exit_assessment", { bookId, assessment }, (dev) =>
    dev.saveInspectionalExitAssessment(bookId, assessment)
  );
}

export async function fetchChapter(bookId: string, chapterFile: string): Promise<string> {
  if (isTauri && !cachedVaultPath) {
    // Only fills the vault path cache for book images. useBookSession shows a vault path that fails.
    getVaultPath().catch(() => {});
  }
  return callBackend<string>("load_chapter", { bookId, chapterFile }, (dev) => dev.fetchChapter(chapterFile));
}

export async function fetchNotes(bookId: string, notesFile: string): Promise<string> {
  return callBackend<string>("load_notes", { bookId, notesFile }, (dev) => dev.fetchNotes(bookId, notesFile));
}

export async function persistNotes(bookId: string, notesFile: string, content: string): Promise<void> {
  return callBackend<void>("save_notes", { bookId, notesFile, content }, (dev) =>
    dev.persistNotes(bookId, notesFile, content)
  );
}

export async function searchVault(query: string): Promise<SearchResult[]> {
  return callBackend<SearchResult[]>("search_vault", { query }, (dev) => dev.searchVault(query));
}

/** Updates the search index. The files that it could not read are in `problems` (SI-02). */
export async function indexVault(): Promise<IndexSummary> {
  return callBackend<IndexSummary>("index_vault", undefined, (dev) => dev.indexVault());
}

let cachedVaultPath: string | null = null;

export async function getVaultPath(): Promise<string> {
  if (cachedVaultPath) return cachedVaultPath;
  cachedVaultPath = await callBackend<string>("get_vault_path", undefined, (dev) => dev.getVaultPath());
  return cachedVaultPath;
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

  const insideTheApp = (window as unknown as TauriWindow).__TAURI_INTERNALS__;
  if (typeof window !== "undefined" && insideTheApp?.convertFileSrc) {
    return insideTheApp.convertFileSrc(fullPath, "asset");
  }

  return src;
}
