import type { Token } from "markdown-it";
import type { JSONContent } from "@tiptap/core";
import type { ResolveImage } from "./markdownNodes.ts";

/** The mark of the reader for each tag of a chapter file that has one. */
const TAG_MARKS = new Map([
  ["b", "bold"],
  ["strong", "bold"],
  ["i", "italic"],
  ["em", "italic"],
  ["s", "strike"],
  ["del", "strike"],
  ["strike", "strike"],
  ["code", "code"],
  ["mark", "highlight"],
  ["sup", "superscript"],
]);

/** Tags whose text a browser does not show. */
const HIDDEN_TAGS = new Set(["script", "style"]);

/** The mark of each Markdown mark token */
const TOKEN_MARKS: Record<string, string> = {
  strong_open: "bold",
  strong_close: "bold",
  em_open: "italic",
  em_close: "italic",
  s_open: "strike",
  s_close: "strike",
};

/** One tag, such as `<sup>`, `</sup>`, `<br/>` or `<img src="x">` */
const HTML_TAG = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)(?:[\s/][^>]*)?>$/;

/** A footnote marker in the text: `[^3]` */
const FOOTNOTE_MARKER = /\[\^([a-zA-Z0-9_-]+)\]/g;

/**
 * White space that a browser shows as one space: a run of two or more, or a tab or a line break. A single space stays
 * as it is, so most text is not copied. `\s` would also take a no-break space.
 */
const SPACES = /[\t\r\n\f][ \t\r\n\f]*| [ \t\r\n\f]+/g;
const SPACE_CHARACTERS = new Set([" ", "\t", "\r", "\n", "\f"]);

const NO_MARKS: readonly string[] = [];

/** The reader nodes of the inline tokens of one paragraph, heading or table cell (RD-03). */
export function inlineNodes(tokens: Token[], resolveImage: ResolveImage): JSONContent[] {
  const line = new InlineLine();
  const paired = pairedTags(tokens);
  // The lines of a text go to the line in one piece, because a piece for each line made a long paragraph slow
  let text = "";
  tokens.forEach((token, index) => {
    if (token.type === "text" || token.type === "text_special" || token.type === "softbreak") {
      text += token.type === "softbreak" ? " " : token.content;
      return;
    }
    if (text) {
      line.addText(text);
      text = "";
    }
    switch (token.type) {
      case "hardbreak":
        line.addNode({ type: "hardBreak" });
        break;
      case "code_inline":
        line.addText(token.content, "code");
        break;
      case "strong_open":
      case "em_open":
      case "s_open":
        line.open(TOKEN_MARKS[token.type]);
        break;
      case "strong_close":
      case "em_close":
      case "s_close":
        line.close(TOKEN_MARKS[token.type]);
        break;
      case "image": {
        const alt = (token.children ?? []).map((child) => child.content).join("");
        line.addNode({
          type: "image",
          attrs: { src: resolveImage(token.attrGet("src") ?? ""), alt, title: token.attrGet("title") },
        });
        break;
      }
      case "html_inline":
        addTag(line, token.content, paired.has(index));
        break;
      // A link keeps its words: `link_open` and `link_close` add nothing.
    }
  });
  if (text) line.addText(text);
  return line.finish();
}

function addTag(line: InlineLine, html: string, paired: boolean): void {
  const tag = HTML_TAG.exec(html);
  if (!tag) return; // A comment or a declaration shows nothing
  const closing = tag[1] === "/";
  const name = tag[2].toLowerCase();
  if (name === "br") {
    if (!closing) line.addNode({ type: "hardBreak" });
    return;
  }
  if (!paired) return;
  if (HIDDEN_TAGS.has(name)) {
    if (closing) line.show();
    else line.hide();
    return;
  }
  const mark = TAG_MARKS.get(name);
  if (mark && closing) line.close(mark);
  else if (mark) line.open(mark);
}

/**
 * The indexes of the tags that open or close a mark or hidden text and have their partner in the same block. A tag
 * with no partner does nothing, so a `<sup>` that the PDF import did not close raises no text.
 */
function pairedTags(tokens: Token[]): Set<number> {
  const paired = new Set<number>();
  const opened = new Map<string, number[]>();
  tokens.forEach((token, index) => {
    const tag = token.type === "html_inline" ? HTML_TAG.exec(token.content) : null;
    if (!tag || token.content.endsWith("/>")) return;
    const name = tag[2].toLowerCase();
    if (!TAG_MARKS.has(name) && !HIDDEN_TAGS.has(name)) return;
    const open = opened.get(name) ?? [];
    opened.set(name, open);
    if (tag[1] !== "/") {
      open.push(index);
    } else if (open.length) {
      paired.add(open.pop() as number);
      paired.add(index);
    }
  });
  return paired;
}

/**
 * The inline nodes of one paragraph, heading or table cell. White space is what a browser shows, as ProseMirror's
 * HTML parser made it before RD-03: a run of spaces and line breaks is one space, and there is none at the start of
 * the block, after a line break, after a space, or at the end of the block. Highlights and cards find the same text.
 */
class InlineLine {
  private readonly nodes: JSONContent[] = [];
  private readonly marks: string[] = [];
  private hidden = 0;

  open(mark: string): void {
    this.marks.push(mark);
  }

  close(mark: string): void {
    const at = this.marks.lastIndexOf(mark);
    if (at !== -1) this.marks.splice(at, 1);
  }

  hide(): void {
    this.hidden++;
  }

  show(): void {
    if (this.hidden > 0) this.hidden--;
  }

  addNode(node: JSONContent): void {
    if (!this.hidden) this.nodes.push(node);
  }

  /** Adds text with the open marks, and with `extraMark`. A footnote marker `[^3]` becomes a footnote node. */
  addText(raw: string, extraMark?: string): void {
    if (this.hidden) return;
    let text = raw.replace(SPACES, " ");
    const before = this.nodes[this.nodes.length - 1];
    // The last character only: a test of the whole text for each line made a long paragraph slow
    const spaceBefore = before?.type === "text" && SPACE_CHARACTERS.has((before.text ?? "").slice(-1));
    if (text.startsWith(" ") && (!before || before.type === "hardBreak" || spaceBefore)) {
      text = text.slice(1);
    }
    const marks = markSet(extraMark ? [...this.marks, extraMark] : this.marks);
    if (extraMark === "code" || !text.includes("[^")) {
      this.pushText(text, marks);
      return;
    }
    let start = 0;
    for (const marker of text.matchAll(FOOTNOTE_MARKER)) {
      const at = marker.index ?? 0;
      this.pushText(text.slice(start, at), marks);
      this.nodes.push({ type: "footnoteRef", attrs: { fnId: marker[1], number: marker[1] } });
      start = at + marker[0].length;
    }
    this.pushText(text.slice(start), marks);
  }

  finish(): JSONContent[] {
    const last = this.nodes[this.nodes.length - 1];
    if (last?.type === "text") {
      const full = last.text ?? "";
      let end = full.length;
      while (end > 0 && SPACE_CHARACTERS.has(full[end - 1])) end--;
      if (end) last.text = full.slice(0, end);
      else this.nodes.pop();
    }
    return this.nodes;
  }

  private pushText(text: string, marks: readonly string[]): void {
    if (!text) return;
    const before = this.nodes[this.nodes.length - 1];
    if (before?.type === "text" && sameMarks(before, marks)) {
      before.text = (before.text ?? "") + text;
      return;
    }
    this.nodes.push(
      marks.length ? { type: "text", text, marks: marks.map((type) => ({ type })) } : { type: "text", text }
    );
  }
}

/** Each mark once. Code keeps no other mark, as the reader's code mark excludes them. */
function markSet(marks: readonly string[]): readonly string[] {
  if (!marks.length) return NO_MARKS;
  return marks.includes("code") ? ["code"] : [...new Set(marks)];
}

function sameMarks(node: JSONContent, marks: readonly string[]): boolean {
  const own = node.marks ?? [];
  return own.length === marks.length && own.every((mark, index) => mark.type === marks[index]);
}
