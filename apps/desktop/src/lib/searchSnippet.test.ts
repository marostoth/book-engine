import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HIT_END, HIT_START, snippetNodes, snippetParts } from "./searchSnippet.ts";

/** A snippet as the search sends it: `[` and `]` in `text` stand for the characters around a hit. */
function snippet(text: string): string {
  return text.replace(/\[/g, HIT_START).replace(/\]/g, HIT_END);
}

/** The HTML that React writes for a snippet in the search window. */
function windowHtml(text: string): string {
  return renderToStaticMarkup(createElement("div", null, snippetNodes(snippet(text))));
}

test("a tag in a search result shows as text, so it cannot run in the window", () => {
  assert.equal(
    windowHtml('Write <img src=x [onerror]="stolen=1"> as text.'),
    "<div>Write &lt;img src=x <mark>onerror</mark>=&quot;stolen=1&quot;&gt; as text.</div>",
  );
  assert.equal(windowHtml("So far, Water<Less [innovations] have saved"), "<div>So far, Water&lt;Less <mark>innovations</mark> have saved</div>");
});

test("the window marks each hit and nothing else", () => {
  assert.equal(windowHtml("...the [division] of [labour] raises output"), "<div>...the <mark>division</mark> of <mark>labour</mark> raises output</div>");
  assert.deepEqual(snippetParts(snippet("...the [division] of [labour] raises output")), [
    { text: "...the ", hit: false },
    { text: "division", hit: true },
    { text: " of ", hit: false },
    { text: "labour", hit: true },
    { text: " raises output", hit: false },
  ]);
  assert.deepEqual(snippetParts("No hit here."), [{ text: "No hit here.", hit: false }]);
  assert.deepEqual(snippetParts(""), []);
});

test("a hit with no end marks the rest of the snippet, and an end with no start marks nothing", () => {
  assert.deepEqual(snippetParts(snippet("the [open end")), [
    { text: "the ", hit: false },
    { text: "open end", hit: true },
  ]);
  assert.deepEqual(snippetParts(snippet("a stray] end, a [[double]] start")), [
    { text: "a stray end, a ", hit: false },
    { text: "double", hit: true },
    { text: " start", hit: false },
  ]);
});
