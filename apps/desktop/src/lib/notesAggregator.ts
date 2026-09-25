import { BookMeta, ChapterNoteFile, AggregatedEntry } from "./types";
import { parseHighlightsFromNotes, reflectionsIn } from "./highlights";
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

/** One note of the reader's own, as the drawer shows it. */
export interface WrittenNote {
  /** The line that holds the note, counted in the notes once the old highlights are left out. */
  line: number;
  /** The heading the note sits under, or `Reflections` above the first heading. */
  heading: string;
  text: string;
  anchor?: string;
}

/**
 * The reader's own notes in one chapter's notes text (RD-18). This is the TypeScript half of `notes_written_in` in
 * `src-tauri/src/vault/notes.rs`, and `notesDrawerCases.json` holds both halves to the same cases.
 *
 * The old highlights comment and the quote lines the app wrote for it are left out by `reflectionsIn`, the rule the
 * move to the highlights file uses. This had its own rule, and it was wrong twice: it cut the comment at its first
 * `-->`, which a highlight's words may hold, and showed the rest of the JSON as notes; and it dropped every heading
 * that merely started with `## Highlights`, with everything under it.
 */
export function notesWrittenIn(content: string): WrittenNote[] {
  const lines = reflectionsIn(content).split("\n");
  const notes: WrittenNote[] = [];
  let heading = "Reflections";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("# ")) continue;
    if (line.startsWith("## ") || line.startsWith("### ")) {
      heading = line.replace(/^#+\s*/, "").trim();
      continue;
    }
    // One rule for the markers, the anchor, the quote marks and the empty prompt (RD-08). `noteLine` is the
    // TypeScript half of `note_text_and_anchor` in src-tauri/src/vault/notes.rs; the two must answer the same,
    // and `tests/test_one_note_format.py` holds them to it.
    const shown = noteLine(line);
    if (!shown) continue;
    notes.push({ line: i, heading, text: shown.text, anchor: shown.anchor });
  }
  return notes;
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

    // 2. The reader's own notes, without the old highlights comment (RD-18).
    for (const note of notesWrittenIn(file.content)) {
      entries.push({
        id: `note-${file.chapter_file}-${note.line}-${Date.now().toString(36)}`,
        type: "note",
        chapterFile: file.chapter_file,
        chapterTitle: chapter.title,
        chapterOrder: chapter.order,
        anchor: note.anchor,
        text: note.text,
        sectionHeading: note.heading,
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
