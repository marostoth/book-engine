import { BookMeta, ChapterNoteFile, AggregatedEntry } from "./types";
import { parseHighlightsFromNotes } from "./highlights";
import { noteLine } from "./noteLine";

/**
 * Extracts numeric anchor index from anchor string (e.g. "^p-042" -> 42).
 * Returns Infinity if no anchor is found.
 */
function getAnchorIndex(anchor?: string): number {
  if (!anchor) return Infinity;
  const match = anchor.match(/\^?p-(\d+)/i);
  return match ? parseInt(match[1], 10) : Infinity;
}

/**
 * Aggregates all chapter notes and W3C highlights across the active book.
 * Groups entries chronologically by Chapter spine sequence, then by Paragraph Anchor (^p-xxx).
 */
export function aggregateBookNotes(
  bookMeta: BookMeta,
  noteFiles: ChapterNoteFile[]
): AggregatedEntry[] {
  const entries: AggregatedEntry[] = [];
  const spineMap = new Map(bookMeta.spine.map((ch) => [ch.file_path, ch]));

  for (const file of noteFiles) {
    const chapter = spineMap.get(file.chapter_file) || {
      id: file.chapter_file.replace(".md", ""),
      title: file.chapter_file.replace(".md", "").replace("ch-", "Chapter "),
      file_path: file.chapter_file,
      order: 999,
      word_count: 0,
      anchor_count: 0,
      footnotes_count: 0,
    };

    // 1. Parse W3C Highlights from the embedded JSON comment block
    const highlights = parseHighlightsFromNotes(file.content);
    for (const hl of highlights) {
      entries.push({
        id: hl.id,
        type: "highlight",
        chapterFile: file.chapter_file,
        chapterTitle: chapter.title,
        chapterOrder: chapter.order,
        anchor: hl.anchor,
        text: hl.exact,
        prefix: hl.prefix,
        suffix: hl.suffix,
        color: hl.color || "yellow",
        createdAt: hl.createdAt,
      });
    }

    // 2. Parse Markdown reflections, bullets, and questions (excluding highlights JSON & readable list)
    // Strip machine JSON block and any human-readable highlights block
    const cleanNotes = file.content
      .replace(/<!--\s*highlights-json[\s\S]*?-->/g, "")
      .replace(/\n*## Highlights[\s\S]*?(?=\n##|$)/g, "")
      .trim();

    // Parse lines and sections
    const lines = cleanNotes.split("\n");
    let currentHeading = "Reflections";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Skip top-level title
      if (line.startsWith("# ")) continue;

      // Track section headings (## Key Takeaways, ## Open Inquiries, etc.)
      if (line.startsWith("## ") || line.startsWith("### ")) {
        currentHeading = line.replace(/^#+\s*/, "").trim();
        continue;
      }

      // One rule for the markers, the anchor, the quote marks and the empty prompt (RD-08). `noteLine` is the
      // TypeScript half of `note_text_and_anchor` in src-tauri/src/vault/notes.rs; the two must answer the same,
      // and `tests/test_one_note_format.py` holds them to it.
      const shown = noteLine(line);
      if (!shown) continue;

      entries.push({
        id: `note-${file.chapter_file}-${i}-${Date.now().toString(36)}`,
        type: "note",
        chapterFile: file.chapter_file,
        chapterTitle: chapter.title,
        chapterOrder: chapter.order,
        anchor: shown.anchor,
        text: shown.text,
        sectionHeading: currentHeading,
      });
    }
  }

  // Chronological sort: by chapter order first, then by paragraph anchor index
  entries.sort((a, b) => {
    if (a.chapterOrder !== b.chapterOrder) {
      return a.chapterOrder - b.chapterOrder;
    }
    const aAnchor = getAnchorIndex(a.anchor);
    const bAnchor = getAnchorIndex(b.anchor);
    if (aAnchor !== bAnchor) {
      return aAnchor - bAnchor;
    }
    // Highlights before notes at same anchor
    if (a.type !== b.type) {
      return a.type === "highlight" ? -1 : 1;
    }
    return 0;
  });

  return entries;
}

/**
 * Compiles all aggregated highlights and personal reflections into a clean,
 * publication-ready Markdown file for `vault/notes/<book-id>/summary-export.md`.
 */
export function generateSummaryMarkdown(
  bookMeta: BookMeta,
  entries: AggregatedEntry[]
): string {
  const dateStr = new Date().toISOString().split("T")[0];

  let md = `# Executive Reading Summary: ${bookMeta.title}\n\n`;
  md += `> **Author:** ${bookMeta.author}  \n`;
  md += `> **Total Chapters:** ${bookMeta.total_chapters} | **Total Words:** ${bookMeta.total_words.toLocaleString()}  \n`;
  md += `> **Exported:** ${dateStr} via Book Engine Desktop  \n\n`;
  md += `---\n\n`;

  // Table of Contents
  md += `## Table of Contents\n\n`;
  const chaptersWithContent = Array.from(
    new Set(entries.map((e) => e.chapterFile))
  );

  for (const chFile of chaptersWithContent) {
    const chEntries = entries.filter((e) => e.chapterFile === chFile);
    const title = chEntries[0]?.chapterTitle || chFile;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    md += `- [${title}](#${slug}) (${chEntries.length} items)\n`;
  }
  md += `\n---\n\n`;

  // Chapter Sections
  for (const chFile of chaptersWithContent) {
    const chEntries = entries.filter((e) => e.chapterFile === chFile);
    const title = chEntries[0]?.chapterTitle || chFile;

    md += `## ${title}\n\n`;

    const highlights = chEntries.filter((e) => e.type === "highlight");
    const notes = chEntries.filter((e) => e.type === "note");

    if (highlights.length > 0) {
      md += `### Highlights & Quotes\n\n`;
      for (const hl of highlights) {
        const anchorStr = hl.anchor ? ` *(${hl.anchor})*` : "";
        md += `- > "${hl.text}"${anchorStr}\n`;
      }
      md += `\n`;
    }

    if (notes.length > 0) {
      md += `### Personal Reflections & Inquiries\n\n`;
      let lastHeading = "";
      for (const note of notes) {
        if (note.sectionHeading && note.sectionHeading !== lastHeading) {
          lastHeading = note.sectionHeading;
          md += `#### ${lastHeading}\n\n`;
        }
        const anchorStr = note.anchor ? ` *(${note.anchor})*` : "";
        md += `- ${note.text}${anchorStr}\n`;
      }
      md += `\n`;
    }

    md += `---\n\n`;
  }

  md += `*Generated by Book Engine - Local-First Extractive Reader*\n`;
  return md;
}
