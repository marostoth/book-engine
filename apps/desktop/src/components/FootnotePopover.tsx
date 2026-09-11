import React from "react";
import { Bookmark, X } from "lucide-react";
import { FootnoteItem } from "../lib/types";

interface FootnotePopoverProps {
  footnote: FootnoteItem | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
}

export const FootnotePopover: React.FC<FootnotePopoverProps> = ({
  footnote,
  position,
  onClose,
}) => {
  if (!footnote || !position) return null;

  return (
    <div
      className="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-3 pointer-events-auto transition-all animate-in fade-in zoom-in-95"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      <div
        className="w-80 max-w-sm rounded-xl p-3.5 shadow-2xl border border-[var(--theme-border)] text-xs bg-[var(--theme-surface)] text-[var(--theme-text)]"
        style={{ backgroundColor: "var(--theme-surface)" }}
      >
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--theme-border)]">
          <div className="flex items-center gap-1.5 font-semibold text-[var(--theme-accent)]">
            <Bookmark className="w-3.5 h-3.5" />
            <span>Citation [^{footnote.number}]</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-[var(--theme-accent)]/15 text-[var(--theme-muted)] hover:text-[var(--theme-text)] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="font-serif leading-relaxed text-sm text-[var(--theme-text)] select-text">
          {footnote.text}
        </p>
      </div>

      {/* Downward triangle pointer */}
      <div
        className="w-3 h-3 border-r border-b border-[var(--theme-border)] transform rotate-45 mx-auto -mt-1.5"
        style={{ backgroundColor: "var(--theme-surface)" }}
      />
    </div>
  );
};
