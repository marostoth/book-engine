import test from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import type { Node as ReaderNode } from "@tiptap/pm/model";
import { readerExtensions } from "../components/reader/readerExtensions.ts";
import { parseChapterMarkdown } from "./markdown.ts";

const schema = getSchema(readerExtensions);

/** The document that the reader shows for a chapter file, made of the reader's nodes, which it must fit. */
function read(markdown: string): ReaderNode {
  const doc = schema.nodeFromJSON(parseChapterMarkdown(markdown, (src) => `asset://book/${src}`).doc);
  doc.check();
  return doc;
}

/** The blocks that the reader shows with their nodes and marks, such as `bulletList(listItem(paragraph("Corn")))` */
function shown(markdown: string): string {
  return read(markdown).content.toString().slice(1, -1);
}

/** Each block that the reader shows with the anchor that it keeps, such as `table#p-004` */
function anchors(doc: ReaderNode): string[] {
  const blocks: string[] = [];
  doc.forEach((node) => blocks.push(node.attrs.anchor ? `${node.type.name}#${node.attrs.anchor}` : node.type.name));
  return blocks;
}

test("a bullet list shows as a list, and keeps the anchor of its block", () => {
  const chapter = "- Corn is cheap\n- Wool is dear\n- Salt is taxed ^p-002";

  assert.equal(
    shown(chapter),
    'bulletList(listItem(paragraph("Corn is cheap")), listItem(paragraph("Wool is dear")), ' +
      'listItem(paragraph("Salt is taxed")))'
  );
  assert.deepEqual(anchors(read(chapter)), ["bulletList#p-002"]);
});

test("a numbered list shows as a list that starts at the first number of the book", () => {
  const chapter = "3. The third rule\n4. The fourth rule ^p-003";
  const doc = read(chapter);

  assert.equal(
    shown(chapter),
    'orderedList(listItem(paragraph("The third rule")), listItem(paragraph("The fourth rule")))'
  );
  assert.equal(doc.child(0).attrs.start, 3);
  assert.deepEqual(anchors(doc), ["orderedList#p-003"]);
});

test("a table shows as a table, with its header row, the alignment of each column and its line breaks", () => {
  const chapter = [
    "| Good | Price | Note |",
    "|:---|---:|:---:|",
    "| Wheat | 10 | first<br>line |",
    "| **Wool** | 12 | second | ^p-004",
  ].join("\n");
  const doc = read(chapter);
  const aligns: (string | null)[][] = [];
  doc.child(0).forEach((row) => {
    const cells: (string | null)[] = [];
    row.forEach((cell) => cells.push(cell.attrs.align));
    aligns.push(cells);
  });

  assert.equal(
    shown(chapter),
    'table(tableRow(tableHeader(paragraph("Good")), tableHeader(paragraph("Price")), ' +
      'tableHeader(paragraph("Note"))), ' +
      'tableRow(tableCell(paragraph("Wheat")), tableCell(paragraph("10")), ' +
      'tableCell(paragraph("first", hardBreak, "line"))), ' +
      'tableRow(tableCell(paragraph(bold("Wool"))), tableCell(paragraph("12")), tableCell(paragraph("second"))))'
  );
  assert.deepEqual(aligns, [
    ["left", "right", "center"],
    ["left", "right", "center"],
    ["left", "right", "center"],
  ]);
  assert.deepEqual(anchors(doc), ["table#p-004"]);
});

test("no word of a table is lost: text after its last row shows below it, and extra cells join the last cell", () => {
  // The PDF import can end the last row of a table with the sentence that follows the table in the book
  const chapter = [
    "| Day | Range |",
    "|---|---|",
    "| Monday | 10 | 11 | 12 |",
    "| Tuesday | 12 | The market opened higher the next week. ^p-004",
  ].join("\n");

  assert.equal(
    shown(chapter),
    'table(tableRow(tableHeader(paragraph("Day")), tableHeader(paragraph("Range"))), ' +
      'tableRow(tableCell(paragraph("Monday")), tableCell(paragraph("10 11 12"))), ' +
      'tableRow(tableCell(paragraph("Tuesday")), tableCell(paragraph("12")))), ' +
      'paragraph("The market opened higher the next week.")'
  );
  assert.deepEqual(anchors(read(chapter)), ["table#p-004", "paragraph"]);
});

test("a superscript shows raised, so the price 96 29/32 does not read as 9629/32", () => {
  assert.equal(
    shown("Wheat sold at 96<sup>29</sup>/32 on the first day. ^p-001"),
    'paragraph("Wheat sold at 96", superscript("29"), "/32 on the first day.")'
  );
});

test("a quote keeps its anchor, and each block of a chapter keeps its own anchor", () => {
  const chapter = [
    "# Chapter 3: Prices",
    "Wheat is cheap. ^p-001",
    "> A quote from the book. ^p-002",
    "- One\n- Two ^p-003",
    "| A | B |\n|---|---|\n| 1 | 2 | ^p-004",
    "![Chart](assets/chart.png) ^p-005",
  ].join("\n\n");

  assert.deepEqual(anchors(read(chapter)), [
    "heading",
    "paragraph#p-001",
    "blockquote#p-002",
    "bulletList#p-003",
    "table#p-004",
    "paragraph#p-005",
  ]);
  assert.equal(shown("> A quote from the book. ^p-002"), 'blockquote(paragraph("A quote from the book."))');
});

test("a picture shows from the book's assets, with its caption as the alternative text", () => {
  const doc = read("![Figure 1: Chart](assets/chart.png) ^p-009");
  const image = doc.child(0).child(0);

  assert.equal(image.type.name, "image");
  assert.equal(image.attrs.src, "asset://book/assets/chart.png");
  assert.equal(image.attrs.alt, "Figure 1: Chart");
  assert.deepEqual(anchors(doc), ["paragraph#p-009"]);
});

test("asterisks between numbers stay text, and underscores make italics", () => {
  assert.equal(
    shown("The ratio 2 * 3 * 4 in the _old_ tables. ^p-001"),
    'paragraph("The ratio 2 * 3 * 4 in the ", italic("old"), " tables.")'
  );
});

test("the text of a book never becomes HTML: a tag without a mark is left out, and the words around it stay", () => {
  const chapter = [
    "Text with <script>alert(1)</script> a script, <img src=x onerror=alert(1)> a tag, " +
      "<span>kept words</span> and &lt;b&gt; as text. ^p-001",
    '<div onclick="steal()">Words in a box</div> ^p-002',
  ].join("\n\n");

  assert.equal(
    shown(chapter),
    'paragraph("Text with a script, a tag, kept words and <b> as text."), paragraph("Words in a box")'
  );
  assert.doesNotMatch(JSON.stringify(read(chapter).toJSON()), /onerror|onclick|alert|steal/);
});

test("a <sup> that the PDF import did not close raises no text", () => {
  assert.equal(
    shown("A caption<sup>**Figure 1.1** and the rest. ^p-001"),
    'paragraph("A caption", bold("Figure 1.1"), " and the rest.")'
  );
});

test("a heading and the text below it in one block show as a heading and a paragraph, without ## marks", () => {
  const chapter = "## BOOK II.\nOF THE NATURE OF STOCK.";

  assert.equal(shown(chapter), 'heading("BOOK II."), paragraph("OF THE NATURE OF STOCK.")');
  assert.equal(read(chapter).child(0).attrs.level, 2);
});

test("preformatted text of an EPUB book shows as a code block with its lines and its anchor, and no empty line", () => {
  // The EPUB import writes Markdown marks and blank lines of preformatted text as character references (IN-02)
  const doc = read("<pre>line &#42;one&#42;&#10;\n    line three &lt;b&gt; C:\\path\\*.txt</pre> ^p-007");

  assert.deepEqual(anchors(doc), ["codeBlock#p-007"]);
  assert.equal(doc.child(0).textContent, "line *one*\n\n    line three <b> C:\\path\\*.txt");
});

test("a footnote marker shows as a footnote button, and the footnote text leaves the chapter text", () => {
  const chapter = "A claim.[^1] And more. ^p-001\n\n[^1]: The note text. ^p-002";

  assert.equal(shown(chapter), 'paragraph("A claim.", footnoteRef, " And more.")');
  assert.deepEqual({ ...read(chapter).child(0).child(1).attrs }, { fnId: "1", number: "1" });
  assert.deepEqual(parseChapterMarkdown(chapter).footnotes, { "1": { id: "1", number: "1", text: "The note text." } });
});

test("line breaks and runs of spaces inside a paragraph show as one space, as before", () => {
  assert.equal(
    shown("  The first line\nand the second   line,\n**bold** at a line start. <span> </span> ^p-001"),
    'paragraph("The first line and the second line, ", bold("bold"), " at a line start.")'
  );
});

test("every kind of block of a chapter file fits the nodes of the reader", () => {
  const chapter = [
    "# Title",
    "Words with `code`, ~~struck~~, <mark>marked</mark>, <b>bold</b>, <b>**bold twice**</b>, **bold `code` inside** " +
      "and a [link](https://example.com). ^p-001",
    "- Item\n  - Inner item\n- ```\n  code in an item\n  ``` ^p-002",
    "1.\n2. Second ^p-003",
    "> Quote\n>\n> - list in a quote ^p-004",
    "| A |\n|---|\n|  | ^p-005",
    "---",
    "```js\nconst x = 1;\n``` ^p-006",
  ].join("\n\n");

  assert.deepEqual(anchors(read(chapter)), [
    "heading",
    "paragraph#p-001",
    "bulletList#p-002",
    "orderedList#p-003",
    "blockquote#p-004",
    "table#p-005",
    "horizontalRule",
    "codeBlock#p-006",
  ]);
});
