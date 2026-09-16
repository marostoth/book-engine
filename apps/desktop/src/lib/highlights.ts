import type { HighlightItem } from "./types";
// The .ts extension lets the Node test runner load this module (highlights.test.ts).
import { toAnchorAttribute } from "./anchors.ts";

const PREFIX_SUFFIX_LEN = 32;

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
  const match = notesContent.match(/<!--\s*highlights-json\s*([\s\S]*?)\s*-->/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("Failed to parse highlights-json block:", e);
    return [];
  }
}

/** Text of one rendered paragraph and the `data-anchor` of the nearest element at or above it. */
export interface ParagraphCandidate {
  anchor: string | null;
  text: string;
}

/**
 * Picks the paragraph for a highlight: the paragraph with the highlight's anchor when it still
 * contains the quote, otherwise the first paragraph that contains the quote. Returns -1 when no
 * paragraph contains it. The saved anchor (`^p-001`) and the HTML attribute (`p-001`) are
 * compared in one form.
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
    const anchored = paragraphs.findIndex((p) => toAnchorAttribute(p.anchor) === anchor);
    if (anchored !== -1 && containsQuote(paragraphs[anchored].text)) {
      return anchored;
    }
  }
  // No anchor, or the anchored paragraph was edited: scan all paragraphs
  return paragraphs.findIndex((p) => containsQuote(p.text));
}

/**
 * Hydrates and injects highlight marks into chapter HTML with fuzzy recovery.
 */
export function applyHighlightsToHtml(html: string, highlights: HighlightItem[]): string {
  if (!highlights.length) return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const paragraphs = Array.from(doc.querySelectorAll("p"));
  const candidates: ParagraphCandidate[] = paragraphs.map((p) => ({
    anchor: p.closest("[data-anchor]")?.getAttribute("data-anchor") ?? null,
    text: p.textContent || "",
  }));

  for (const hl of highlights) {
    const index = findHighlightParagraph(candidates, hl);
    if (index !== -1) {
      highlightInElement(paragraphs[index], hl);
    } else if ((doc.body.textContent || "").includes(hl.exact)) {
      // Global fallback search
      highlightInElement(doc.body, hl);
    }
  }

  return doc.body.innerHTML;
}

function highlightInElement(el: Element, hl: HighlightItem) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let currentNode: Node | null = walker.nextNode();

  while (currentNode) {
    const text = currentNode.textContent || "";
    const idx = text.indexOf(hl.exact);

    if (idx !== -1) {
      const parent = currentNode.parentNode;
      if (!parent || (parent as HTMLElement).tagName === "MARK") {
        currentNode = walker.nextNode();
        continue;
      }

      const before = text.slice(0, idx);
      const match = text.slice(idx, idx + hl.exact.length);
      const after = text.slice(idx + hl.exact.length);

      const mark = document.createElement("mark");
      mark.className = "w3c-highlight bg-amber-200/70 dark:bg-amber-400/30 text-inherit rounded px-0.5 transition-colors";
      mark.setAttribute("data-hl-id", hl.id);
      mark.textContent = match;

      const fragment = document.createDocumentFragment();
      if (before) fragment.appendChild(document.createTextNode(before));
      fragment.appendChild(mark);
      if (after) fragment.appendChild(document.createTextNode(after));

      parent.replaceChild(fragment, currentNode);
      break;
    }
    currentNode = walker.nextNode();
  }
}
