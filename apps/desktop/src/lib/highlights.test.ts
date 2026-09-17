import test from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import type { HighlightItem } from "./types.ts";
import { readerExtensions } from "../components/reader/readerExtensions.ts";
import {
  highlightAttributes,
  readerHighlightsKey,
  readerHighlightsPlugin,
} from "../components/reader/ReaderHighlights.ts";
import { toAnchorAttribute, toSavedAnchor } from "./anchors.ts";
import { applyBionicReading } from "./bionic.ts";
import { createHighlight, parseHighlightsFromNotes } from "./highlights.ts";
import { parseChapterMarkdown } from "./markdown.ts";

const PHRASE = "the division of labour";

// Three paragraphs that hold the same words, each with its anchor
const THREE_PARAGRAPHS = [
  "Smith opens with the division of labour in a pin factory. ^p-001",
  "Money makes the division of labour possible between trades. ^p-002",
  "The extent of the market limits the division of labour in each town. ^p-003",
].join("\n\n");

const schema = getSchema(readerExtensions);

/** A chapter document as the reader shows it, with Bionic reading on or off */
function chapter(markdown: string, bionic = false): ProseMirrorNode {
  const doc = parseChapterMarkdown(markdown).doc;
  const node = schema.nodeFromJSON(bionic ? applyBionicReading(doc) : doc);
  node.check();
  return node;
}

/**
 * The text on the screen, with the document position before each character: a block starts a new line, a line break is
 * a new line, and a footnote marker shows its number in brackets.
 */
function screen(doc: ProseMirrorNode): { text: string; positions: number[] } {
  let text = "";
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    let shown = "";
    if (node.isText) shown = node.text ?? "";
    else if (node.type.name === "footnoteRef") shown = `[${node.attrs.number}]`;
    else if (node.type.name === "hardBreak" || (node.isTextblock && text)) shown = "\n";
    for (let index = 0; index < shown.length; index++) positions.push(node.isText ? pos + index : pos);
    text += shown;
  });
  return { text, positions };
}

/** The anchor of the nearest block at or above a position, in the saved form, as a selection reads it from `data-anchor` */
function anchorAt(doc: ProseMirrorNode, position: number): string | undefined {
  const place = doc.resolve(position);
  for (let depth = place.depth; depth > 0; depth--) {
    const anchor = toSavedAnchor(place.node(depth).attrs.anchor);
    if (anchor) return anchor;
  }
  return undefined;
}

/**
 * Selects copy number `copy` of `words` on the screen and highlights it, as the reader does. The highlights file holds
 * exactly the saved list (DS-05), so a save and a load is a JSON round trip.
 */
function select(doc: ProseMirrorNode, words: string, copy = 1): HighlightItem {
  const { text, positions } = screen(doc);
  let at = -1;
  for (let found = 0; found < copy; found++) {
    at = text.indexOf(words, at + 1);
    assert.notEqual(at, -1, `copy ${copy} of "${words}" is on the screen`);
  }
  const from = positions[at];
  const highlight = createHighlight(doc, from, positions[at + words.length - 1] + 1, anchorAt(doc, from));
  assert.ok(highlight, `a selection of "${words}" makes a highlight`);
  return JSON.parse(JSON.stringify(highlight));
}

/** A highlight as the highlights file holds it */
function saved(exact: string, anchor?: string, prefix = "", suffix = ""): HighlightItem {
  return { id: `hl-${exact}`, exact, prefix, suffix, anchor, color: "yellow", createdAt: "2026-09-17T00:00:00.000Z" };
}

/** What the reader draws over the chapter for these highlights */
function drawn(doc: ProseMirrorNode, highlights: HighlightItem[]) {
  const state = EditorState.create({ doc, plugins: [readerHighlightsPlugin()] });
  const next = state.apply(state.tr.setMeta(readerHighlightsKey, highlights));
  return readerHighlightsKey.getState(next)?.decorations.find() ?? [];
}

/**
 * The screen with « before and » after the text of each highlight that the reader draws. Two highlights over the same
 * words give two pairs: "the division" and "division of labour" show as «the «division» of labour».
 */
function shown(doc: ProseMirrorNode, highlights: HighlightItem[]): string {
  const { text, positions } = screen(doc);
  const opens = new Array<number>(text.length + 1).fill(0);
  const closes = new Array<number>(text.length + 1).fill(0);
  for (const { from, to } of drawn(doc, highlights)) {
    const covered = positions.flatMap((position, index) => (from <= position && position < to ? [index] : []));
    if (!covered.length) continue;
    opens[covered[0]]++;
    closes[covered[covered.length - 1] + 1]++;
  }
  let result = "";
  for (let index = 0; index <= text.length; index++) {
    result += "»".repeat(closes[index]) + "«".repeat(opens[index]) + (text[index] ?? "");
  }
  return result;
}

/** The line of the screen that shows a highlight, or -1 */
function highlightedLine(doc: ProseMirrorNode, highlight: HighlightItem): number {
  return shown(doc, [highlight]).split("\n").findIndex((line) => line.includes("«"));
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
  const doc = chapter(THREE_PARAGRAPHS);
  const selected = [1, 2, 3].map((copy) => select(doc, PHRASE, copy));

  assert.deepEqual(selected.map((highlight) => highlight.anchor), ["^p-001", "^p-002", "^p-003"]);
  assert.deepEqual(selected.map((highlight) => highlightedLine(doc, highlight)), [0, 1, 2]);
});

test("a chapter still holding its highlights in the old notes comment is read back in full", () => {
  const notes = [
    "# Chapter 1 notes",
    "",
    "## Highlights",
    "",
    `<!-- highlights-json ${JSON.stringify([saved(PHRASE, "^p-001"), saved(PHRASE, "^p-003")])} -->`,
  ].join("\n");

  assert.deepEqual(
    parseHighlightsFromNotes(notes).map((highlight) => highlight.anchor),
    ["^p-001", "^p-003"]
  );
});

test("a highlight stored with anchor ^p-003 goes on paragraph 3, not on the first paragraph with the same words", () => {
  assert.equal(
    shown(chapter(THREE_PARAGRAPHS), [saved(PHRASE, "^p-003")]),
    "Smith opens with the division of labour in a pin factory.\n" +
      "Money makes the division of labour possible between trades.\n" +
      "The extent of the market limits «the division of labour» in each town."
  );
});

test("without a usable anchor, a highlight goes on the first paragraph with its words", () => {
  const doc = chapter(THREE_PARAGRAPHS);

  assert.equal(highlightedLine(doc, saved(PHRASE)), 0, "no anchor");
  assert.equal(highlightedLine(doc, saved(PHRASE, "^p-099")), 0, "anchor not in chapter");
  assert.equal(highlightedLine(doc, saved("pin factory", "^p-003")), 0, "paragraph was edited");
  assert.equal(highlightedLine(doc, saved("not in this chapter", "^p-001")), -1, "quote not found");
});

test("when the text around a highlight changed, the anchor still names its paragraph, and else the best match wins", () => {
  const doc = chapter(
    [
      "At York, wool is dear to the weavers. ^p-001",
      "In Hull, wool is dear to the dyers. ^p-002",
      "At York, wool is dear to the weavers. ^p-003",
    ].join("\n\n")
  );
  // Saved before "In York" became "At York"
  const changed = (anchor?: string) => saved("wool is dear", anchor, "In York, ", " to the weavers.");

  assert.equal(highlightedLine(doc, changed("^p-003")), 2, "the paragraph of the anchor");
  assert.equal(highlightedLine(doc, changed("^p-002")), 1, "the paragraph of the anchor, though another matches better");
  assert.equal(highlightedLine(doc, changed()), 0, "no anchor: the first of the two best matches");
  assert.equal(highlightedLine(doc, changed("^p-099")), 0, "anchor not in chapter: the first of the two best matches");
});

test("a quote holding --> is still read from a chapter that was not moved over yet", () => {
  const withArrow = saved("the arrow --> points right", "^p-001");
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

test("a highlight in a list item or a table cell shows there, found by the anchor of its list or table", () => {
  const doc = chapter("- Corn is cheap\n- Wool is dear ^p-001\n\n| Good | Note |\n|---|---|\n| Wool | is dear | ^p-002");

  assert.equal(
    shown(doc, [saved("is dear", "^p-002"), saved("Corn is", "^p-001")]),
    "«Corn is» cheap\nWool is dear\nGood\nNote\nWool\n«is dear»"
  );
});

// RD-02: the reader draws a highlight over the text, so it shows wherever its words are on the screen

test("a highlight over bold or italic text shows on all of its words", () => {
  const doc = chapter("In distributed computing, **linearizability** is defined as a strong _consistency_ guarantee. ^p-001");

  assert.equal(
    shown(doc, [select(doc, "linearizability is defined as a strong consistency")]),
    "In distributed computing, «linearizability is defined as a strong consistency» guarantee."
  );
});

test("a highlight over a footnote marker shows, with the marker", () => {
  const doc = chapter("Operations appear to execute atomically.[^1] Clocks drift apart. ^p-001\n\n[^1]: Herlihy and Wing. ^p-002");

  assert.equal(
    shown(doc, [select(doc, "atomically.[1] Clocks")]),
    "Operations appear to execute «atomically.[1] Clocks» drift apart."
  );

  // A highlight can also end with the marker
  const endsWithMarker = select(doc, "execute atomically.[1]");
  assert.equal(endsWithMarker.exact, "execute atomically.[1]");
  assert.equal(shown(doc, [endsWithMarker]), "Operations appear to «execute atomically.[1]» Clocks drift apart.");
});

test("a highlight over two paragraphs, two list items or a <br> line break shows on every part", () => {
  const doc = chapter(
    "The first paragraph ends here. ^p-001\n\nThe second one starts here. ^p-002\n\n" +
      "- Corn is cheap\n- Wool is dear ^p-003\n\n| Goods |\n|---|\n| Salt<br>Iron | ^p-004"
  );

  assert.equal(
    shown(doc, [select(doc, "ends here.\nThe second"), select(doc, "cheap\nWool"), select(doc, "Salt\nIron")]),
    "The first paragraph «ends here.\nThe second» one starts here.\n" + "Corn is «cheap\nWool» is dear\nGoods\n«Salt\nIron»"
  );
});

test("a highlight over a line break of the chapter file shows", () => {
  const doc = chapter("A long line of the book\nwraps onto the next line. ^p-001");

  assert.equal(shown(doc, [select(doc, "book wraps")]), "A long line of the «book wraps» onto the next line.");
});

test("with Bionic reading on, a highlight shows, also one saved with Bionic reading off", () => {
  const markdown = "Smith opens with the division of labour in a pin factory. ^p-001";
  const plain = chapter(markdown);
  const bionic = chapter(markdown, true);

  assert.equal(
    shown(bionic, [select(plain, "division of labour")]),
    "Smith opens with the «division of labour» in a pin factory."
  );
  assert.equal(shown(bionic, [select(bionic, "opens")]), "Smith «opens» with the division of labour in a pin factory.");
  assert.equal(shown(plain, [select(bionic, "pin factory")]), "Smith opens with the division of labour in a «pin factory».");
});

test("words that the chapter holds more than once show on the copy that was selected", () => {
  const doc = chapter("The price of corn rises when the price of corn falls short, and the price of corn abroad is high. ^p-001");
  assert.equal(
    shown(doc, [select(doc, "the price of corn", 2)]),
    "The price of corn rises when the price of corn falls short, and «the price of corn» abroad is high."
  );

  // Only the words before the copies are different
  const before = chapter(
    "In York, wool is dear to every merchant who trades there. In Leeds, wool is dear to every merchant who trades there. ^p-001"
  );
  assert.equal(
    shown(before, [select(before, "wool", 2)]),
    "In York, wool is dear to every merchant who trades there. In Leeds, «wool» is dear to every merchant who trades there."
  );

  // Only the words after the copies are different
  const after = chapter(
    "Every merchant in the town said: wool is dear in York. Every merchant in the town said: wool is dear in Leeds. ^p-001"
  );
  assert.equal(
    shown(after, [select(after, "wool is dear", 2)]),
    "Every merchant in the town said: wool is dear in York. Every merchant in the town said: «wool is dear» in Leeds."
  );

  // A heading has no anchor, so only the words around the copies tell them apart
  const heading = chapter("## In York wool is dear, and in Leeds wool is dear\n\nWool is cheap in Hull. ^p-001");
  assert.equal(
    shown(heading, [select(heading, "wool is dear", 2)]),
    "In York wool is dear, and in Leeds «wool is dear»\nWool is cheap in Hull."
  );
});

test("a selection saves its words and up to 32 characters before and after them, also from the block before", () => {
  const doc = chapter("Money makes trade. ^p-001\n\nThe extent of the market limits the division of labour. ^p-002");
  const { exact, prefix, suffix, anchor, color } = select(doc, "The extent");

  assert.deepEqual(
    { exact, prefix, suffix, anchor, color },
    { exact: "The extent", prefix: "Money makes trade.\n", suffix: " of the market limits the divisi", anchor: "^p-002", color: "yellow" }
  );

  // A new block, a line break and a footnote marker are saved as the screen shows them
  const marks = chapter("Wool is dear.[^1] ^p-001\n\n| Goods |\n|---|\n| Salt<br>Iron | ^p-002\n\n[^1]: A note. ^p-003");
  assert.equal(select(marks, "dear.[1]\nGoods\nSalt\nIron").exact, "dear.[1]\nGoods\nSalt\nIron");
});

test("a selection saves no white space at the ends of its words, and white space alone saves no highlight", () => {
  const doc = chapter("Corn is cheap. ^p-001\n\nWool is dear. ^p-002");
  const { text, positions } = screen(doc);
  const at = text.indexOf(" cheap.\n");
  const wool = text.indexOf("Wool");

  assert.equal(createHighlight(doc, positions[at], positions[wool])?.exact, "cheap.");
  assert.equal(createHighlight(doc, positions[wool - 2] + 1, positions[wool]), null);
});

test("a highlight saved by an older version shows on its words, with other white space or none between two blocks", () => {
  // The saved highlight of the sample book: its words run over a bold word
  const sample = chapter(
    "In distributed computing, **linearizability** is defined as a strong consistency guarantee where all operations " +
      "appear to execute atomically at a specific point in time between their invocation and response.[^1] ^p-001\n\n" +
      "[^1]: Herlihy, M. P., & Wing, J. M. (1990). ^p-002"
  );
  const old: HighlightItem = {
    id: "hl-sample-01",
    exact: "linearizability is defined as a strong consistency guarantee where all operations appear to execute atomically",
    prefix: "In distributed computing, ",
    suffix: " at a specific point in time",
    anchor: "^p-001",
    color: "amber",
    createdAt: "2026-09-11T12:00:00Z",
  };
  assert.equal(
    shown(sample, [old]),
    "In distributed computing, «linearizability is defined as a strong consistency guarantee where all operations " +
      "appear to execute atomically» at a specific point in time between their invocation and response.[1]"
  );

  const doc = chapter("The first paragraph ends here. ^p-001\n\nThe second one starts here. ^p-002");
  assert.equal(shown(doc, [saved("ends here.The second", "^p-001")]), "The first paragraph «ends here.\nThe second» one starts here.");
  assert.equal(shown(doc, [saved("first  paragraph\nends", "^p-001")]), "The «first paragraph ends» here.\nThe second one starts here.");
});

test("two highlights over the same words both show", () => {
  const doc = chapter("Smith opens with the division of labour in a pin factory. ^p-001");

  assert.equal(
    shown(doc, [select(doc, "the division"), select(doc, "division of labour")]),
    "Smith opens with «the «division» of labour» in a pin factory."
  );
});

test("a highlight in code or in a code block shows", () => {
  const doc = chapter("Some `wool` code. ^p-001\n\n<pre>let wool = 1</pre> ^p-002");

  assert.equal(shown(doc, [select(doc, "wool"), select(doc, "let wool")]), "Some «wool» code.\n«let wool» = 1");
});

test("the highlights are drawn again on a new document, such as the next chapter", () => {
  const first = chapter("Wool is dear. ^p-001");
  const next = chapter("Corn is cheap, and wool is dear. ^p-001");
  let state = EditorState.create({ doc: first, plugins: [readerHighlightsPlugin()] });
  state = state.apply(state.tr.setMeta(readerHighlightsKey, [saved("wool is dear", "^p-001")]));
  state = state.apply(state.tr.replaceWith(0, state.doc.content.size, next.content));

  const decorations = readerHighlightsKey.getState(state)?.decorations.find() ?? [];
  assert.deepEqual(
    decorations.map(({ from, to }) => state.doc.textBetween(from, to)),
    ["wool is dear"]
  );
});

test("a highlight whose words left the chapter shows nowhere, and the other highlights still show", () => {
  const doc = chapter("Wool is dear. ^p-001\n\nCorn is cheap. ^p-002");

  assert.equal(shown(doc, [saved("Salt is taxed", "^p-001"), saved("Corn", "^p-002")]), "Wool is dear.\n«Corn» is cheap.");
});

test("a highlight shows with its id and in its own color, and any other color shows in yellow", () => {
  const doc = chapter("Wool is dear. ^p-001");
  const highlight: HighlightItem = { ...select(doc, "Wool"), id: "hl-1", color: "emerald" };

  assert.deepEqual(drawn(doc, [highlight]).map((decoration) => decoration.spec.highlight?.id), ["hl-1"]);
  assert.deepEqual(highlightAttributes(highlight), {
    nodeName: "mark",
    class: "reader-highlight",
    "data-hl-id": "hl-1",
    "data-color": "emerald",
  });
  assert.equal(highlightAttributes({ ...highlight, color: "red; background: url(x)" })["data-color"], "yellow");
  assert.equal(highlightAttributes({ ...highlight, color: undefined })["data-color"], "yellow");
});
