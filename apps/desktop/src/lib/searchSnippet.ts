import { Fragment, createElement, type ReactNode } from "react";

/** Before each hit in a search result snippet: `HIT_START` in src-tauri/src/db/search_text.rs. */
export const HIT_START = "\uE000";
/** After each hit in a search result snippet: `HIT_END` in src-tauri/src/db/search_text.rs. */
export const HIT_END = "\uE001";

/** A piece of a search result snippet. */
export interface SnippetPart {
  text: string;
  /** True for a word or a phrase that the search found. */
  hit: boolean;
}

/**
 * Splits a search result snippet into its text and its hits. A snippet is plain text (SEC-01): a `<` in it is a
 * character of the book, never the start of a tag. A hit with no end runs to the end of the snippet.
 */
export function snippetParts(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let hit = false;
  let text = "";
  const endPart = () => {
    if (text) parts.push({ text, hit });
    text = "";
  };
  for (const character of snippet) {
    if (character === HIT_START || character === HIT_END) {
      const startsHit = character === HIT_START;
      if (startsHit !== hit) {
        endPart();
        hit = startsHit;
      }
    } else {
      text += character;
    }
  }
  endPart();
  return parts;
}

/**
 * A search result snippet for the search window: its text as text, and each hit in a `<mark>`. React writes text into
 * the page as text, so book text can never become HTML there (SEC-01).
 */
export function snippetNodes(snippet: string): ReactNode[] {
  return snippetParts(snippet).map((part, index) =>
    part.hit ? createElement("mark", { key: index }, part.text) : createElement(Fragment, { key: index }, part.text),
  );
}
