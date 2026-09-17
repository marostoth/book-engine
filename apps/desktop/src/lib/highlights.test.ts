import test from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import type { HighlightItem } from "./types.ts";
import { readerExtensions } from "../components/reader/readerExtensions.ts";
import { toAnchorAttribute, toSavedAnchor } from "./anchors.ts";
import { applyHighlightsToDoc, findHighlightParagraph, parseHighlightsFromNotes } from "./highlights.ts";
import { parseChapterMarkdown } from "./markdown.ts";

const PHRASE = "the division of labour";

// A chapter as markdown.ts renders it: every paragraph has `data-anchor` in the attribute form "p-001".
const chapter = [
  { anchor: "p-001", text: "Smith opens with the division of labour in a pin factory." },
  { anchor: "p-002", text: "Money makes the division of labour possible between trades." },
  { anchor: "p-003", text: "The extent of the market limits the division of labour in each town." },
];

// Selecting text in a paragraph saves that paragraph's anchor, as useReaderSelection does.
function selectInParagraph(index: number, exact: string): HighlightItem {
  return {
    id: `hl-${index + 1}`,
    exact,
    prefix: "",
    suffix: "",
    anchor: toSavedAnchor(chapter[index].anchor),
    color: "yellow",
    createdAt: "2026-09-15T00:00:00.000Z",
  };
}

test("the saved anchor ^p-001 and the HTML attribute p-001 name the same paragraph", () => {
  assert.equal(toSavedAnchor("p-001"), "^p-001");
  assert.equal(toSavedAnchor("^p-001"), "^p-001");
  assert.equal(toAnchorAttribute("^p-001"), "p-001");
  assert.equal(toAnchorAttribute("§p-001"), "p-001");
  assert.equal(toAnchorAttribute("p-001"), "p-001");
  for (const notAnAnchor of [undefined, null, "", "p-", "^^p-001", 'p-001"]']) {
    assert.equal(toAnchorAttribute(notAnAnchor), undefined, String(notAnAnchor));
  }
});

test("select, save, reload: each highlight comes back on the paragraph where it was selected", () => {
  const selected = chapter.map((_, index) => selectInParagraph(index, PHRASE));
  // The highlights file holds exactly this list (DS-05), so a save and a load is a JSON round trip.
  const reloaded: HighlightItem[] = JSON.parse(JSON.stringify(selected));

  assert.deepEqual(reloaded.map((highlight) => highlight.anchor), ["^p-001", "^p-002", "^p-003"]);
  assert.deepEqual(reloaded.map((highlight) => findHighlightParagraph(chapter, highlight)), [0, 1, 2]);
});

test("a chapter still holding its highlights in the old notes comment is read back in full", () => {
  const notes = [
    "# Chapter 1 notes",
    "",
    "## Highlights",
    "",
    `<!-- highlights-json ${JSON.stringify([selectInParagraph(0, PHRASE), selectInParagraph(2, PHRASE)])} -->`,
  ].join("\n");

  assert.deepEqual(
    parseHighlightsFromNotes(notes).map((highlight) => highlight.anchor),
    ["^p-001", "^p-003"]
  );
});

test("a highlight stored with anchor ^p-003 goes on paragraph 3, not on the first paragraph with the same words", () => {
  assert.equal(findHighlightParagraph(chapter, { exact: PHRASE, anchor: "^p-003" }), 2);
});

test("without a usable anchor, a highlight goes on the first paragraph with its words", () => {
  assert.equal(findHighlightParagraph(chapter, { exact: PHRASE }), 0, "no anchor");
  assert.equal(findHighlightParagraph(chapter, { exact: PHRASE, anchor: "^p-099" }), 0, "anchor not in chapter");
  assert.equal(findHighlightParagraph(chapter, { exact: "pin factory", anchor: "^p-003" }), 0, "paragraph was edited");
  assert.equal(findHighlightParagraph(chapter, { exact: "not in this chapter", anchor: "^p-001" }), -1, "quote not found");
});

test("a quote holding --> is still read from a chapter that was not moved over yet", () => {
  const withArrow: HighlightItem = { ...selectInParagraph(0, "the arrow --> points right") };
  const notes = `# Chapter 1 notes\n\n## Highlights\n\n<!-- highlights-json ${JSON.stringify([withArrow])} -->\n`;

  const parsed = parseHighlightsFromNotes(notes);

  assert.equal(parsed.length, 1, "a quote with an arrow must not hide the whole list");
  assert.equal(parsed[0].exact, "the arrow --> points right");
});

test("text after the old comment is never read as part of the list", () => {
  const notes = "# Chapter 1 notes\n\n<!-- highlights-json [] -->\n\n- a line with [ and ] in it\n";

  assert.deepEqual(parseHighlightsFromNotes(notes), []);
});

test("a list that is really damaged reads as no highlights, and nothing else", () => {
  const notes = '# Chapter 1 notes\n\n<!-- highlights-json [{"id":"hl-1","exact":"cut off -->\n\n- my own line\n';

  assert.deepEqual(parseHighlightsFromNotes(notes), []);
});

// The chapter document of the reader (RD-03), with the highlight marks as the reader shows them
const schema = getSchema(readerExtensions);

function shownWithHighlights(markdown: string, highlights: HighlightItem[]): string {
  const doc = applyHighlightsToDoc(parseChapterMarkdown(markdown).doc, highlights);
  const node = schema.nodeFromJSON(doc);
  node.check();
  return node.content.toString().replace(/^<|>$/g, "");
}

function saved(exact: string, anchor?: string): HighlightItem {
  return { id: `hl-${exact}`, exact, prefix: "", suffix: "", anchor, createdAt: "2026-09-17T00:00:00.000Z" };
}

test("a highlight shows on the paragraph of its anchor, not on the first paragraph with the same words", () => {
  const markdown = chapter.map((paragraph) => `${paragraph.text} ^${paragraph.anchor}`).join("\n\n");

  assert.equal(
    shownWithHighlights(markdown, [saved(PHRASE, "^p-003")]),
    'paragraph("Smith opens with the division of labour in a pin factory."), ' +
      'paragraph("Money makes the division of labour possible between trades."), ' +
      'paragraph("The extent of the market limits ", highlight("the division of labour"), " in each town.")'
  );
});

test("a highlight in a list item or a table cell shows there, found by the anchor of its list or table", () => {
  const markdown = "- Corn is cheap\n- Wool is dear ^p-001\n\n| Good | Note |\n|---|---|\n| Wool | is dear | ^p-002";

  assert.equal(
    shownWithHighlights(markdown, [saved("is dear", "^p-002"), saved("Corn is", "^p-001")]),
    'bulletList(listItem(paragraph(highlight("Corn is"), " cheap")), listItem(paragraph("Wool is dear"))), ' +
      'table(tableRow(tableHeader(paragraph("Good")), tableHeader(paragraph("Note"))), ' +
      'tableRow(tableCell(paragraph("Wool")), tableCell(paragraph(highlight("is dear")))))'
  );
});

test("a highlight keeps the marks of its text, and one found only in a heading still shows", () => {
  assert.equal(
    shownWithHighlights("# The Wool Trade\n\nSome **bold words** here. ^p-001", [saved("bold"), saved("Wool Trade")]),
    'heading("The ", highlight("Wool Trade")), paragraph("Some ", bold(highlight("bold")), bold(" words"), " here.")'
  );
});

test("a highlight whose words are in code keeps the chapter document valid, with no mark in the code", () => {
  assert.equal(
    shownWithHighlights("Some `wool` code. ^p-001\n\n<pre>let wool = 1</pre> ^p-002", [saved("wool"), saved("wool")]),
    'paragraph("Some ", code("wool"), " code."), codeBlock("let wool = 1")'
  );
});
