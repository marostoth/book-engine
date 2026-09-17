import type { UseEditorOptions } from "@tiptap/react";
import type { EditorProps } from "@tiptap/pm/view";
import { readerExtensions } from "./readerExtensions.ts";

/**
 * The options the reader gives TipTap.
 *
 * TipTap looks at these after every render of the reader and compares each one by identity. One object that was built
 * again makes it set the options on the editor, and the editor then gives ProseMirror the whole chapter state again.
 * A scroll, a moved pane and a new setting all render the reader, so on a chapter of 51,000 words that work was done
 * again and again for nothing (RD-06).
 *
 * The reader therefore builds the options once, from a click handler that stays the same, and TipTap finds nothing
 * changed. `Reader.tsx` holds the options in a `useMemo`, and a test checks that the reader holds no options of its
 * own.
 */

/** The look of the chapter. The app turns text selection off everywhere, so the chapter turns it on again (RD-02). */
export const READER_CLASS =
  "reader-prose prose max-w-none select-text focus:outline-none font-serif text-lg leading-relaxed antialiased";

/** What a click in the chapter does: open a footnote, open a figure, or nothing. */
export type ChapterClick = NonNullable<EditorProps["handleClick"]>;

/** The options of the reader's editor. `handleClick` must be the same function on every render. */
export function readerEditorOptions(handleClick: ChapterClick): UseEditorOptions {
  return {
    extensions: readerExtensions,
    editorProps: {
      attributes: { class: READER_CLASS },
      handleClick,
    },
    editable: false,
  };
}
