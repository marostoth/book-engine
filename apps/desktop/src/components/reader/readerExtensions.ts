import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { BlockAnchors, FootnoteRef, Superscript } from "./TipTapExtensions.ts";
import { Table, TableCell, TableHeader, TableRow } from "./TableExtensions.ts";

/**
 * The nodes and marks of the reader. `parseChapterMarkdown` (`lib/markdown.ts`) makes each chapter a document of these,
 * and a test checks every such document against them (RD-03).
 */
export const readerExtensions: Extensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3, 4, 5, 6],
    },
  }),
  BlockAnchors,
  FootnoteRef,
  Superscript,
  Table,
  TableRow,
  TableHeader,
  TableCell,
  Image.configure({
    inline: true,
    allowBase64: true,
    HTMLAttributes: {
      class: "reader-image mx-auto my-6 rounded-lg shadow-md max-w-full border border-stone-200 dark:border-stone-800",
    },
  }),
  Highlight.configure({
    multicolor: true,
  }),
];
