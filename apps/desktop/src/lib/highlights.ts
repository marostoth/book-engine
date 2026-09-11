import { HighlightItem } from "./types";

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
 * Parses embedded W3C highlights from a chapter notes markdown file.
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

/**
 * Serializes highlights into chapter notes markdown, preserving notes and adding
 * a human-readable list and embedded JSON for hydration.
 */
export function serializeHighlightsToNotes(
  existingNotes: string,
  highlights: HighlightItem[]
): string {
  // Strip existing highlights section if present
  let baseNotes = existingNotes.replace(/\n*## Highlights[\s\S]*?(?=\n##|$)/g, "").trim();

  if (highlights.length === 0) {
    return baseNotes + "\n";
  }

  const jsonBlock = `<!-- highlights-json\n${JSON.stringify(highlights, null, 2)}\n-->`;
  const readableList = highlights
    .map((h) => {
      const anchorRef = h.anchor ? ` (${h.anchor})` : "";
      return `- > "${h.exact}"${anchorRef}`;
    })
    .join("\n");

  const highlightsSection = `\n\n## Highlights\n\n${jsonBlock}\n\n${readableList}\n`;
  return baseNotes + highlightsSection;
}

/**
 * Hydrates and injects highlight marks into chapter HTML with fuzzy recovery.
 */
export function applyHighlightsToHtml(html: string, highlights: HighlightItem[]): string {
  if (!highlights.length) return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  for (const hl of highlights) {
    let targetPara: Element | null = null;

    // 1. Try finding paragraph by anchor
    if (hl.anchor) {
      const anchorSpan = doc.querySelector(`[data-anchor="${hl.anchor}"]`);
      if (anchorSpan) {
        targetPara = anchorSpan.closest("p");
      }
    }

    const searchScope = targetPara ? [targetPara] : Array.from(doc.querySelectorAll("p"));

    let applied = false;
    for (const p of searchScope) {
      const pText = p.textContent || "";

      // Exact match
      if (pText.includes(hl.exact)) {
        highlightInElement(p, hl);
        applied = true;
        break;
      }

      // Fuzzy recovery: Match with relaxed whitespace / punctuation
      const normalizedP = pText.replace(/\s+/g, " ");
      const normalizedExact = hl.exact.replace(/\s+/g, " ");
      if (normalizedP.includes(normalizedExact)) {
        highlightInElement(p, hl);
        applied = true;
        break;
      }
    }

    if (!applied && !targetPara) {
      // Global fallback search
      const bodyText = doc.body.textContent || "";
      if (bodyText.includes(hl.exact)) {
        highlightInElement(doc.body, hl);
      }
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
