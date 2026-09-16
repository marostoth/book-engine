import type { AggregatedNoteItem } from "../types.ts";
import { callBackend } from "./clientBase.ts";

/** Every highlight and note of a book, in chapter and anchor order, from `vault/notes/<book-id>/`. */
export async function getAllBookNotes(bookId: string): Promise<AggregatedNoteItem[]> {
  return callBackend<AggregatedNoteItem[]>("get_all_book_notes", { bookId }, (dev) => dev.getAllBookNotes(bookId));
}

/** Writes every highlight and note of a book to `vault/notes/<book-id>/summary-export.md`, and gives that path. */
export async function exportBookSummary(bookId: string): Promise<string> {
  return callBackend<string>("export_book_summary", { bookId }, (dev) => dev.exportBookSummary(bookId));
}
