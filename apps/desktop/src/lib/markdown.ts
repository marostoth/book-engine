import { FootnoteItem } from "./types";

export interface ParsedChapter {
  html: string;
  footnotes: Record<string, FootnoteItem>;
}

/**
 * Parses chapter Markdown into HTML formatted for TipTap, separating
 * footnote definitions and injecting interactive footnote and anchor tags.
 */
export function parseChapterMarkdown(markdown: string): ParsedChapter {
  const lines = markdown.split("\n");
  const bodyBlocks: string[] = [];
  const footnotes: Record<string, FootnoteItem> = {};

  // 1. Separate footnote definitions from content blocks
  const currentBlock: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line is footnote definition: [^1]: Note text...
    const fnMatch = line.match(/^\[\^([a-zA-Z0-9_-]+)\]:\s*(.+)$/);
    if (fnMatch) {
      const fnId = fnMatch[1];
      let fnText = fnMatch[2].replace(/\s*\^p-[a-zA-Z0-9_-]+$/, "").trim();

      // Check if subsequent indented lines belong to this footnote
      while (i + 1 < lines.length && (lines[i + 1].startsWith("    ") || lines[i + 1].startsWith("\t"))) {
        i++;
        fnText += " " + lines[i].trim().replace(/\s*\^p-[a-zA-Z0-9_-]+$/, "");
      }

      footnotes[fnId] = {
        id: fnId,
        number: fnId,
        text: fnText,
      };
      continue;
    }

    if (!line.trim()) {
      if (currentBlock.length > 0) {
        bodyBlocks.push(currentBlock.join("\n"));
        currentBlock.length = 0;
      }
    } else {
      currentBlock.push(line);
    }
  }

  if (currentBlock.length > 0) {
    bodyBlocks.push(currentBlock.join("\n"));
  }

  // 2. Render blocks to HTML
  const htmlParts: string[] = [];

  for (const block of bodyBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Heading 1
    if (trimmed.startsWith("# ")) {
      const text = renderInlines(trimmed.slice(2));
      htmlParts.push(`<h1>${text}</h1>`);
      continue;
    }
    // Heading 2
    if (trimmed.startsWith("## ")) {
      const text = renderInlines(trimmed.slice(3));
      htmlParts.push(`<h2>${text}</h2>`);
      continue;
    }
    // Heading 3
    if (trimmed.startsWith("### ")) {
      const text = renderInlines(trimmed.slice(4));
      htmlParts.push(`<h3>${text}</h3>`);
      continue;
    }

    // Standalone Image: ![alt](src)
    const imgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)(?:\s*\^p-[a-zA-Z0-9_-]+)?$/);
    if (imgMatch) {
      const alt = imgMatch[1];
      const src = imgMatch[2];
      htmlParts.push(`<p><img src="${src}" alt="${alt}" /></p>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const cleanQuote = trimmed
        .split("\n")
        .map((l) => l.replace(/^>\s?/, ""))
        .join(" ");
      const text = renderInlines(cleanQuote);
      htmlParts.push(`<blockquote><p>${text}</p></blockquote>`);
      continue;
    }

    // Standard Paragraph
    const text = renderInlines(trimmed);
    htmlParts.push(`<p>${text}</p>`);
  }

  return {
    html: htmlParts.join("\n"),
    footnotes,
  };
}

/**
 * Renders inline Markdown constructs: bold, italic, code, footnote callouts, and anchor tags.
 */
function renderInlines(raw: string): string {
  let text = raw;

  // Paragraph anchors: ^p-042 -> <span class="anchor-tag" data-anchor="^p-042">§p-042</span>
  text = text.replace(
    /\s*\^p-([a-zA-Z0-9_-]+)$/g,
    ' <span class="anchor-tag" data-anchor="^p-$1">§p-$1</span>'
  );

  // Footnote callouts: [^1] -> <button class="footnote-callout" data-fn="1">1</button>
  text = text.replace(/\[\^([a-zA-Z0-9_-]+)\]/g, '<span class="footnote-callout" data-fn="$1">$1</span>');

  // Inline images: ![alt](src)
  text = text.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" />');

  // Bold: **text**
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // Italic: *text*
  text = text.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // Code: `code`
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");

  return text;
}
