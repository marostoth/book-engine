import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { parseChapterMarkdown } from "../lib/markdown";
import { applyBionicReading } from "../lib/bionic";
import { FootnoteItem } from "../lib/types";
import { FootnotePopover } from "./FootnotePopover";
import { SelectionMenu } from "./SelectionMenu";

interface ReaderProps {
  markdown: string;
  isBionic: boolean;
  onProgressChange: (progressPercent: number) => void;
  onAddNoteFromSelection: (quote: string, anchorId?: string) => void;
}

export const Reader: React.FC<ReaderProps> = ({
  markdown,
  isBionic,
  onProgressChange,
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
      }),
      Highlight.configure({
        multicolor: true,
      }),
    ],
    content: "",
    editable: false, // Reading mode
    editorProps: {
      attributes: {
        class: "reader-prose max-w-prose mx-auto px-6 py-12 focus:outline-none select-text",
      },
    },
  });

  // Load content when markdown changes (virtualized chapter swap)
  useEffect(() => {
    if (!editor) return;

    const parsed = parseChapterMarkdown(markdown);
    setFootnotes(parsed.footnotes);

    const finalHtml = isBionic ? applyBionicReading(parsed.html) : parsed.html;
    editor.commands.setContent(finalHtml);

    // Reset scroll to top on chapter change
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      onProgressChange(0);
    }
  }, [editor, markdown, isBionic, onProgressChange]);

  // Scroll Progress Tracking
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const maxScroll = scrollHeight - clientHeight;
    const percent = maxScroll > 0 ? Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100)) : 0;
    onProgressChange(Math.round(percent));
  };

  // Intercept Footnote clicks and hovers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const showFootnote = (target: HTMLElement) => {
      const fnId = target.getAttribute("data-fn") || "1";
      const noteItem = footnotes[fnId] || {
        id: fnId,
        number: fnId,
        text: `Citation [^${fnId}]: Full reference detailed in chapter citations.`,
      };
      const rect = target.getBoundingClientRect();
      setFootnotePos({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
      setActiveFootnote(noteItem);
    };

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest(".footnote-callout") as HTMLElement | null;
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        showFootnote(target);
      } else {
        // Dismiss footnote if clicked outside
        setActiveFootnote(null);
      }
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest(".footnote-callout") as HTMLElement | null;
      if (target) {
        showFootnote(target);
      }
    };

    container.addEventListener("click", handleClick);
    container.addEventListener("mouseover", handleMouseOver);
    return () => {
      container.removeEventListener("click", handleClick);
      container.removeEventListener("mouseover", handleMouseOver);
    };
  }, [footnotes]);

  // Selection Tracking for Floating Pill Toolbar
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setSelectionPos(null);
        setSelectedText("");
        setSelectedAnchor(undefined);
        return;
      }

      const text = selection.toString().trim();
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Find nearby paragraph anchor if available
      let anchorNode: HTMLElement | null = range.commonAncestorContainer as HTMLElement;
      if (anchorNode.nodeType === Node.TEXT_NODE) {
        anchorNode = anchorNode.parentElement;
      }
      const anchorEl = anchorNode?.closest("p")?.querySelector(".anchor-tag");
      const anchorId = anchorEl?.getAttribute("data-anchor") || undefined;

      setSelectionPos({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
      setSelectedText(text);
      setSelectedAnchor(anchorId);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  const handleHighlight = () => {
    if (!editor) return;
    // Apply highlight mark or custom style
    document.execCommand("hiliteColor", false, "#fef08a");
    setSelectionPos(null);
  };

  const handleAddNote = () => {
    onAddNoteFromSelection(selectedText, selectedAnchor);
    setSelectionPos(null);
  };

  const handleCopyLink = () => {
    const anchor = selectedAnchor ? ` (#${selectedAnchor})` : "";
    const quote = `> "${selectedText}"${anchor}`;
    navigator.clipboard.writeText(quote);
    setSelectionPos(null);
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="relative flex-1 h-full overflow-y-auto overflow-x-hidden selection:bg-amber-200 dark:selection:bg-nord-accent/30 selection:text-inherit"
    >
      <EditorContent editor={editor} />

      {/* Floating Selection Toolbar Pill */}
      <SelectionMenu
        position={selectionPos}
        onHighlight={handleHighlight}
        onAddNote={handleAddNote}
        onCopyLink={handleCopyLink}
      />

      {/* Popover Footnote Card */}
      <FootnotePopover
        footnote={activeFootnote}
        position={footnotePos}
        onClose={() => setActiveFootnote(null)}
      />
    </div>
  );
};
