import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
// The .ts extensions let the Node test runner load this module (citations.test.ts).
import { toSavedAnchor } from "./anchors.ts";
import type { VocabularyEntry } from "./types.ts";

/**
 * A saved citation says where in the book a passage is: the chapter file and the anchor of its block. The app used to
 * write `^p-001` whenever it did not know the anchor, which named the first block of the chapter, so a term, an
 * argument, a critique, an inquiry, a topic citation or a vocabulary word from a heading pointed at the wrong place
 * (RD-04). These helpers give the anchor that a passage really has, and never make one up.
 */

/** Why the app saves no citation for a passage: the chapter holds no anchor, so the app cannot say where it is. */
export const NO_ANCHOR =
  "The chapter holds no paragraph anchor, so the app cannot say where the passage is. Import the book again.";

/**
 * The anchor to cite for the document position `pos` of a chapter, in the saved form (`^p-004`), or undefined when the
 * chapter holds no anchor at all.
 *
 * Each block keeps the anchor of its block in the chapter file (`BlockAnchors`), but two blocks have none of their own:
 * - a heading, because the import gives an anchor to every block except a heading (`ingest/anchors.py`). A heading
 *   opens the text under it, so it takes the anchor of the first block under it.
 * - the second and later node of one block of the file, because only the first node keeps the anchor (`markdown.ts`).
 *   Such a node takes the anchor of the block before it, which is the first node of the same block.
 */
export function citationAnchorAt(doc: ProseMirrorNode, pos: number): string | undefined {
  if (!doc.childCount) return undefined;

  // The block that holds `pos`: the last one that starts at or before it
  let holds = 0;
  let start = 0;
  for (let index = 0; index < doc.childCount && start <= pos; index++) {
    holds = index;
    start += doc.child(index).nodeSize;
  }

  const anchorOf = (index: number) => toSavedAnchor(doc.child(index).attrs.anchor);
  const under = (): string | undefined => {
    for (let index = holds; index < doc.childCount; index++) {
      const anchor = anchorOf(index);
      if (anchor) return anchor;
    }
    return undefined;
  };
  const above = (): string | undefined => {
    for (let index = holds; index >= 0; index--) {
      const anchor = anchorOf(index);
      if (anchor) return anchor;
    }
    return undefined;
  };

  return doc.child(holds).type.name === "heading" ? under() ?? above() : above() ?? under();
}

/** Where a citation is, as the app shows it: `ch-04.md #^p-012`, or the chapter alone when the citation has no anchor. */
export function citationPlace(chapterFile: string, anchor: string): string {
  return anchor.trim() ? `${chapterFile} #${anchor.trim()}` : chapterFile;
}

/**
 * A word for the vocabulary of a book: the word as the dictionary spells it, what it means, and where it was read.
 * The chapter and the anchor are empty when the app does not know them, and never made up (RD-04).
 */
export function savedWord(
  lookedUp: string,
  found: { word?: string; definition?: string } | null,
  chapterFile: string | undefined,
  anchor: string | undefined,
  savedAt: string
): VocabularyEntry {
  return {
    word: found?.word || lookedUp.trim().toLowerCase(),
    definition: found?.definition || `Vocabulary term: ${lookedUp}`,
    chapterFile: chapterFile ?? "",
    anchor: anchor ?? "",
    savedAt,
  };
}
