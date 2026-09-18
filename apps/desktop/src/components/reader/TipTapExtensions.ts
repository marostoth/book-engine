import { Extension, Mark, Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import { toAnchorAttribute } from "../../lib/anchors.ts";
import { footnoteLabel } from "../../lib/readerText.ts";

/**
 * The blocks that keep the anchor of their block in the chapter file as `data-anchor="p-001"`. Only a paragraph had
 * the attribute, so a quote lost its anchor, and a list or a table had none to keep (RD-03).
 */
export const ANCHORED_BLOCKS = [
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "codeBlock",
  "horizontalRule",
  "table",
];

// The anchor of each block, kept as a node attribute
export const BlockAnchors = Extension.create({
  name: "blockAnchors",
  addGlobalAttributes() {
    return [
      {
        types: ANCHORED_BLOCKS,
        attributes: {
          anchor: {
            default: null,
            parseHTML: (element) => toAnchorAttribute(element.getAttribute("data-anchor")) ?? null,
            renderHTML: (attributes) => {
              if (!attributes.anchor) {
                return {};
              }
              return {
                "data-anchor": attributes.anchor,
              };
            },
          },
        },
      },
    ];
  },
});

// A superscript of the book, such as the 29 of a price 96<sup>29</sup>/32 (RD-03). A footnote marker is a FootnoteRef.
export const Superscript = Mark.create({
  name: "superscript",

  parseHTML() {
    return [
      {
        tag: "sup",
        getAttrs: (element) =>
          (element as HTMLElement).matches(".footnote-callout, [data-fn]") ? false : null,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes), 0];
  },
});

// Custom TipTap Footnote Reference node preserving elevated superscript citation tags
export const FootnoteRef = TiptapNode.create({
  name: "footnoteRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      fnId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-fn") || "",
        renderHTML: (attributes) => ({
          "data-fn": attributes.fnId,
        }),
      },
      number: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-fn") ||
          element.textContent?.replace(/[[\]]/g, "") ||
          "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "sup.footnote-callout",
      },
      {
        tag: "sup[data-fn]",
      },
      {
        tag: "span.footnote-callout",
      },
      {
        tag: "span[data-fn]",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const fnId = node.attrs.fnId || "1";
    return [
      "sup",
      mergeAttributes(
        {
          class:
            "footnote-callout text-xs align-super text-amber-700 dark:text-amber-400 font-sans font-semibold cursor-pointer hover:underline ml-0.5 select-none inline-block",
          "data-fn": fnId,
        },
        HTMLAttributes
      ),
      // The same text that a highlight saves for the marker (RD-02)
      footnoteLabel(node.attrs),
    ];
  },
});
