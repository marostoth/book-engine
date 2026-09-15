/**
 * Paragraph anchors come in two forms:
 * - the saved form `^p-001`, used in chapter Markdown, notes, citations, and practice cards
 * - the attribute form `p-001`, used in rendered HTML as `data-anchor="p-001"`
 * Convert between the two forms only with these helpers.
 */

const PARAGRAPH_ANCHOR = /^[\^§]?(p-[A-Za-z0-9_-]+)$/;

/** Returns the attribute form (`p-001`) of an anchor in either form, or undefined when the text is not a paragraph anchor. */
export function toAnchorAttribute(anchor: string | null | undefined): string | undefined {
  return anchor?.trim().match(PARAGRAPH_ANCHOR)?.[1];
}

/** Returns the saved form (`^p-001`) of an anchor in either form, or undefined when the text is not a paragraph anchor. */
export function toSavedAnchor(anchor: string | null | undefined): string | undefined {
  const attribute = toAnchorAttribute(anchor);
  return attribute ? `^${attribute}` : undefined;
}
