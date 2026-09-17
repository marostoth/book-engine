import { useState } from "react";
import type { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { reportBackendError } from "../../lib/backendErrors";
import { citationAnchorAt, NO_ANCHOR } from "../../lib/citations";
import { createHighlight } from "../../lib/highlights";
import { HighlightItem } from "../../lib/types";

/**
 * The document positions of the selected text of the chapter, or null when the selection holds none of it. A selection
 * that starts above the chapter or ends below it keeps only its part in the chapter.
 */
function selectedPlace(view: EditorView, selection: Selection): { from: number; to: number } | null {
  if (!selection.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const chapter = document.createRange();
  chapter.selectNodeContents(view.dom);
  const startSide = chapter.comparePoint(range.startContainer, range.startOffset);
  const endSide = chapter.comparePoint(range.endContainer, range.endOffset);
  if (startSide > 0 || endSide < 0) return null;

  const from = startSide < 0 ? 0 : view.posAtDOM(range.startContainer, range.startOffset);
  const to = endSide > 0 ? view.state.doc.content.size : view.posAtDOM(range.endContainer, range.endOffset);
  return from < to ? { from, to } : null;
}

interface UseReaderSelectionOptions {
  /**
   * The reader's editor. A highlight saves the words of the chapter document that the selection holds (RD-02), and a
   * citation names the anchor of the block of the document that holds them (RD-04).
   */
  editor: Editor | null;
  onAddHighlight: (highlight: HighlightItem) => void;
  onAddNoteFromSelection: (quote: string, anchorId?: string) => void;
  onAddTerm?: (quote: string, anchor: string) => void;
  onAddArgument?: (quote: string, anchor: string) => void;
  onAddCritique?: (quote: string, anchor: string) => void;
  onAddInquiry?: (quote: string, anchor: string) => void;
  onAddSyntopic?: (quote: string, anchor: string) => void;
  instantDictionaryEnabled?: boolean;
}

export function useReaderSelection({
  editor,
  onAddHighlight,
  onAddNoteFromSelection,
  onAddTerm,
  onAddArgument,
  onAddCritique,
  onAddInquiry,
  onAddSyntopic,
  instantDictionaryEnabled = true,
}: UseReaderSelectionOptions) {
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectedAnchor, setSelectedAnchor] = useState<string | undefined>();

  // Lexicon popover state
  const [lexiconWord, setLexiconWord] = useState<string | null>(null);
  const [lexiconPos, setLexiconPos] = useState<{ x: number; y: number } | null>(null);
  const [lexiconAnchor, setLexiconAnchor] = useState<string | undefined>();

  /**
   * The anchor to save for a selection of the chapter, or undefined when the chapter holds none. The anchor comes from
   * the chapter document, so a selection in a heading, in a table cell or in a list names the anchor of the text it
   * belongs to. The reader used to read the anchor from the page, and a heading has none, so the app then saved
   * `^p-001` and the citation pointed at the first block of the chapter (RD-04).
   */
  const anchorOfSelection = (selection: Selection): string | undefined => {
    if (!editor || editor.isDestroyed) return undefined;
    const place = selectedPlace(editor.view, selection);
    return place ? citationAnchorAt(editor.state.doc, place.from) : undefined;
  };

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setSelectionPos(null);
      return;
    }

    const text = selection.toString().trim();
    if (text.length < 2) {
      setSelectionPos(null);
      return;
    }

    const anchor = anchorOfSelection(selection);
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setSelectionPos({
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
    setSelectedText(text);
    setSelectedAnchor(anchor);
  };

  const handleHighlight = () => {
    const selection = window.getSelection();
    if (!selection || !editor || editor.isDestroyed) return;

    const place = selectedPlace(editor.view, selection);
    const highlight = place ? createHighlight(editor.state.doc, place.from, place.to, selectedAnchor) : null;
    if (highlight) {
      onAddHighlight(highlight);
    }

    setSelectionPos(null);
    selection.removeAllRanges();
  };

  const handleAddNote = () => {
    if (!selectedText) return;
    onAddNoteFromSelection(selectedText, selectedAnchor);
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleCopyLink = () => {
    const anchor = selectedAnchor ? ` (#${selectedAnchor})` : "";
    const quote = `> "${selectedText}"${anchor}`;
    navigator.clipboard.writeText(quote);
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  /**
   * The anchor of the selection for a citation, or undefined when the chapter holds none. A citation says where in the
   * book a passage is, so the app saves none without an anchor, and the error bar says why (RD-04).
   */
  const anchorForCitation = (what: string): string | undefined => {
    if (selectedAnchor) return selectedAnchor;
    reportBackendError(`This passage was not saved as ${what}.`, NO_ANCHOR);
    return undefined;
  };

  /** Closes the selection menu and drops the selection, after a citation was staged or refused. */
  const citationDone = () => {
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleAddTerm = () => {
    if (!selectedText || !onAddTerm) return;
    const anchor = anchorForCitation("an author term");
    if (anchor) onAddTerm(selectedText, anchor);
    citationDone();
  };

  const handleAddArgument = () => {
    if (!selectedText || !onAddArgument) return;
    const anchor = anchorForCitation("an argument");
    if (anchor) onAddArgument(selectedText, anchor);
    citationDone();
  };

  const handleAddCritique = () => {
    if (!selectedText || !onAddCritique) return;
    const anchor = anchorForCitation("a critique");
    if (anchor) onAddCritique(selectedText, anchor);
    citationDone();
  };

  const handleAddInquiry = () => {
    if (!selectedText || !onAddInquiry) return;
    const anchor = anchorForCitation("a question of the author");
    if (anchor) onAddInquiry(selectedText, anchor);
    citationDone();
  };

  const handleAddSyntopic = () => {
    if (!selectedText || !onAddSyntopic) return;
    const anchor = anchorForCitation("a topic citation");
    if (anchor) onAddSyntopic(selectedText, anchor);
    citationDone();
  };

  // Sanitized single-word detection for lexicon lookup
  const cleanSingleWord = selectedText.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
  const isSingleWord = cleanSingleWord.length >= 2 && !/\s/.test(cleanSingleWord);

  const handleDefine = () => {
    if (!cleanSingleWord || !selectionPos) return;
    setLexiconWord(cleanSingleWord);
    setLexiconPos(selectionPos);
    setLexiconAnchor(selectedAnchor);
    setSelectionPos(null);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!instantDictionaryEnabled) return;
    const selection = window.getSelection();
    if (!selection) return;
    const raw = selection.toString().trim();
    const clean = raw.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
    if (clean.length >= 2 && !/\s/.test(clean)) {
      setSelectionPos(null);
      setLexiconWord(clean);
      setLexiconPos({ x: e.clientX, y: e.clientY });
      setLexiconAnchor(anchorOfSelection(selection));
    }
  };

  return {
    selectionPos,
    selectedText,
    selectedAnchor,
    isSingleWord,
    lexiconWord,
    lexiconPos,
    lexiconAnchor,
    setLexiconWord,
    handleMouseUp,
    handleHighlight,
    handleAddNote,
    handleCopyLink,
    handleAddTerm,
    handleAddArgument,
    handleAddCritique,
    handleAddInquiry,
    handleAddSyntopic,
    handleDefine,
    handleDoubleClick,
  };
}
