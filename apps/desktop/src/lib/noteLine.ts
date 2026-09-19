/**
 * What the notes drawer shows for one line of a chapter's notes (RD-08).
 *
 * This is the TypeScript half of one rule. The other half is `note_text_and_anchor` in
 * `src-tauri/src/vault/notes.rs`, which answers inside the app; this one answers in browser dev mode, through
 * `notesAggregator.ts` and the stand-in under `lib/api/dev/`.
 *
 * Both halves used to be wrong, and wrong DIFFERENTLY. The pane writes a saved quote as
 * `> "the sentence" (#^p-001)`; Rust showed `> "the sentence" (#`, and this file showed `> "the sentence" (#)`.
 * Each stripped only `-`, `*` and `•`, so the blockquote marker stayed, and neither cleaned up the bracket the
 * anchor left behind. Nothing compared the two, and nothing tested either.
 *
 * `packages/ingestion/tests/test_one_note_format.py` now holds all three files — the writer, this reader and the
 * Rust reader — to the same answers, so a change to one of them cannot pass alone.
 */

/** The markers that start a line of Markdown but say nothing the drawer has to show. */
const LINE_MARKERS = ["-", "*", "•", ">"];

/** Quote marks that come in pairs, so `He said "value" once` keeps both of its own. */
const QUOTE_PAIRS: [string, string][] = [
  ['"', '"'],
  ["“", "”"],
  ["'", "'"],
  ["‘", "’"],
];

/** The label the pane writes above the empty line it leaves for the reader's own thought. */
const REFLECTION_LABEL = "reflection:";

/** One note line, ready for the drawer: the words to show, and the paragraph anchor kept apart from them. */
export interface NoteLine {
  text: string;
  anchor?: string;
}

/** `text` without one matching pair of quote marks around the whole of it. */
function withoutWrappingQuotes(text: string): string {
  for (const [open, close] of QUOTE_PAIRS) {
    if (text.length > open.length + close.length - 1 && text.startsWith(open) && text.endsWith(close)) {
      return text.slice(open.length, text.length - close.length).trim();
    }
  }
  return text;
}

/**
 * Takes the last `^p-NNN` out of `text`, with the `(#...)` bracket the pane writes around it, and keeps whatever
 * was written on either side.
 *
 * An earlier version dropped everything after the anchor, so `See ^p-012 for the rest` showed as `See`.
 */
function takeAnchor(text: string): { text: string; anchor?: string } {
  const start = text.lastIndexOf("^p-");
  if (start === -1) {
    return { text };
  }
  const found = /^\^p-\d*/.exec(text.slice(start));
  const anchor = found ? found[0] : "^p-";
  const before = text.slice(0, start).trimEnd().replace(/[(#\s]+$/, "");
  const after = text.slice(start + anchor.length).replace(/^[)\s]+/, "").trim();

  if (!after) return { text: before, anchor };
  if (!before) return { text: after, anchor };
  return { text: `${before} ${after}`, anchor };
}

/**
 * The words and the anchor of one note line, or `null` when the line has nothing to show: a blank, a bare bullet,
 * a leftover anchor, or the empty `Reflection:` prompt the pane writes for the reader to fill in.
 *
 * Headings are the caller's business, as they are in Rust: `#` starts a title and `##` a section, and the section
 * becomes the label on the card.
 */
export function noteLine(line: string): NoteLine | null {
  let text = line.trim();

  // `- > "a quote"` and `> - "a quote"` both read as one quote, so strip markers until none is left.
  for (;;) {
    let stripped = text;
    for (const marker of LINE_MARKERS) {
      while (stripped.startsWith(marker)) {
        stripped = stripped.slice(marker.length).trimStart();
      }
    }
    if (stripped === text) break;
    text = stripped;
  }

  const taken = takeAnchor(text);
  text = withoutWrappingQuotes(taken.text.trim());

  // An empty `Reflection:` is the pane asking for a thought, not a thought. One with words after it keeps the
  // words: the card already prints the section heading as its own label.
  if (text.toLowerCase().startsWith(REFLECTION_LABEL)) {
    text = withoutWrappingQuotes(text.slice(REFLECTION_LABEL.length).trim());
  }

  if (!text) return null;
  return taken.anchor ? { text, anchor: taken.anchor } : { text };
}
