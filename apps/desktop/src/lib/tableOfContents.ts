import type { ChapterMeta, TOCItem } from "./types";

/** Where an entry of the contents opens: a chapter, and the paragraph where the entry starts inside it. */
export interface ContentsTarget {
  chapter: ChapterMeta;
  /** The saved form of a paragraph anchor (`^p-012`), or undefined for the top of the chapter. */
  anchor?: string;
}

/**
 * The place that an entry of the contents opens (CQ-01). The import writes into each entry the chapter file that holds
 * it (`href`) and the paragraph where it starts (`anchor`). Titles are never compared, because chapters can share a
 * title: every book of The Wealth of Nations starts again at "CHAPTER I.", and the sidebar opened Book I for all of them.
 *
 * An entry that names no chapter file of the book, such as a part with no page of its own, opens its first sub-entry
 * that names one. Otherwise it opens nothing.
 */
export function contentsTarget(item: TOCItem, spine: ChapterMeta[]): ContentsTarget | null {
  const chapter = spine.find((ch) => ch.file_path === item.href);
  if (chapter) {
    return { chapter, anchor: item.anchor ?? undefined };
  }
  for (const sub of item.subitems ?? []) {
    const target = contentsTarget(sub, spine);
    if (target) return target;
  }
  return null;
}

/**
 * True when an entry of the contents opens a chapter. The contents of a book imported before CQ-01 name the source
 * documents of the EPUB, which the vault does not have, so the sidebar shows the chapter list of that book instead.
 */
export function contentsOpenChapters(toc: TOCItem[], spine: ChapterMeta[]): boolean {
  return toc.some((item) => contentsTarget(item, spine) !== null);
}
