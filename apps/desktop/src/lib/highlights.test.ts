import test from "node:test";
import assert from "node:assert/strict";
import type { HighlightItem } from "./types.ts";
import { toAnchorAttribute, toSavedAnchor } from "./anchors.ts";
import { findHighlightParagraph, parseHighlightsFromNotes } from "./highlights.ts";

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
