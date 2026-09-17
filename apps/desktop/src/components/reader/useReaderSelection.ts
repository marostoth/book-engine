import { useState } from "react";
import type { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { toSavedAnchor } from "../../lib/anchors";
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
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** The reader's editor. A highlight saves the words of the chapter document that the selection holds (RD-02). */
  editor: Editor | null;
  onAddHighlight: (highlight: HighlightItem) => void;
  onAddNoteFromSelection: (quote: string, anchorId?: string) => void;
  onAddTerm?: (quote: string, anchorId?: string) => void;
  onAddArgument?: (quote: string, anchorId?: string) => void;
  onAddCritique?: (quote: string, anchorId?: string) => void;
  onAddInquiry?: (quote: string, anchorId?: string) => void;
  onAddSyntopic?: (quote: string, anchorId?: string) => void;
  instantDictionaryEnabled?: boolean;
}

export function useReaderSelection({
  containerRef,
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

  // Helper to extract nearest anchor
  const extractAnchorFromSelection = (selection: Selection): string | undefined => {
    let anchor: string | undefined;
    let node: Node | null = selection.anchorNode;
    while (node && node !== containerRef.current) {
      if (node instanceof HTMLElement && node.hasAttribute("data-anchor")) {
        anchor = toSavedAnchor(node.getAttribute("data-anchor"));
        break;
      }
      node = node.parentNode;
    }
    return anchor;
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

    const anchor = extractAnchorFromSelection(selection);
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

  const handleAddTerm = () => {
    if (!selectedText || !onAddTerm) return;
    onAddTerm(selectedText, selectedAnchor);
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleAddArgument = () => {
    if (!selectedText || !onAddArgument) return;
    onAddArgument(selectedText, selectedAnchor);
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleAddCritique = () => {
    if (!selectedText || !onAddCritique) return;
    onAddCritique(selectedText, selectedAnchor);
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleAddInquiry = () => {
    if (!selectedText || !onAddInquiry) return;
    onAddInquiry(selectedText, selectedAnchor);
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleAddSyntopic = () => {
    if (!selectedText || !onAddSyntopic) return;
    onAddSyntopic(selectedText, selectedAnchor);
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
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
      setLexiconAnchor(extractAnchorFromSelection(selection));
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
