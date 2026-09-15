import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import { toAnchorAttribute } from "../../lib/anchors";

// Custom TipTap Paragraph node preserving paragraph anchors as HTML node attributes
export const AnchorParagraph = Paragraph.extend({
  name: "paragraph",
  addAttributes() {
    return {
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
    };
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
          element.textContent?.replace(/[\[\]]/g, "") ||
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
    const num = node.attrs.number || fnId;
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
      `[${num}]`,
    ];
  },
});
