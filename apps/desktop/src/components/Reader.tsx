import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { parseChapterMarkdown } from "../lib/markdown";
import { applyBionicReading } from "../lib/bionic";
import { applyHighlightsToHtml, createW3CHighlight } from "../lib/highlights";
import { FootnoteItem, HighlightItem } from "../lib/types";
import { FootnotePopover } from "./FootnotePopover";
import { SelectionMenu } from "./SelectionMenu";
import { AnchorParagraph, FootnoteRef } from "./reader/TipTapExtensions";

interface ReaderProps {
  bookId: string;
  vaultPath?: string;
  markdown: string;
  isBionic: boolean;
  highlights: HighlightItem[];
  targetAnchor?: string;
  onProgressChange: (progressPercent: number) => void;
  onAddHighlight: (highlight: HighlightItem) => void;
  onAddNoteFromSelection: (quote: string, anchorId?: string) => void;
}

export const Reader: React.FC<ReaderProps> = ({
  bookId,
  vaultPath,
  markdown,
  isBionic,
  highlights,
  targetAnchor,
  onProgressChange,
  onAddHighlight,
  onAddNoteFromSelection,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [footnotes, setFootnotes] = useState<Record<string, FootnoteItem>>({});
  const [activeFootnote, setActiveFootnote] = useState<FootnoteItem | null>(null);
  const [footnotePos, setFootnotePos] = useState<{ x: number; y: number } | null>(null);

  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectedAnchor, setSelectedAnchor] = useState<string | undefined>();

  // Single-Chapter Virtualization: Mounts TipTap for only the current chapter
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        paragraph: false,
      }),
      AnchorParagraph,
      FootnoteRef,
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: "reader-image mx-auto my-6 rounded-lg shadow-md max-w-full border border-stone-200 dark:border-stone-800",
        },
      }),
      Highlight.configure({
        multicolor: true,
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "reader-prose prose max-w-none focus:outline-none font-serif text-lg leading-relaxed antialiased",
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement;
        const callout = target.closest(".footnote-callout");
        if (callout) {
          event.preventDefault();
          const fnId = callout.getAttribute("data-fn");
          if (fnId && footnotes[fnId]) {
            const rect = callout.getBoundingClientRect();
            setFootnotePos({
              x: rect.left + rect.width / 2,
              y: rect.top,
            });
            setActiveFootnote(footnotes[fnId]);
          }
          return true;
        }
        return false;
      },
    },
    editable: false,
  });

  // Parse markdown, extract footnotes, resolve asset URLs, and inject into TipTap
  useEffect(() => {
    if (!editor || !markdown) return;

    const parsed = parseChapterMarkdown(markdown, bookId, vaultPath);
    setFootnotes(parsed.footnotes);

    let html = parsed.html;
    if (isBionic) {
      html = applyBionicReading(html);
    }
    if (highlights && highlights.length > 0) {
      html = applyHighlightsToHtml(html, highlights);
    }

    editor.commands.setContent(html);
  }, [editor, markdown, isBionic, highlights, bookId, vaultPath]);

  // Jump to target paragraph anchor when requested
  useEffect(() => {
    if (!targetAnchor || !containerRef.current) return;

    const cleanAnchor = targetAnchor.replace(/^\^/, "");
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const el = containerRef.current.querySelector(`[data-anchor="${cleanAnchor}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("bg-amber-100/50", "dark:bg-amber-900/30", "transition-colors", "duration-500");
        setTimeout(() => {
          el.classList.remove("bg-amber-100/50", "dark:bg-amber-900/30");
        }, 2000);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [targetAnchor, markdown]);

  // Handle scroll progress tracking
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const total = scrollHeight - clientHeight;
    if (total <= 0) {
      onProgressChange(100);
    } else {
      const pct = Math.min(100, Math.max(0, Math.round((scrollTop / total) * 100)));
      onProgressChange(pct);
    }
  };

  // Floating selection menu handling
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

    // Locate nearest anchor attribute
    let anchor: string | undefined;
    let node: Node | null = selection.anchorNode;
    while (node && node !== containerRef.current) {
      if (node instanceof HTMLElement && node.hasAttribute("data-anchor")) {
        anchor = `^${node.getAttribute("data-anchor")}`;
        break;
      }
      node = node.parentNode;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setSelectionPos({
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
    setSelectedText(text);
    setSelectedAnchor(anchor);
  };

  // Add highlight using W3C Text Quote Selector standard
  const handleHighlight = () => {
    const selection = window.getSelection();
    if (!selection) return;

    const w3cHl = createW3CHighlight(selection, selectedAnchor);
    if (w3cHl) {
      onAddHighlight(w3cHl);
    }

    setSelectionPos(null);
    selection.removeAllRanges();
  };

  // Add quote to notes pane
  const handleAddNote = () => {
    if (!selectedText) return;
    onAddNoteFromSelection(selectedText, selectedAnchor);
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  // Copy markdown quote anchor link
  const handleCopyLink = () => {
    const anchor = selectedAnchor ? ` (#${selectedAnchor})` : "";
    const quote = `> "${selectedText}"${anchor}`;
    navigator.clipboard.writeText(quote);
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onMouseUp={handleMouseUp}
      className="relative flex-1 h-full overflow-y-auto overflow-x-hidden bg-[var(--theme-bg)] scroll-smooth px-8 py-12 md:px-16 lg:px-24"
    >
      <div className="max-w-3xl mx-auto min-h-full pb-32">
        <EditorContent editor={editor} />
      </div>

      {/* Popover citation footnote resolver */}
      {activeFootnote && footnotePos && (
        <FootnotePopover
          footnote={activeFootnote}
          position={footnotePos}
          onClose={() => setActiveFootnote(null)}
        />
      )}

      {/* Floating selection toolbar for highlights & reflection notes */}
      {selectionPos && selectedText && (
        <SelectionMenu
          position={selectionPos}
          onHighlight={handleHighlight}
          onAddNote={handleAddNote}
          onCopyLink={handleCopyLink}
        />
      )}
    </div>
  );
};
