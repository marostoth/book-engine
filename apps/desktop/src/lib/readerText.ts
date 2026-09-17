import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * The text of a chapter document as the reader shows it, with the document position of each character. A new block and
 * a line break start a new line, a footnote marker shows its number in brackets, and a picture has no text. A highlight
 * saves its words from this text, and the reader finds them in it again (RD-02).
 */
export interface ReaderText {
  text: string;
  /** The document position before each character of `text`. All characters of a footnote marker have its position. */
  positions: number[];
}

/** The text of a footnote marker, such as `[1]`. */
export function footnoteLabel(attrs: { fnId?: string; number?: string }): string {
  return `[${attrs.number || attrs.fnId || "1"}]`;
}

// A chapter document never changes, so its text is made once.
const readerTexts = new WeakMap<ProseMirrorNode, ReaderText>();

export function readerText(doc: ProseMirrorNode): ReaderText {
  const known = readerTexts.get(doc);
  if (known) return known;

  const pieces: string[] = [];
  const positions: number[] = [];
  const add = (piece: string, position: number, step: number) => {
    pieces.push(piece);
    for (let index = 0; index < piece.length; index++) positions.push(position + index * step);
  };

  doc.descendants((node, pos) => {
    if (node.isText) {
      add(node.text ?? "", pos, 1);
    } else if (node.type.name === "footnoteRef") {
      add(footnoteLabel(node.attrs), pos, 0);
    } else if (node.type.name === "hardBreak" || (node.isTextblock && positions.length > 0)) {
      add("\n", pos, 0);
    }
    return !node.isLeaf;
  });

  const shown = { text: pieces.join(""), positions };
  readerTexts.set(doc, shown);
  return shown;
}
