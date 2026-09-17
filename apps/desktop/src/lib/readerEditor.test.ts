import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Editor, getSchema, mergeAttributes } from "@tiptap/core";
import { DOMSerializer, Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { readerExtensions } from "../components/reader/readerExtensions.ts";
import { readerEditorOptions, type ChapterClick } from "../components/reader/readerEditorOptions.ts";
import { parseChapterMarkdown } from "./markdown.ts";

/**
 * The first TipTap version whose `mergeAttributes` cannot turn a `__proto__` key into hidden page attributes
 * (advisory GHSA-cp6q-959q-f8rh, SEC-05). TipTap 2 holds the same fix from 2.27.3, but `npm audit` warns about every
 * 2.x version, so the app stays on 3.x.
 */
const FIXED_TIPTAP = [3, 30, 4];

const schema = getSchema(readerExtensions);

/** The lowest version that a plain range such as `^3.31.3` allows. */
function lowestVersion(range: string): number[] {
  const parts = /^[\^~]?(\d+)\.(\d+)\.(\d+)$/.exec(range.trim());
  assert.ok(parts, `a TipTap version must be plain, such as ^3.31.3, not ${range}`);
  return [Number(parts[1]), Number(parts[2]), Number(parts[3])];
}

function isAtLeast(version: number[], lowest: number[]): boolean {
  for (let part = 0; part < lowest.length; part++) {
    if (version[part] !== lowest[part]) return version[part] > lowest[part];
  }
  return true;
}

function readJson(file: string): Record<string, never> {
  return JSON.parse(fs.readFileSync(new URL(file, import.meta.url), "utf8"));
}

interface PageElement {
  nodeType: number;
  nodeName: string;
  attributes: string[];
  childNodes: PageElement[];
  setAttribute: (name: string, value: unknown) => void;
  setAttributeNS: (namespace: string, name: string, value: unknown) => void;
  appendChild: (child: PageElement) => PageElement;
}

/** A stand-in for the page, which keeps every attribute that ProseMirror sets. */
function pageElement(nodeName: string): PageElement {
  const element: PageElement = {
    nodeType: 1,
    nodeName,
    attributes: [],
    childNodes: [],
    setAttribute: (name, value) => element.attributes.push(`${nodeName} ${name}=${value}`),
    setAttributeNS: (_namespace, name, value) => element.attributes.push(`${nodeName} ${name}=${value}`),
    appendChild: (child) => {
      element.childNodes.push(child);
      return child;
    },
  };
  return element;
}

/** Every attribute that the reader sets on the page for this document, as `tag name=value`. */
function attributesDrawn(nodes: Schema, doc: ProseMirrorNode): string[] {
  const page = {
    createElement: pageElement,
    createElementNS: (_namespace: string, name: string) => pageElement(name),
    createTextNode: (text: string) => ({ nodeType: 3, nodeName: "#text", text }),
    createDocumentFragment: () => pageElement("#fragment"),
  };
  const drawn = DOMSerializer.fromSchema(nodes).serializeFragment(doc.content, {
    document: page as unknown as Document,
  }) as unknown as PageElement;

  const found: string[] = [];
  const walk = (element: PageElement) => {
    found.push(...(element.attributes ?? []));
    (element.childNodes ?? []).forEach(walk);
  };
  walk(drawn);
  return found;
}

test("every TipTap package of the app is 3.30.4 or later, the first version without the __proto__ hole (SEC-05)", () => {
  const dependencies: Record<string, string> = readJson("../../package.json").dependencies;
  const names = Object.keys(dependencies).filter((name) => name.startsWith("@tiptap/"));

  // The reader's nodes, marks and plugins come from `@tiptap/core` itself, so the app names the package it uses.
  assert.ok(names.includes("@tiptap/core"), "the app must name @tiptap/core in its dependencies");
  for (const name of names) {
    assert.ok(
      isAtLeast(lowestVersion(dependencies[name]), FIXED_TIPTAP),
      `${name} ${dependencies[name]} allows a TipTap older than ${FIXED_TIPTAP.join(".")}`
    );
  }
});

test("the app installs one @tiptap/core, 3.30.4 or later", () => {
  const packages: Record<string, { version: string }> = readJson("../../package-lock.json").packages;
  const installed = Object.entries(packages).filter(([place]) => place.endsWith("node_modules/@tiptap/core"));

  assert.equal(installed.length, 1, `@tiptap/core is installed ${installed.length} times`);
  for (const [place, entry] of installed) {
    assert.ok(
      isAtLeast(lowestVersion(entry.version), FIXED_TIPTAP),
      `${place} is TipTap ${entry.version}, older than ${FIXED_TIPTAP.join(".")}`
    );
  }
});

test("a __proto__ key in the attributes of an element sets no attribute on the page (GHSA-cp6q-959q-f8rh)", () => {
  // `JSON.parse` makes `__proto__` a key of the object, not its prototype, so it reaches TipTap as data.
  const attack = JSON.parse(
    '{"__proto__":{"data-canary":"present","src":"x-invalid://canary","onerror":"globalThis.wasHacked = true"}}'
  );
  const merged = mergeAttributes(attack);
  const picture = new Schema({
    nodes: { doc: { content: "image" }, image: { toDOM: () => ["img", merged] }, text: {} },
  });

  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
  assert.equal(merged.onerror, undefined);
  assert.equal(merged.src, undefined);
  // The key itself becomes one plain attribute that holds the text of the object, and nothing from inside it.
  assert.deepEqual(attributesDrawn(picture, picture.node("doc", null, [picture.node("image")])), [
    "img __proto__=[object Object]",
  ]);
});

test("the reader draws no attribute of a chapter document that its nodes and marks do not have", () => {
  const attack = '"__proto__":{"data-canary":"present","onerror":"globalThis.wasHacked = true"},"onclick":"alert(1)"';
  const chapter = JSON.parse(`{"type":"doc","content":[
    {"type":"heading","attrs":{${attack},"level":2,"anchor":"p-001"},"content":[{"type":"text","text":"Of the Price"}]},
    {"type":"paragraph","attrs":{${attack},"anchor":"p-002"},"content":[
      {"type":"text","text":"Corn","marks":[{"type":"highlight","attrs":{${attack},"color":"#fde68a"}}]},
      {"type":"footnoteRef","attrs":{${attack},"fnId":"1","number":"1"}},
      {"type":"image","attrs":{${attack},"src":"asset://book/fig.png","alt":"A figure"}}
    ]},
    {"type":"table","attrs":{${attack},"anchor":"p-003"},"content":[
      {"type":"tableRow","attrs":{${attack}},"content":[
        {"type":"tableCell","attrs":{${attack},"align":"right"},"content":[{"type":"paragraph","content":[{"type":"text","text":"10"}]}]}
      ]}
    ]}
  ]}`);
  const doc = schema.nodeFromJSON(chapter);
  doc.check();

  assert.deepEqual(attributesDrawn(schema, doc), [
    "h2 data-anchor=p-001",
    "p data-anchor=p-002",
    "mark data-color=#fde68a",
    "mark style=background-color: #fde68a; color: inherit",
    "sup class=footnote-callout text-xs align-super text-amber-700 dark:text-amber-400 font-sans font-semibold " +
      "cursor-pointer hover:underline ml-0.5 select-none inline-block",
    "sup data-fn=1",
    "img class=reader-image mx-auto my-6 rounded-lg shadow-md max-w-full border border-stone-200 dark:border-stone-800",
    "img src=asset://book/fig.png",
    "img alt=A figure",
    "table data-anchor=p-003",
    "td style=text-align: right",
  ]);
});

test("the reader shows only the nodes and marks that a chapter file uses", () => {
  // A newer TipTap can add parts to its starter kit, such as a link and an underline. The reader takes its nodes and
  // marks from the chapter files (RD-03), so each new one is a decision, not a surprise (SEC-05).
  assert.deepEqual(Object.keys(schema.nodes).sort(), [
    "blockquote", "bulletList", "codeBlock", "doc", "footnoteRef", "hardBreak", "heading", "horizontalRule",
    "image", "listItem", "orderedList", "paragraph", "table", "tableCell", "tableHeader", "tableRow", "text",
  ]);
  assert.deepEqual(Object.keys(schema.marks).sort(), [
    "bold", "code", "highlight", "italic", "strike", "superscript",
  ]);
});

test("the reader does not load the writing parts that the starter kit of TipTap 3 adds", () => {
  const editor = new Editor({
    extensions: readerExtensions,
    editable: false,
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });

  try {
    const loaded = editor.extensionManager.extensions.map((extension) => extension.name);
    for (const name of ["link", "underline", "listKeymap", "trailingNode"]) {
      assert.ok(!loaded.includes(name), `the reader loads ${name}, which a chapter file does not use (SEC-05)`);
    }
  } finally {
    editor.destroy();
  }
});

test("the plugins of the reader add nothing to a chapter, such as an empty paragraph after a table", () => {
  const editor = new Editor({
    extensions: readerExtensions,
    editable: false,
    // A document, because a text content would need a browser to be read.
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });

  try {
    for (const markdown of [
      "Before the table. ^p-001\n\n| A | B |\n|---|---|\n| 1 | 2 | ^p-002",
      "Before the list. ^p-001\n\n- one\n- two ^p-002",
      "# Only a heading ^p-001",
      "Only a paragraph. ^p-001",
    ]) {
      const doc = schema.nodeFromJSON(parseChapterMarkdown(markdown, (src) => src).doc);
      const state = EditorState.create({ doc, plugins: editor.extensionManager.plugins });
      const { state: next } = state.applyTransaction(state.tr.setMeta("readerEditorTest", true));

      assert.ok(
        next.doc.eq(doc),
        `the plugins changed a chapter that ends with a ${doc.lastChild?.type.name}: ` +
          `${doc.childCount} blocks became ${next.doc.childCount}`
      );
    }
  } finally {
    editor.destroy();
  }
});

/**
 * How TipTap decides, after every render of the reader, whether to set the options on the editor again: it walks the
 * keys of the options the component gives it and compares each one by identity, and it compares the extensions one by
 * one (`EditorInstanceManager.compareOptions` in `@tiptap/react`). One object that was built again therefore makes
 * the editor give ProseMirror the whole chapter state again (RD-06).
 */
function tiptapSetsOptionsAgain(ours: Record<string, unknown>, editors: Record<string, unknown>): boolean {
  const same = Object.keys(ours).every((key) => {
    if (key === "extensions") {
      const a = ours[key] as unknown[];
      const b = editors[key] as unknown[];
      return a.length === b.length && a.every((part, index) => part === b[index]);
    }
    return ours[key] === editors[key];
  });
  return !same;
}

const readSource = (file: string): string => fs.readFileSync(new URL(file, import.meta.url), "utf8");

test("the options of the reader's editor hold only the chapter's nodes, its look and its click handler", () => {
  const click: ChapterClick = () => false;
  const options = readerEditorOptions(click);

  assert.deepEqual(Object.keys(options).sort(), ["editable", "editorProps", "extensions"]);
  // The one list of nodes and marks, not a copy, so TipTap finds the extensions unchanged.
  assert.equal(options.extensions, readerExtensions);
  assert.equal(options.editable, false);
  assert.equal(options.editorProps?.handleClick, click);
  const attributes = options.editorProps?.attributes;
  assert.ok(attributes && typeof attributes === "object", "the chapter must have page attributes");
  assert.match(attributes.class, /select-text/);
});

test("TipTap sets no options again while the reader keeps one options object (RD-06)", () => {
  const click: ChapterClick = () => false;
  const options = readerEditorOptions(click);

  // What the reader does: it holds the options in a `useMemo`, so every render gives TipTap the same object.
  assert.equal(tiptapSetsOptionsAgain({ ...options }, { ...options, editable: false }), false);

  // What the reader did before: it built the options during the render, so `editorProps` was a new object each time.
  const built = readerEditorOptions(click);
  assert.equal(tiptapSetsOptionsAgain({ ...built }, { ...options }), true);
});

test("the reader builds the options of its editor once, and keeps no options of its own", () => {
  const reader = readSource("../components/Reader.tsx");

  assert.match(reader, /useMemo\(\(\) => readerEditorOptions\(handleChapterClick\), \[handleChapterClick\]\)/);
  assert.match(reader, /useEditor\(editorOptions\)/);
  for (const own of ["editorProps:", "extensions:", "editable:"]) {
    assert.ok(!reader.includes(own), `Reader.tsx holds \`${own}\` of its own, which TipTap sees as a change (RD-06)`);
  }
});

test("the reader is drawn again only for new props of its own, and gets no handler made during a render", () => {
  const reader = readSource("../components/Reader.tsx");
  assert.match(reader, /export const Reader = React\.memo\(ReaderView\);/);

  // A handler written inside the element would be a new function on every render of the app, and `React.memo` would
  // then never hold the chapter still.
  const app = readSource("../App.tsx");
  // The element itself, not a type such as `useState<ReaderPreferences>`.
  const start = /<Reader[\s>]/.exec(app)?.index ?? -1;
  assert.ok(start > 0, "App.tsx must show the reader");
  const element = app.slice(start, app.indexOf("/>", start));
  assert.ok(!element.includes("=>"), `App.tsx gives the reader a handler made during a render:\n${element}`);
});

test("the reader counts how far down a chapter it is through the progress ticker, not on its own", () => {
  const reader = readSource("../components/Reader.tsx");

  assert.match(reader, /progress\.changed\(container, chapter\)/);
  assert.ok(
    !reader.includes("Math.round"),
    "Reader.tsx counts a percent of its own, so every scroll event renders the app again (RD-06)"
  );
});
