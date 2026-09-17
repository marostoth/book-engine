import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type DecorationAttrs } from "@tiptap/pm/view";
import { highlightRanges } from "../../lib/highlights.ts";
import type { HighlightItem } from "../../lib/types.ts";

/** The colors a highlight can show in (`index.css`). A highlight with any other color shows in yellow. */
const HIGHLIGHT_COLORS = new Set(["yellow", "amber", "emerald", "blue", "purple"]);

interface DrawnHighlights {
  highlights: HighlightItem[];
  decorations: DecorationSet;
}

export const readerHighlightsKey = new PluginKey<DrawnHighlights>("readerHighlights");

/** How a highlight shows: a `<mark>` with its id and its color. */
export function highlightAttributes(highlight: HighlightItem): DecorationAttrs {
  return {
    nodeName: "mark",
    class: "reader-highlight",
    "data-hl-id": highlight.id,
    "data-color": highlight.color && HIGHLIGHT_COLORS.has(highlight.color) ? highlight.color : "yellow",
  };
}

function decorationsOf(doc: ProseMirrorNode, highlights: HighlightItem[]): DecorationSet {
  const ranges = highlightRanges(doc, highlights);
  if (!ranges.length) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    ranges.map(({ highlight, from, to }) => Decoration.inline(from, to, highlightAttributes(highlight), { highlight }))
  );
}

/**
 * Draws the saved highlights over the text of the chapter (RD-02). A highlight is not a mark in the chapter document, so
 * it shows over bold text, footnote markers, blocks and Bionic reading, and a new highlight shows without the chapter
 * being parsed and set again. The highlights are drawn again for each new document, such as Bionic reading on or off.
 */
export function readerHighlightsPlugin(): Plugin<DrawnHighlights> {
  return new Plugin<DrawnHighlights>({
    key: readerHighlightsKey,
    state: {
      init: () => ({ highlights: [], decorations: DecorationSet.empty }),
      apply(tr, drawn, _oldState, newState) {
        const highlights: HighlightItem[] | undefined =
          tr.getMeta(readerHighlightsKey) ?? (tr.docChanged ? drawn.highlights : undefined);
        if (!highlights) return drawn;
        return { highlights, decorations: decorationsOf(newState.doc, highlights) };
      },
    },
    props: {
      decorations: (state) => readerHighlightsKey.getState(state)?.decorations,
    },
  });
}

export const ReaderHighlights = Extension.create({
  name: "readerHighlights",

  addProseMirrorPlugins() {
    return [readerHighlightsPlugin()];
  },
});

/** Shows these saved highlights over the chapter in the reader. */
export function showHighlights(editor: Editor, highlights: HighlightItem[]): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(readerHighlightsKey, highlights));
}
