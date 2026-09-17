import type { JSONContent } from "@tiptap/core";
import type { FootnoteItem } from "./types.ts";
import { markdownNodes, type ResolveImage } from "./markdownNodes.ts";

export interface ParsedChapter {
  /** The chapter as a document of the reader's nodes (`readerExtensions`), with the anchor of each block. */
  doc: JSONContent;
  footnotes: Record<string, FootnoteItem>;
}

/** The anchor at the end of a block of a chapter file: `^p-001`, or the older `§p-001` */
const BLOCK_ANCHOR = /\s*(?:\^|§)p-([a-zA-Z0-9_-]+)$/;

/** A footnote text: `[^1]: Note text` */
const FOOTNOTE = /^\[\^([a-zA-Z0-9_-]+)\]:\s*(.+)$/;

/**
 * Parses chapter Markdown into the document that the reader shows, and the texts of its footnotes (RD-03).
 *
 * The blocks are those of the import and of search: the text between two blank lines, with its anchor at the end.
 * markdown-it reads each block (`markdownNodes`), so a list, a table, a quote, a superscript and preformatted text
 * show as such, and the first node of the block keeps the anchor (`data-anchor="p-001"`). `resolveImage` gives the
 * address of each picture of the book.
 */
export function parseChapterMarkdown(markdown: string, resolveImage: ResolveImage = (src) => src): ParsedChapter {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const body: string[] = [];
  const footnotes: Record<string, FootnoteItem> = {};

  // 1. Separate footnote texts from the text of the chapter
  for (let i = 0; i < lines.length; i++) {
    const fnMatch = lines[i].startsWith("[^") ? lines[i].match(FOOTNOTE) : null;
    if (!fnMatch) {
      body.push(lines[i]);
      continue;
    }
    const fnId = fnMatch[1];
    let fnText = fnMatch[2].replace(/\s*\^p-[a-zA-Z0-9_-]+$/, "").trim();

    // Indented lines below the footnote belong to it
    while (i + 1 < lines.length && (lines[i + 1].startsWith("    ") || lines[i + 1].startsWith("\t"))) {
      i++;
      fnText += " " + lines[i].trim().replace(/\s*\^p-[a-zA-Z0-9_-]+$/, "");
    }

    footnotes[fnId] = { id: fnId, number: fnId, text: fnText };
  }

  // 2. Parse each block, and give its first node the anchor of the block
  const blocks: JSONContent[] = [];
  for (const block of body.join("\n").split("\n\n")) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // The anchor is at the end, so only the end of a long block is searched
    const tail = Math.max(0, trimmed.length - 80);
    const anchorMatch = trimmed.slice(tail).match(BLOCK_ANCHOR);
    const content = anchorMatch ? trimmed.slice(0, tail + (anchorMatch.index ?? 0)) : trimmed;
    const nodes = markdownNodes(content, resolveImage);
    if (anchorMatch) {
      const [first = { type: "paragraph" }, ...rest] = nodes;
      blocks.push({ ...first, attrs: { ...first.attrs, anchor: `p-${anchorMatch[1]}` } }, ...rest);
    } else {
      blocks.push(...nodes);
    }
  }

  return {
    doc: { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] },
    footnotes,
  };
}

/**
 * Sanitizes quote snippets by stripping inline markdown delimiters (bold, italic, code, anchors)
 * so quotes display cleanly in UI chips and summary cards without raw asterisks or backticks.
 */
export function sanitizeQuoteText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[\^.*?\]/g, "")
    .replace(/\s*(?:\^|§)p-[a-zA-Z0-9_-]+/g, "")
    .trim();
}
