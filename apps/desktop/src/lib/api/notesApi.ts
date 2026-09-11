import { ChapterNoteFile, AggregatedNoteItem } from "../types";
import { isTauri, tauriInvoke } from "./clientBase";
import { getFallbackBookNoteFiles } from "./fallbackNotes";
import { FALLBACK_META } from "./mockData";

export async function fetchAllBookNotes(bookId: string): Promise<ChapterNoteFile[]> {
  if (isTauri) {
    try {
      return await tauriInvoke<ChapterNoteFile[]>("load_all_book_notes", { bookId });
    } catch (e) {
      console.warn("Tauri load_all_book_notes failed, falling back:", e);
    }
  }
  return getFallbackBookNoteFiles(bookId);
}

export async function exportSummary(bookId: string, content: string): Promise<string> {
  if (isTauri) {
    try {
      return await tauriInvoke<string>("export_summary", { bookId, content });
    } catch (e) {
      console.warn("Tauri export_summary failed, falling back:", e);
    }
  }
  localStorage.setItem(`summary_export_${bookId}`, content);
  return `vault/notes/${bookId}/summary-export.md`;
}

async function loadBookMeta(bookId: string) {
  if (isTauri) {
    try {
      const json = await tauriInvoke<string>("load_book_meta", { bookId });
      return JSON.parse(json);
    } catch {
      // fallback
    }
  }
  return FALLBACK_META;
}

export async function getAllBookNotes(bookId: string): Promise<AggregatedNoteItem[]> {
  if (isTauri) {
    try {
      return await tauriInvoke<AggregatedNoteItem[]>("get_all_book_notes", { bookId });
    } catch (e) {
      console.warn("Tauri get_all_book_notes failed, falling back to client aggregation:", e);
    }
  }

  const files = await fetchAllBookNotes(bookId);
  const { aggregateBookNotes } = await import("../notesAggregator");
  const meta = await loadBookMeta(bookId);
  const entries = aggregateBookNotes(meta, files);
  return entries.map((e) => ({
    id: e.id,
    item_type: e.type,
    chapter_file: e.chapterFile,
    chapter_title: e.chapterTitle,
    chapter_order: e.chapterOrder,
    anchor: e.anchor || null,
    text: e.text,
    color: e.color || null,
    section_heading: e.sectionHeading || null,
    created_at: e.createdAt || null,
  }));
}

export async function exportBookSummary(bookId: string): Promise<string> {
  if (isTauri) {
    try {
      return await tauriInvoke<string>("export_book_summary", { bookId });
    } catch (e) {
      console.warn("Tauri export_book_summary failed, falling back to client export:", e);
    }
  }

  const files = await fetchAllBookNotes(bookId);
  const { aggregateBookNotes, generateSummaryMarkdown } = await import("../notesAggregator");
  const meta = await loadBookMeta(bookId);
  const entries = aggregateBookNotes(meta, files);
  const md = generateSummaryMarkdown(meta, entries);
  localStorage.setItem(`summary_export_${bookId}`, md);
  return `vault/notes/${bookId}/summary-export.md`;
}
