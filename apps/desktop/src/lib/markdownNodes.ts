import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import type { JSONContent } from "@tiptap/core";
import { inlineNodes } from "./markdownInline.ts";
import { withEveryTableWord } from "./markdownTables.ts";

/** The address that the reader loads a picture of the book from, for the `src` of a Markdown image. */
export type ResolveImage = (src: string) => string;

/**
 * The Markdown parser of the reader (RD-03): CommonMark, with the tables and the strikethrough of GitHub.
 *
 * HTML is on, because the PDF import writes `<sup>` and `<br>` tags into a chapter file. A tag becomes a mark or a
 * line break of the reader only when the reader has one (`markdownInline.ts`); every other tag is left out, and the
 * text around it stays. The reader gets nodes and never HTML, so no text of a book can become a tag (SEC-01).
 */
const parser = new MarkdownIt("default", { html: true, linkify: false, typographer: false });

/** The nodes of the reader for the Markdown of one block of a chapter file. */
export function markdownNodes(markdown: string, resolveImage: ResolveImage): JSONContent[] {
  const { table, textAfter } = withEveryTableWord(markdown);
  const nodes = blockNodes(parser.parse(table, {}), resolveImage);
  return textAfter ? [...nodes, ...blockNodes(parser.parse(textAfter, {}), resolveImage)] : nodes;
}

function blockNodes(tokens: Token[], resolveImage: ResolveImage): JSONContent[] {
  const nodes: JSONContent[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.nesting !== 1) {
      nodes.push(...leafNodes(token, resolveImage));
      continue;
    }
    const close = closingIndex(tokens, index);
    nodes.push(...containerNodes(token, tokens.slice(index + 1, close), resolveImage));
    index = close;
  }
  return nodes;
}

/** The index of the token that closes the token at `open`. */
function closingIndex(tokens: Token[], open: number): number {
  let depth = 0;
  for (let index = open; index < tokens.length; index++) {
    depth += tokens[index].nesting;
    if (depth === 0) return index;
  }
  return tokens.length - 1;
}

function containerNodes(open: Token, inner: Token[], resolveImage: ResolveImage): JSONContent[] {
  const blocks = () => blockNodes(inner, resolveImage);
  switch (open.type) {
    case "paragraph_open":
      return [textblock("paragraph", undefined, inner, resolveImage)];
    case "heading_open":
      return [textblock("heading", { level: Number(open.tag.slice(1)) }, inner, resolveImage)];
    case "blockquote_open":
      return [{ type: "blockquote", content: startingWithParagraph(blocks(), true) }];
    case "bullet_list_open":
      return [{ type: "bulletList", content: blocks() }];
    case "ordered_list_open":
      return [{ type: "orderedList", attrs: { start: Number(open.attrGet("start") ?? 1) }, content: blocks() }];
    case "list_item_open":
      return [{ type: "listItem", content: startingWithParagraph(blocks(), false) }];
    case "table_open":
      return [{ type: "table", content: blocks() }];
    case "tr_open":
      return [{ type: "tableRow", content: blocks() }];
    case "th_open":
    case "td_open": {
      const align = /text-align:\s*(left|right|center)/.exec(open.attrGet("style") ?? "")?.[1] ?? null;
      const type = open.type === "th_open" ? "tableHeader" : "tableCell";
      return [{ type, attrs: { align }, content: [textblock("paragraph", undefined, inner, resolveImage)] }];
    }
    default:
      // `thead` and `tbody` hold the rows of a table
      return blocks();
  }
}

function leafNodes(token: Token, resolveImage: ResolveImage): JSONContent[] {
  switch (token.type) {
    case "fence":
    case "code_block":
      return [codeBlock(token.content.replace(/\n$/, ""), token.info.trim().split(/\s+/)[0] || null)];
    case "hr":
      return [{ type: "horizontalRule" }];
    case "html_block":
      return htmlBlockNodes(token.content, resolveImage);
    case "inline":
      return [withContent({ type: "paragraph" }, inlineNodes(token.children ?? [], resolveImage))];
    default:
      return [];
  }
}

function textblock(
  type: string,
  attrs: Record<string, unknown> | undefined,
  inner: Token[],
  resolveImage: ResolveImage
): JSONContent {
  const inline = inner.find((token) => token.type === "inline");
  return withContent(attrs ? { type, attrs } : { type }, inlineNodes(inline?.children ?? [], resolveImage));
}

function withContent(node: JSONContent, content: JSONContent[]): JSONContent {
  return content.length ? { ...node, content } : node;
}

/** A list item starts with a paragraph, and a quote holds at least one, as the reader's nodes require. */
function startingWithParagraph(blocks: JSONContent[], onlyWhenEmpty: boolean): JSONContent[] {
  if (blocks[0]?.type === "paragraph" || (onlyWhenEmpty && blocks.length)) return blocks;
  return [{ type: "paragraph" }, ...blocks];
}

function codeBlock(text: string, language: string | null): JSONContent {
  return withContent({ type: "codeBlock", attrs: { language } }, text ? [{ type: "text", text }] : []);
}

/**
 * An HTML block of a chapter file. The EPUB import writes preformatted text as `<pre>`, with character references for
 * the characters that Markdown reads (IN-02), and the reader shows it as a code block. The text of any other HTML block
 * shows as a paragraph.
 */
function htmlBlockNodes(html: string, resolveImage: ResolveImage): JSONContent[] {
  const source = html.trim();
  const pre = /^<pre(?:[\s/][^>]*)?>([\s\S]*)<\/pre>$/i.exec(source);
  if (pre) return [codeBlock(referencesDecoded(pre[1]), null)];
  const inline = parser.parseInline(source, {})[0];
  const content = inlineNodes(inline?.children ?? [], resolveImage);
  return content.length ? [{ type: "paragraph", content }] : [];
}

/** The text with each character reference (`&#42;`, `&lt;`) as its character. A backslash stays, as in HTML. */
function referencesDecoded(text: string): string {
  return parser.utils.unescapeAll(text.replace(/\\/g, "\\\\"));
}
