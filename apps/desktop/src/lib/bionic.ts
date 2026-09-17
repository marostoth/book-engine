import type { JSONContent } from "@tiptap/core";

/** A run of white space or of punctuation between two words */
const BETWEEN_WORDS = /(\s+|[.,!?;:"()[\]{}]+)/;

/**
 * Transforms the words of a chapter document into Bionic Reading format: the first 40-50% of the characters of each
 * word are bold, as a fixation point for the eye. Code and superscripts stay as they are, and a footnote marker holds
 * no text (RD-03: the reader shows a document, not HTML).
 */
export function applyBionicReading(doc: JSONContent): JSONContent {
  if (doc.type === "codeBlock" || !doc.content) return doc;
  return {
    ...doc,
    content: doc.content.flatMap((child) => (child.type === "text" ? bionicText(child) : [applyBionicReading(child)])),
  };
}

function bionicText(node: JSONContent): JSONContent[] {
  const text = node.text ?? "";
  const marks = node.marks ?? [];
  if (!text.trim() || marks.some((mark) => mark.type === "code" || mark.type === "superscript")) {
    return [node];
  }
  const boldMarks = marks.some((mark) => mark.type === "bold") ? marks : [...marks, { type: "bold" }];

  const nodes: JSONContent[] = [];
  for (const token of text.split(BETWEEN_WORDS)) {
    if (!token) continue;
    if (/^\s+$/.test(token) || /^[.,!?;:"()[\]{}]+$/.test(token)) {
      nodes.push(textNode(token, marks));
      continue;
    }
    // Word: bold first 40-50%
    const fixLen = fixationLength(token.length);
    nodes.push(textNode(token.slice(0, fixLen), boldMarks));
    if (token.length > fixLen) {
      nodes.push(textNode(token.slice(fixLen), marks));
    }
  }
  return nodes;
}

function fixationLength(length: number): number {
  if (length <= 3) return 1;
  if (length <= 6) return 2;
  if (length <= 9) return 3;
  return Math.ceil(length * 0.4);
}

function textNode(text: string, marks: JSONContent["marks"]): JSONContent {
  return marks && marks.length ? { type: "text", text, marks } : { type: "text", text };
}
