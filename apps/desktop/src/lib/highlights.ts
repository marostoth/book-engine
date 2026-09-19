import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { HighlightItem } from "./types";
// The .ts extensions let the Node test runner load this module (highlights.test.ts).
import { toAnchorAttribute } from "./anchors.ts";
import { readerText } from "./readerText.ts";
import { highlightsFrom } from "./backendShapes.ts";

const PREFIX_SUFFIX_LEN = 32;

/** Start of the comment older chapters keep their highlights in. */
const COMMENT_START = "<!-- highlights-json";

const SPACE = /\s/;

/**
 * The words of a selection from `from` to `to` in a chapter document, as a W3C Text Quote Selector: the words with no
 * white space at their ends, and up to 32 characters of the chapter before and after them. The characters come from the
 * document, so the selection saves the words where it was made, also when the chapter holds them more than once, and
 * across bold text, footnote markers and blocks (RD-02). Returns null when the selection holds no words.
 */
function quoteAt(
  doc: ProseMirrorNode,
  from: number,
  to: number
): Pick<HighlightItem, "exact" | "prefix" | "suffix"> | null {
  const { text, positions } = readerText(doc);
  let start = firstIndexAtOrAfter(positions, from);
  let end = firstIndexAtOrAfter(positions, to);
  while (start < end && SPACE.test(text[start])) start++;
  while (end > start && SPACE.test(text[end - 1])) end--;
  if (start === end) return null;

  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - PREFIX_SUFFIX_LEN), start),
    suffix: text.slice(end, end + PREFIX_SUFFIX_LEN),
  };
}

/** A new highlight of the selection from `from` to `to` in a chapter document, or null when it holds no words. */
export function createHighlight(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  anchor?: string,
  color: string = "yellow"
): HighlightItem | null {
  const quote = quoteAt(doc, from, to);
  if (!quote) return null;

  return {
    id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...quote,
    anchor,
    color,
    createdAt: new Date().toISOString(),
  };
}

/** The first index whose position is `position` or after it, in positions that never go down. */
function firstIndexAtOrAfter(positions: ArrayLike<number>, position: number): number {
  let low = 0;
  let high = positions.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (positions[middle] < position) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Where a saved highlight shows in a chapter document. */
export interface HighlightRange {
  highlight: HighlightItem;
  from: number;
  to: number;
}

/** The text of a chapter with no white space, where the reader looks for saved words. */
interface SearchText {
  /** Each character of the chapter text that is not white space. */
  characters: string;
  /** The document position of each character in `characters`. */
  positions: Int32Array;
  /** The document range of each block with an anchor, by its anchor in the attribute form (`p-001`). */
  anchoredBlocks: Map<string, [number, number][]>;
}

const searchTexts = new WeakMap<ProseMirrorNode, SearchText>();

/** True for the character at `index` when `/\s/` matches it. The check of each ASCII code is quicker. */
function isSpace(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  if (code < 128) return code === 32 || (code >= 9 && code <= 13);
  return SPACE.test(text[index]);
}

function searchTextOf(doc: ProseMirrorNode): SearchText {
  const known = searchTexts.get(doc);
  if (known) return known;

  const shown = readerText(doc);
  const characters = shown.text.replace(/\s+/g, "");
  const positions = new Int32Array(characters.length);
  let count = 0;
  for (let index = 0; index < shown.text.length; index++) {
    if (!isSpace(shown.text, index)) positions[count++] = shown.positions[index];
  }

  const anchoredBlocks = new Map<string, [number, number][]>();
  doc.descendants((node, pos) => {
    const anchor = toAnchorAttribute(node.attrs.anchor);
    if (anchor) {
      const blocks = anchoredBlocks.get(anchor) ?? [];
      blocks.push([pos, pos + node.nodeSize]);
      anchoredBlocks.set(anchor, blocks);
    }
    return !node.isTextblock;
  });

  const search = { characters, positions, anchoredBlocks };
  searchTexts.set(doc, search);
  return search;
}

/**
 * Finds where each saved highlight shows in a chapter document. White space does not count, so the words are found over
 * a line break and from one block into the next, also when an older version of the reader saved them with other white
 * space. A highlight goes in the block of its anchor when that block holds its words, otherwise anywhere in the chapter
 * (RD-01). There, when the words are there more than once, it goes on the copy whose text before and after it is most
 * like the saved `prefix` and `suffix`, then on the first of the best copies. A highlight whose words are no longer in
 * the chapter shows nowhere (RD-02).
 */
export function highlightRanges(doc: ProseMirrorNode, highlights: HighlightItem[]): HighlightRange[] {
  if (!highlights.length) return [];

  const search = searchTextOf(doc);
  const ranges: HighlightRange[] = [];
  for (const highlight of highlights) {
    const words = withoutSpace(highlight.exact);
    const at = words ? bestCopy(search, words, highlight) : -1;
    if (at === -1) continue;
    ranges.push({ highlight, from: search.positions[at], to: search.positions[at + words.length - 1] + 1 });
  }
  return ranges;
}

/** The index in `search.characters` of the copy of `words` where the highlight goes, or -1. */
function bestCopy(search: SearchText, words: string, highlight: HighlightItem): number {
  const { characters, positions } = search;
  const prefix = withoutSpace(highlight.prefix);
  const suffix = withoutSpace(highlight.suffix);
  const fullScore = prefix.length + suffix.length;

  let best = -1;
  let bestScore = -1;
  // Keeps the copy at `at` when the text around it matches more of the saved text than the copies before it. True when
  // it matches all of it: no copy after it can be better.
  const matchesAll = (at: number): boolean => {
    const score =
      sameCharactersBefore(characters, at, prefix) + sameCharactersAfter(characters, at + words.length, suffix);
    if (score > bestScore) {
      best = at;
      bestScore = score;
    }
    return score === fullScore;
  };

  for (const [from, to] of search.anchoredBlocks.get(toAnchorAttribute(highlight.anchor) ?? "") ?? []) {
    const end = firstIndexAtOrAfter(positions, to);
    let at = characters.indexOf(words, firstIndexAtOrAfter(positions, from));
    while (at !== -1 && at < end) {
      if (matchesAll(at)) return at;
      at = characters.indexOf(words, at + 1);
    }
  }
  if (best !== -1) return best;

  for (let at = characters.indexOf(words); at !== -1; at = characters.indexOf(words, at + 1)) {
    if (matchesAll(at)) return at;
  }
  return best;
}

function withoutSpace(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, "");
}

/** How many characters just before `at` are the same as the end of `prefix`. */
function sameCharactersBefore(characters: string, at: number, prefix: string): number {
  let count = 0;
  while (count < prefix.length && count < at && characters[at - 1 - count] === prefix[prefix.length - 1 - count]) {
    count++;
  }
  return count;
}

/** How many characters from `at` on are the same as the start of `suffix`. */
function sameCharactersAfter(characters: string, at: number, suffix: string): number {
  let count = 0;
  while (count < suffix.length && at + count < characters.length && characters[at + count] === suffix[count]) {
    count++;
  }
  return count;
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
    const parsed: unknown = JSON.parse(body.slice(open, open + close + 1));
    // Every entry is checked, and a damaged one is dropped on its own. The list used to go through as it was, so an
    // entry with no `exact` text reached the reader and threw while the chapter was being drawn (RD-09).
    return highlightsFrom(parsed, "The old highlights block of this chapter");
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
