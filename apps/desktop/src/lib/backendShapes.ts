import type { BookMeta, ChapterMeta, HighlightItem, VocabularyEntry } from "./types.ts";

/**
 * Checks what comes in from outside the app window before the app believes it (RD-09).
 *
 * A `JSON.parse` result and a backend answer both arrive as `any`, and a cast such as `JSON.parse(json) as BookMeta`
 * only tells the type checker to stop asking. Nothing is checked at run time, so a book whose `spine` is missing
 * reaches the reader as `undefined` and the failure appears far away, as `Cannot read properties of undefined`
 * somewhere in the chapter list, with no hint of which file is wrong.
 *
 * These checks ask only for what the app truly reads. A field the app never uses is left alone, so a book from an
 * older import still opens.
 */

/** Whether a value is an object with named fields. `null` and an array are not. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** What is wrong with a value, for a message the reader can act on. */
class ShapeError extends Error {}

function need(ok: boolean, what: string): void {
  if (!ok) throw new ShapeError(what);
}

/**
 * One chapter of a book.
 *
 * `order`, `word_count`, `anchor_count` and `footnotes_count` are counted, not read for their own sake, so a chapter
 * that is missing one of them gets a zero instead of stopping the whole book from opening.
 */
function chapterFrom(value: unknown, where: string): ChapterMeta {
  need(isRecord(value), `${where} is not an object`);
  const raw = value as Record<string, unknown>;
  need(isText(raw.id), `${where} has no id`);
  need(isText(raw.title), `${where} has no title`);
  need(isText(raw.file_path), `${where} has no file_path`);
  return {
    ...raw,
    id: raw.id as string,
    title: raw.title as string,
    file_path: raw.file_path as string,
    order: isCount(raw.order) ? raw.order : 0,
    word_count: isCount(raw.word_count) ? raw.word_count : 0,
    anchor_count: isCount(raw.anchor_count) ? raw.anchor_count : 0,
    footnotes_count: isCount(raw.footnotes_count) ? raw.footnotes_count : 0,
  } as ChapterMeta;
}

/**
 * The metadata of one book, from the text the backend sends.
 *
 * Rejects with the name of the first field that is wrong. The reader then sees one sentence in the error bar instead
 * of an empty screen.
 */
export function bookMetaFrom(json: string, bookId?: string): BookMeta {
  const named = bookId ? `The book file of ${bookId}` : "The book file";
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (cause) {
    throw new Error(`${named} is not readable JSON.`, { cause });
  }

  try {
    need(isRecord(parsed), "it is not an object");
    const raw = parsed as Record<string, unknown>;
    need(isText(raw.book_id), "it has no book_id");
    need(isText(raw.title), "it has no title");
    need(Array.isArray(raw.spine), "it has no spine, so it has no chapters");
    const spine = (raw.spine as unknown[]).map((chapter, index) => chapterFrom(chapter, `chapter ${index + 1}`));
    return {
      ...raw,
      book_id: raw.book_id as string,
      title: raw.title as string,
      author: isText(raw.author) ? raw.author : "Unknown author",
      language: isText(raw.language) ? raw.language : "en",
      total_words: isCount(raw.total_words) ? raw.total_words : 0,
      total_chapters: isCount(raw.total_chapters) ? raw.total_chapters : spine.length,
      toc: Array.isArray(raw.toc) ? (raw.toc as BookMeta["toc"]) : [],
      spine,
    } as BookMeta;
  } catch (cause) {
    const why = cause instanceof ShapeError ? cause.message : String(cause);
    throw new Error(`${named} cannot be read: ${why}.`, { cause });
  }
}

/** Whether one saved highlight holds everything the reader needs to draw it again. */
export function isHighlight(value: unknown): value is HighlightItem {
  if (!isRecord(value)) return false;
  return (
    isText(value.id) &&
    isText(value.exact) &&
    isText(value.prefix) &&
    isText(value.suffix) &&
    isText(value.createdAt)
  );
}

/**
 * The saved highlights of a chapter, from a value that may be anything.
 *
 * Rejects the whole list when one entry is wrong, and never drops the entry (TL-14). The list on screen is what the
 * next highlight saves, over the file, so an entry dropped here was erased from the vault by the next highlight the
 * reader made. A rejected list does not land on the screen, and the reader cannot add a highlight to a chapter whose
 * highlights did not load. The backend reads the file the same way: one damaged entry, and it sends none.
 *
 * In the app an entry is wrong only when the Rust and TypeScript names of a field drift apart, and then every entry is
 * wrong, so dropping them lost every highlight of the chapter. `seamContract.json` catches that drift in the tests.
 */
export function highlightsFrom(value: unknown, where: string): HighlightItem[] {
  if (!Array.isArray(value)) throw new Error(`${where} are not a list.`);
  const damaged = value.filter((entry) => !isHighlight(entry)).length;
  if (damaged > 0) {
    throw new Error(`${where}: ${damaged} of ${value.length} saved highlights cannot be read, so none are shown.`);
  }
  return value as HighlightItem[];
}

/**
 * The highlights of a list that is only read and never saved again, such as the old comment in a notes file.
 *
 * A damaged entry is dropped and the rest are kept, because no save can erase what is dropped here, and one bad entry
 * must not lose the reader every other highlight on show (RD-09). The count goes to the console.
 */
export function readableHighlightsFrom(value: unknown, where: string): HighlightItem[] {
  if (!Array.isArray(value)) return [];
  const good = value.filter(isHighlight);
  if (good.length !== value.length) {
    console.warn(`${where}: ${value.length - good.length} of ${value.length} saved highlights are damaged.`);
  }
  return good;
}

/**
 * One saved vocabulary word.
 *
 * Only the word itself is needed. The meaning, the chapter, the paragraph and the time may all be empty: a word
 * saved by an older version of the app has no chapter and no anchor, and dropping it would lose the reader a word
 * they really saved (RD-04, RD-10).
 */
function wordFrom(value: unknown): VocabularyEntry | null {
  if (!isRecord(value)) return null;
  const word = isText(value.word) ? value.word.trim() : "";
  if (!word) return null;

  return {
    word,
    definition: isText(value.definition) ? value.definition : "",
    chapterFile: isText(value.chapterFile) ? value.chapterFile : "",
    anchor: isText(value.anchor) ? value.anchor : "",
    savedAt: isText(value.savedAt) ? value.savedAt : "",
  };
}

/**
 * The saved words of a book, from a value that may be anything.
 *
 * A damaged word is dropped and the rest are kept, the same way one damaged highlight does not lose the reader
 * the whole chapter. The count of dropped words goes to the console, so the loss is never silent.
 */
export function vocabularyFrom(value: unknown, where: string): VocabularyEntry[] {
  if (!Array.isArray(value)) return [];
  const good = value.map(wordFrom).filter((word): word is VocabularyEntry => word !== null);
  if (good.length !== value.length) {
    console.warn(`${where}: ${value.length - good.length} of ${value.length} saved words are damaged.`);
  }
  return good;
}
