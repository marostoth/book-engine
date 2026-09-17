import { Node as TiptapNode } from "@tiptap/core";

/**
 * The table of a chapter file, as the reader shows it (RD-03). A table holds rows, a row holds header cells and cells,
 * and a cell holds paragraphs. The names are those of TipTap's own table nodes. The table keeps the anchor of its
 * block (`BlockAnchors`), and a cell keeps the alignment of its column.
 */
export const Table = TiptapNode.create({
  name: "table",
  group: "block",
  content: "tableRow+",
  isolating: true,

  parseHTML() {
    return [{ tag: "table" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["table", HTMLAttributes, ["tbody", 0]];
  },
});

export const TableRow = TiptapNode.create({
  name: "tableRow",
  content: "(tableHeader | tableCell)+",

  parseHTML() {
    return [{ tag: "tr" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["tr", HTMLAttributes, 0];
  },
});

// The alignment of the column of a cell: left, right, center, or none
const cellAttributes = {
  align: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.textAlign || null,
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes.align ? { style: `text-align: ${attributes.align}` } : {},
  },
};

export const TableHeader = TiptapNode.create({
  name: "tableHeader",
  content: "block+",
  isolating: true,

  addAttributes() {
    return cellAttributes;
  },

  parseHTML() {
    return [{ tag: "th" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["th", HTMLAttributes, 0];
  },
});

export const TableCell = TiptapNode.create({
  name: "tableCell",
  content: "block+",
  isolating: true,

  addAttributes() {
    return cellAttributes;
  },

  parseHTML() {
    return [{ tag: "td" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["td", HTMLAttributes, 0];
  },
});
