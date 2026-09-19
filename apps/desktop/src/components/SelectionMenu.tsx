import React, { useEffect, useRef, useState } from "react";
import { Highlighter, FileText, Copy, Check, BookA } from "lucide-react";
import { aDialogIsOpen } from "../hooks/useDialog";

interface SelectionMenuProps {
  position: { x: number; y: number } | null;
  onHighlight: () => void;
  onAddNote: () => void;
  onCopyLink: () => void;
  onDefine?: () => void;
  isSingleWord?: boolean;
  activeLevel?: string;
  onAddTerm?: () => void;
  onAddArgument?: () => void;
  onAddCritique?: () => void;
  onAddInquiry?: () => void;
  onAddSyntopic?: () => void;
  /** Closes the menu. Escape calls it, and the passage stays selected so the reader can go on changing it. */
  onDismiss?: () => void;
}

export const SelectionMenu: React.FC<SelectionMenuProps> = ({
  position,
  onHighlight,
  onAddNote,
  onCopyLink,
  onDefine,
  isSingleWord = false,
  activeLevel,
  onAddTerm,
  onAddArgument,
  onAddCritique,
  onAddInquiry,
  onAddSyntopic,
  onDismiss,
}) => {
  const [copied, setCopied] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  /**
   * The keyboard reaches this menu (RD-07). Escape shuts it, and Tab steps into it.
   *
   * Tab has to be taken here because nothing in a chapter holds the focus: after a click in the text the focus is on
   * the body of the page, so the next Tab would jump to the first control of the whole app instead of to this menu,
   * which floats right beside the words the reader just picked. Once the focus is inside, Tab walks the buttons as
   * usual and this stands aside.
   */
  useEffect(() => {
    if (!position) return;
    const answer = (event: KeyboardEvent) => {
      // A dialog on top owns the keyboard. This menu sits on the page behind it.
      if (aDialogIsOpen()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss?.();
        return;
      }
      if (event.key !== "Tab" || event.shiftKey) return;
      const buttons = menu.current;
      if (!buttons) return;
      const at = document.activeElement;
      if (at instanceof HTMLElement && buttons.contains(at)) return;
      const first = buttons.querySelector("button");
      if (!(first instanceof HTMLElement)) return;
      event.preventDefault();
      first.focus();
    };
    document.addEventListener("keydown", answer);
    return () => document.removeEventListener("keydown", answer);
  }, [position, onDismiss]);

  if (!position) return null;

  const handleCopy = () => {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-2 pointer-events-auto transition-all duration-150 animate-in fade-in zoom-in-95"
      style={{ left: `${position.x}px`, top: `${position.y - 8}px` }}
    >
      <div
        ref={menu}
        role="group"
        aria-label="What to do with the passage you picked"
        className="flex items-center gap-1 px-1.5 py-1 rounded-full shadow-xl border bg-[var(--theme-surface)]/95 backdrop-blur-md border-[var(--theme-border)] text-xs font-medium text-[var(--theme-text)]"
      >
        {isSingleWord && onDefine && (
          <>
            <button
              onClick={onDefine}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full hover:bg-amber-500/15 text-amber-700 dark:text-amber-400 transition-colors"
              title="Lookup definition in offline lexicon"
            >
              <BookA className="w-3.5 h-3.5" />
              <span>Define</span>
            </button>
            <div className="w-[1px] h-3.5 bg-[var(--theme-border)]" />
          </>
        )}

        <button
          onClick={onHighlight}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full hover:bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] transition-colors"
          title="Highlight passage"
        >
          <Highlighter className="w-3.5 h-3.5" />
          <span>Highlight</span>
        </button>

        {activeLevel === "analytical" && (
          <>
            {onAddTerm && (
              <>
                <div className="w-[1px] h-3.5 bg-[var(--theme-border)]" />
                <button
                  onClick={onAddTerm}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full hover:bg-amber-500/15 text-amber-600 dark:text-amber-400 transition-colors font-medium"
                  title="Capture author term (Rule 5)"
                >
                  <span className="text-[10px] font-bold">§T</span>
                  <span>Term</span>
                </button>
              </>
            )}
            {onAddArgument && (
              <>
                <div className="w-[1px] h-3.5 bg-[var(--theme-border)]" />
                <button
                  onClick={onAddArgument}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full hover:bg-sky-500/15 text-sky-600 dark:text-sky-400 transition-colors font-medium"
                  title="Assemble into argument (Rules 6 & 7)"
                >
                  <span className="text-[10px] font-bold">§A</span>
                  <span>Arg</span>
                </button>
              </>
            )}
            {onAddCritique && (
              <>
                <div className="w-[1px] h-3.5 bg-[var(--theme-border)]" />
                <button
                  onClick={onAddCritique}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full hover:bg-rose-500/15 text-rose-600 dark:text-rose-400 transition-colors font-medium"
                  title="Critique passage (Rules 9–12)"
                >
                  <span className="text-[10px] font-bold">§C</span>
                  <span>Critique</span>
                </button>
              </>
            )}
            {onAddInquiry && (
              <>
                <div className="w-[1px] h-3.5 bg-[var(--theme-border)]" />
                <button
                  onClick={onAddInquiry}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full hover:bg-amber-500/15 text-amber-600 dark:text-amber-400 transition-colors font-medium"
                  title="Catalog inquiry (Rules 4 & 8)"
                >
                  <span className="text-[10px] font-bold">§?</span>
                  <span>Inquiry</span>
                </button>
              </>
            )}
          </>
        )}

        {activeLevel === "syntopical" && onAddSyntopic && (
          <>
            <div className="w-[1px] h-3.5 bg-[var(--theme-border)]" />
            <button
              onClick={onAddSyntopic}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full hover:bg-amber-500/15 text-amber-600 dark:text-amber-400 transition-colors font-medium"
              title="Stage quote for Syntopicon topic (Level IV)"
            >
              <span className="text-[10px] font-bold">§S</span>
              <span>Syntopic</span>
            </button>
          </>
        )}

        <div className="w-[1px] h-3.5 bg-[var(--theme-border)]" />

        <button
          onClick={onAddNote}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full hover:bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] transition-colors"
          title="Attach reflection note"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Note</span>
        </button>

        <div className="w-[1px] h-3.5 bg-[var(--theme-border)]" />

        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 transition-colors"
          title="Copy quote anchor link"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-[var(--theme-muted)]" />}
          <span>{copied ? "Copied" : "Copy Link"}</span>
        </button>
      </div>
    </div>
  );
};
