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

    // Check for block-level paragraph anchor: ^p-001 or §p-001
    const anchorMatch = trimmed.match(/\s*(?:\^|§)p-([a-zA-Z0-9_-]+)$/);
    const anchor = anchorMatch ? `p-${anchorMatch[1]}` : null;
    const content = anchorMatch ? trimmed.slice(0, anchorMatch.index).trim() : trimmed;

    // Heading 1
    if (content.startsWith("# ")) {
      const text = renderInlines(content.slice(2));
      const anchorAttr = anchor ? ` data-anchor="${anchor}"` : "";
      htmlParts.push(`<h1${anchorAttr}>${text}</h1>`);
      continue;
    }
    // Heading 2
    if (content.startsWith("## ")) {
      const text = renderInlines(content.slice(3));
      const anchorAttr = anchor ? ` data-anchor="${anchor}"` : "";
      htmlParts.push(`<h2${anchorAttr}>${text}</h2>`);
      continue;
    }
    // Heading 3
    if (content.startsWith("### ")) {
      const text = renderInlines(content.slice(4));
      const anchorAttr = anchor ? ` data-anchor="${anchor}"` : "";
      htmlParts.push(`<h3${anchorAttr}>${text}</h3>`);
      continue;
    }

    // Standalone Image: ![alt](src)
    const imgMatch = content.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      const alt = imgMatch[1];
      const src = imgMatch[2];
      const anchorAttr = anchor ? ` data-anchor="${anchor}"` : "";
      htmlParts.push(`<p${anchorAttr}><img src="${src}" alt="${alt}" /></p>`);
      continue;
    }

    // Blockquote
    if (content.startsWith(">")) {
      const cleanQuote = content
        .split("\n")
        .map((l) => l.replace(/^>\s?/, ""))
        .join(" ");
      const text = renderInlines(cleanQuote);
      const anchorAttr = anchor ? ` data-anchor="${anchor}"` : "";
      htmlParts.push(`<blockquote${anchorAttr}><p>${text}</p></blockquote>`);
      continue;
    }

    // Standard Paragraph
    const text = renderInlines(content);
    const anchorAttr = anchor ? ` data-anchor="${anchor}"` : "";
    htmlParts.push(`<p${anchorAttr}>${text}</p>`);
  }

  return {
    html: htmlParts.join("\n"),
    footnotes,
  };
}

/**
 * Renders inline Markdown constructs: bold, italic, code, and footnote callouts.
 * Anchors are parsed into node attributes and never left in the inline text body.
 */
function renderInlines(raw: string): string {
  let text = raw;

  // Clean any remaining anchor tokens from inline text body
  text = text.replace(/\s*(?:\^|§)p-[a-zA-Z0-9_-]+$/g, "");

  // Footnote callouts: [^1] -> <sup class="footnote-callout" data-fn="1">[1]</sup>
  text = text.replace(
    /\[\^([a-zA-Z0-9_-]+)\]/g,
    '<sup class="footnote-callout" data-fn="$1">[$1]</sup>'
  );

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
