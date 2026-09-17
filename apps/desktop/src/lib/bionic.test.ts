import test from "node:test";
import assert from "node:assert/strict";
import { getSchema, type JSONContent } from "@tiptap/core";
import { readerExtensions } from "../components/reader/readerExtensions.ts";
import { applyBionicReading } from "./bionic.ts";
import { parseChapterMarkdown } from "./markdown.ts";

const schema = getSchema(readerExtensions);

/** The chapter as the reader shows it with Bionic reading on, such as `paragraph(bold("Rea"), "ding")` */
function shownBionic(markdown: string): string {
  const doc: JSONContent = applyBionicReading(parseChapterMarkdown(markdown).doc);
  const node = schema.nodeFromJSON(doc);
  node.check();
  return node.content.toString().replace(/^<|>$/g, "");
}

test("Bionic reading makes the first letters of each word bold", () => {
  assert.equal(
    shownBionic("Reading faster, a book. ^p-001"),
    'paragraph(bold("Rea"), "ding ", bold("fa"), "ster, ", bold("a"), " ", bold("bo"), "ok.")'
  );
});

test("Bionic reading also works in lists, tables and quotes, and bold text gets no second bold mark", () => {
  assert.equal(
    shownBionic("- **Wool** is dear ^p-001\n\n| Salt |\n|---|\n| tax | ^p-002\n\n> Quote ^p-003"),
    'bulletList(listItem(paragraph(bold("Wool"), " ", bold("i"), "s ", bold("de"), "ar"))), ' +
      'table(tableRow(tableHeader(paragraph(bold("Sa"), "lt"))), tableRow(tableCell(paragraph(bold("t"), "ax")))), ' +
      'blockquote(paragraph(bold("Qu"), "ote"))'
  );
});

test("Bionic reading leaves code, superscripts, footnote markers and code blocks as they are", () => {
  assert.equal(
    shownBionic("Price 96<sup>29</sup> of `code`.[^1] ^p-001\n\n<pre>let code = 1</pre> ^p-002\n\n[^1]: Note ^p-003"),
    'paragraph(bold("Pr"), "ice ", bold("9"), "6", superscript("29"), " ", bold("o"), "f ", ' +
      'code("code"), ".", footnoteRef), ' +
      'codeBlock("let code = 1")'
  );
});
