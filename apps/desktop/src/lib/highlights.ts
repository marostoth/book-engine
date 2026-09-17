import type { JSONContent } from "@tiptap/core";
import type { HighlightItem } from "./types";
// The .ts extension lets the Node test runner load this module (highlights.test.ts).
import { toAnchorAttribute } from "./anchors.ts";

const PREFIX_SUFFIX_LEN = 32;

/** Start of the comment older chapters keep their highlights in. */
const COMMENT_START = "<!-- highlights-json";

/**
 * Extracts a W3C Text Quote Selector from the current window selection.
 */
export function createW3CHighlight(
  selection: Selection,
  anchor?: string,
  color: string = "yellow"
): HighlightItem | null {
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const exact = range.toString().trim();
  if (!exact) return null;

  // Find container paragraph or block
  let blockEl: HTMLElement | null = range.commonAncestorContainer as HTMLElement;
  if (blockEl.nodeType === Node.TEXT_NODE) {
    blockEl = blockEl.parentElement;
  }
  const parentPara = blockEl?.closest("p") || blockEl;
  const fullBlockText = parentPara?.textContent || "";

  // Locate exact text within block
  const exactIndex = fullBlockText.indexOf(exact);
  let prefix = "";
  let suffix = "";

  if (exactIndex !== -1) {
    const prefixStart = Math.max(0, exactIndex - PREFIX_SUFFIX_LEN);
    prefix = fullBlockText.slice(prefixStart, exactIndex);

    const suffixEnd = Math.min(fullBlockText.length, exactIndex + exact.length + PREFIX_SUFFIX_LEN);
    suffix = fullBlockText.slice(exactIndex + exact.length, suffixEnd);
  }

  return {
    id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    exact,
    prefix,
    suffix,
    anchor,
    color,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Parses highlights from the old comment in a chapter notes file. Highlights are saved in their
 * own file now (DS-05); this only reads a chapter that was not moved over yet.
 */
export function parseHighlightsFromNotes(notesContent: string): HighlightItem[] {
  const marker = notesContent.indexOf(COMMENT_START);
  if (marker === -1) return [];

  // Read from the `[` that opens the list to the `]` that closes it, not to the first `-->`.
  // A saved quote may hold `-->`, and stopping there lost every highlight of the chapter (DS-06).
  const body = notesContent.slice(marker + COMMENT_START.length);
  const open = body.length - body.trimStart().length;
  if (body[open] !== "[") return [];
  const close = jsonArrayEnd(body.slice(open));
  if (close === -1) return [];

  try {
    const parsed = JSON.parse(body.slice(open, open + close + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("Failed to parse highlights-json block:", e);
    return [];
  }
}

/**
 * The index of the `]` that closes the JSON list at the start of `text`, or -1.
 * Brackets inside a quoted string, and a character after a backslash, do not count.
 */
function jsonArrayEnd(text: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const ch = text[index];
    if (escaped) {
      escaped = false;
    } else if (inString && ch === "\\") {
      escaped = true;
    } else if (ch === '"') {
      inString = !inString;
    } else if (!inString && ch === "[") {
      depth++;
    } else if (!inString && ch === "]") {
      depth--;
      if (depth === 0) return index;
      if (depth < 0) return -1;
    }
  }
  return -1;
}

/** Text of one paragraph of the chapter and the anchor of the nearest block at or above it. */
export interface ParagraphCandidate {
  anchor: string | null;
  text: string;
}

/**
 * Picks the paragraph for a highlight: the first paragraph with the highlight's anchor that still
 * contains the quote, otherwise the first paragraph that contains the quote. Returns -1 when no
 * paragraph contains it. The saved anchor (`^p-001`) and the HTML attribute (`p-001`) are
 * compared in one form. A list, a table or a quote is one block with one anchor and a paragraph
 * in each item, cell or line (RD-03).
 */
export function findHighlightParagraph(
  paragraphs: ParagraphCandidate[],
  highlight: Pick<HighlightItem, "exact" | "anchor">
): number {
  const normalizedExact = highlight.exact.replace(/\s+/g, " ");
  // Exact match, or fuzzy recovery with relaxed whitespace
  const containsQuote = (text: string) =>
    text.includes(highlight.exact) || text.replace(/\s+/g, " ").includes(normalizedExact);

  const anchor = toAnchorAttribute(highlight.anchor);
  if (anchor) {
    const anchored = paragraphs.findIndex((p) => toAnchorAttribute(p.anchor) === anchor && containsQuote(p.text));
    if (anchored !== -1) {
      return anchored;
    }
  }
  // No anchor, or the anchored paragraph was edited: scan all paragraphs
  return paragraphs.findIndex((p) => containsQuote(p.text));
}

/**
 * Puts a highlight mark on the text of each highlight in a chapter document. The reader shows a document since RD-03,
 * and this does what the HTML version did: the mark goes on the first piece of text in the paragraph from
 * `findHighlightParagraph` that holds the whole quote, or in the whole chapter when no paragraph holds it. A quote
 * that runs over bold text, a footnote marker or two list items finds no such piece and gets no mark (RD-02).
 */
export function applyHighlightsToDoc(doc: JSONContent, highlights: HighlightItem[]): JSONContent {
  if (!highlights.length) return doc;

  const marked: JSONContent = structuredClone(doc);
  const paragraphs = paragraphsOf(marked, null);
  const candidates: ParagraphCandidate[] = paragraphs.map(({ node, anchor }) => ({ anchor, text: textOf(node) }));

  for (const hl of highlights) {
    const index = findHighlightParagraph(candidates, hl);
    if (index !== -1) {
      markFirstText(paragraphs[index].node, hl);
    } else if (textOf(marked).includes(hl.exact)) {
      // Global fallback search
      markFirstText(marked, hl);
    }
  }

  return marked;
}

/** Every paragraph of `node`, in order, with the anchor of the nearest block at or above it. */
function paragraphsOf(
  node: JSONContent,
  anchor: string | null,
  found: { node: JSONContent; anchor: string | null }[] = []
): { node: JSONContent; anchor: string | null }[] {
  const nearest = typeof node.attrs?.anchor === "string" ? node.attrs.anchor : anchor;
  if (node.type === "paragraph") found.push({ node, anchor: nearest });
  for (const child of node.content ?? []) paragraphsOf(child, nearest, found);
  return found;
}

/** The text that the reader shows for `node`. A footnote marker shows its number in brackets. */
function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "footnoteRef") return footnoteLabel(node);
  return (node.content ?? []).map(textOf).join("");
}

function footnoteLabel(node: JSONContent): string {
  const fnId = node.attrs?.fnId || "1";
  return `[${node.attrs?.number || fnId}]`;
}

/**
 * Marks the first text in `node` that holds the whole quote and has no highlight yet, and returns true once such text
 * is found. Text in code, and the number of a footnote marker, can hold no mark, so a quote found there shows none.
 */
function markFirstText(node: JSONContent, hl: HighlightItem): boolean {
  if (node.type === "footnoteRef") return footnoteLabel(node).includes(hl.exact);
  const children = node.content ?? [];
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    if (child.type !== "text") {
      if (markFirstText(child, hl)) return true;
      continue;
    }
    const text = child.text ?? "";
    const marks = child.marks ?? [];
    const at = text.indexOf(hl.exact);
    if (at === -1 || marks.some((mark) => mark.type === "highlight")) continue;
    if (node.type !== "codeBlock" && !marks.some((mark) => mark.type === "code")) {
      children.splice(
        index,
        1,
        ...textPieces(text.slice(0, at), marks),
        ...textPieces(hl.exact, [...marks, { type: "highlight" }]),
        ...textPieces(text.slice(at + hl.exact.length), marks)
      );
    }
    return true;
  }
  return false;
}

/** A text node with `marks`, or none for empty text. */
function textPieces(text: string, marks: JSONContent["marks"]): JSONContent[] {
  if (!text) return [];
  return [marks && marks.length ? { type: "text", text, marks } : { type: "text", text }];
}
