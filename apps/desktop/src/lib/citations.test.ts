import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getSchema } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { readerExtensions } from "../components/reader/readerExtensions.ts";
import { applyBionicReading } from "./bionic.ts";
import { citationAnchorAt, citationPlace, savedWord } from "./citations.ts";
import { parseChapterMarkdown } from "./markdown.ts";
import { readerText } from "./readerText.ts";

const schema = getSchema(readerExtensions);

/** A chapter document as the reader shows it, with Bionic reading on or off */
function chapter(markdown: string, bionic = false): ProseMirrorNode {
  const doc = parseChapterMarkdown(markdown).doc;
  const node = schema.nodeFromJSON(bionic ? applyBionicReading(doc) : doc);
  node.check();
  return node;
}

/** The anchor that the app cites when the reader selects `words` of the chapter. */
function citedAt(doc: ProseMirrorNode, words: string): string | undefined {
  const { text, positions } = readerText(doc);
  const at = text.indexOf(words);
  assert.notEqual(at, -1, `the chapter does not hold "${words}"`);
  return citationAnchorAt(doc, positions[at]);
}

/** A chapter of the book: a heading with no anchor of its own, and blocks of every kind that have one. */
const CHAPTER = [
  "The first paragraph of the chapter. ^p-001",
  "## Of the Division of Labour",
  "The first paragraph under the heading. ^p-002",
  "> A quote of the author. ^p-003",
  "- Corn is cheap\n- Wool is dear ^p-004",
  "| Good | Note |\n|---|---|\n| Salt | is taxed | ^p-005",
  "The last paragraph of the chapter. ^p-006",
].join("\n\n");

test("a citation from a heading names the text under the heading, not the first block of the chapter (RD-04)", () => {
  const doc = chapter(CHAPTER);

  // The app wrote ^p-001 for every passage with no anchor, which named "The first paragraph of the chapter".
  assert.equal(citedAt(doc, "Division of Labour"), "^p-002");
});

test("a citation names the anchor of the block that holds the words", () => {
  const doc = chapter(CHAPTER);

  assert.equal(citedAt(doc, "first paragraph of the chapter"), "^p-001");
  assert.equal(citedAt(doc, "first paragraph under"), "^p-002");
  assert.equal(citedAt(doc, "quote of the author"), "^p-003");
  assert.equal(citedAt(doc, "Corn is cheap"), "^p-004");
  assert.equal(citedAt(doc, "Wool is dear"), "^p-004");
  assert.equal(citedAt(doc, "is taxed"), "^p-005");
  assert.equal(citedAt(doc, "last paragraph"), "^p-006");
});

test("Bionic reading does not change the anchor that a citation names", () => {
  const doc = chapter(CHAPTER, true);

  assert.equal(citedAt(doc, "Division"), "^p-002");
  assert.equal(citedAt(doc, "Wool"), "^p-004");
  assert.equal(citedAt(doc, "last"), "^p-006");
});

test("the first heading of a chapter names the first block under it", () => {
  const doc = chapter("# The Wealth of Nations\n\nBook one starts here. ^p-001\n\nAnd goes on. ^p-002");

  assert.equal(citedAt(doc, "Wealth of Nations"), "^p-001");
});

test("a heading with no block under it names the block before it", () => {
  const doc = chapter("The end of the chapter. ^p-009\n\n## Notes");

  assert.equal(citedAt(doc, "Notes"), "^p-009");
});

test("the text that follows a heading in one block of the file keeps the anchor of that block", () => {
  // The import writes one block, and only the first node of a block keeps the anchor (`markdown.ts`), so the
  // paragraph "Labour is the price" has no anchor of its own. Its block holds ^p-008, and the block after it ^p-009.
  const doc = chapter("Trade needs money. ^p-007\n\n## Of Money\nLabour is the price. ^p-008\n\nCorn follows. ^p-009");

  assert.equal(citedAt(doc, "Of Money"), "^p-008");
  assert.equal(citedAt(doc, "Labour is the price"), "^p-008");
  assert.equal(citedAt(doc, "Corn follows"), "^p-009");
});

test("a chapter with no anchor cites no anchor, so the app saves the chapter alone", () => {
  const doc = chapter("# A chapter with no anchors\n\nThe import gave this chapter no anchor.");

  assert.equal(citedAt(doc, "no anchors"), undefined);
  assert.equal(citedAt(doc, "The import gave"), undefined);
  assert.equal(citationAnchorAt(schema.topNodeType.createAndFill()!, 0), undefined);
});

test("a saved word keeps the chapter and the anchor where it was read (RD-04)", () => {
  const found = { word: "quorum", definition: "A set of nodes that overlaps every other set." };

  assert.deepEqual(savedWord("Quorums", found, "ch-02.md", "^p-005", "2026-09-17T10:00:00.000Z"), {
    word: "quorum",
    definition: "A set of nodes that overlaps every other set.",
    chapterFile: "ch-02.md",
    anchor: "^p-005",
    savedAt: "2026-09-17T10:00:00.000Z",
  });

  // A word that the dictionary does not hold keeps the word of the book, and a word with no place keeps none.
  assert.deepEqual(savedWord(" Quorums ", null, undefined, undefined, "2026-09-17T10:00:00.000Z"), {
    word: "quorums",
    definition: "Vocabulary term:  Quorums ",
    chapterFile: "",
    anchor: "",
    savedAt: "2026-09-17T10:00:00.000Z",
  });
});

test("the place of a citation shows the chapter and the anchor, and the chapter alone without one", () => {
  assert.equal(citationPlace("ch-04.md", "^p-012"), "ch-04.md #^p-012");
  assert.equal(citationPlace("ch-04.md", ""), "ch-04.md");
  assert.equal(citationPlace("ch-04.md", "   "), "ch-04.md");
});

/**
 * The files that save a citation, a topic citation or a vocabulary word, or that open a chapter at a paragraph. The
 * guard below reads every file of the app, and this list only proves that the files that matter most are among them.
 */
const SAVING_FILES = [
  "../App.tsx",
  "../hooks/useAnalyticalModals.ts",
  "../components/analytical/TermModal.tsx",
  "../components/analytical/ArgumentBuilderModal.tsx",
  "../components/analytical/CritiqueModal.tsx",
  "../components/analytical/InquiryModal.tsx",
  "../components/syntopicon/ControversyModal.tsx",
  "../components/syntopicon/NeutralTermModal.tsx",
  "../components/elementary/LexiconPopover.tsx",
  "../components/inspectional/DipStream.tsx",
  "../components/reader/useReaderSelection.ts",
];

/**
 * Whether a line of code makes a paragraph anchor out of its own numbers: `^p-` and then a digit, an interpolation or
 * a join. The guard used to look for the one spelling `^p-001`, so `^p-00${premises.length + 2}` walked past it in a
 * file on its own list (RD-11). The caret is part of the shape: without it, `"p-3"` is a Tailwind class. A regular
 * expression that reads an anchor writes `\^p-\d`, where a backslash, not a digit, follows the dash.
 */
function makesAnAnchor(line: string): boolean {
  return /\^p-(?:\d|\$\{|["'`]\s*\+)/.test(line);
}

test("the guard knows a made-up anchor by its shape, not by one spelling of it (RD-11)", () => {
  assert.ok(makesAnAnchor('anchor: "^p-001",'), "the spelling RD-04 removed");
  assert.ok(makesAnAnchor("anchor: `^p-00${premises.length + 2}`,"), "the line RD-11 removed");
  assert.ok(makesAnAnchor('anchor: "^p-" + String(count),'), "an anchor joined from a number");
  assert.ok(makesAnAnchor("anchor: `(#^p-${count})`,"), "an anchor inside a longer text");

  assert.ok(!makesAnAnchor('anchor: "",'), "an empty anchor is the right answer, not a made-up one");
  assert.ok(!makesAnAnchor("const found = /^\\^p-\\d*/.exec(text);"), "a pattern that reads an anchor makes none");
  assert.ok(!makesAnAnchor('className="p-3 rounded"'), "a Tailwind class is not an anchor");
  assert.ok(!makesAnAnchor("anchor: toSavedAnchor(node.attrs.anchor),"), "an anchor read from the chapter is real");
});

/**
 * The sample book the browser-only dev mode shows in place of a real one. Its anchors are the anchors written at the
 * end of its own sample chapters in `mockData.ts`, so they name paragraphs that are there.
 */
const SAMPLE_BOOK = "lib/api/dev/";

test("no file of the app makes up a paragraph anchor (RD-04, RD-11)", () => {
  const src = new URL("../", import.meta.url);
  const files = fs
    .readdirSync(src, { recursive: true, encoding: "utf8" })
    .map((file) => file.replace(/\\/g, "/"))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.startsWith(SAMPLE_BOOK));

  // A walk that reads nothing finds nothing, so the guard first proves it reached the files that save a citation.
  for (const file of SAVING_FILES) {
    assert.ok(files.includes(file.replace("../", "")), `the guard never read ${file}`);
  }
  assert.ok(files.length > 100, `the guard read only ${files.length} files`);

  const madeUp = files.flatMap((file) =>
    fs
      .readFileSync(new URL(file, src), "utf8")
      .split("\n")
      .map((line, index) => ({ at: `${file}:${index + 1}`, line: line.trim() }))
      // A comment saves nothing, and a placeholder only shows the form of an anchor in a field that stays empty.
      .filter(({ line }) => !line.startsWith("//") && !line.startsWith("/*") && !line.startsWith("*"))
      .filter(({ line }) => !line.includes("placeholder"))
      .filter(({ line }) => makesAnAnchor(line))
      .map(({ at, line }) => `${at}  ${line}`)
  );

  assert.deepEqual(madeUp, [], "a file writes an anchor of its own");
});
