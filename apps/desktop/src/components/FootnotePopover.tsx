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
      <div className="w-80 max-w-sm rounded-xl p-3.5 shadow-2xl border bg-white/95 dark:bg-nord-surface/95 backdrop-blur-lg border-black/10 dark:border-white/10 text-xs">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-black/5 dark:border-white/5">
          <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
            <Bookmark className="w-3.5 h-3.5" />
            <span>Citation [^{footnote.number}]</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="font-serif leading-relaxed text-sm text-neutral-800 dark:text-neutral-200 select-text">
          {footnote.text}
        </p>
      </div>

      {/* Downward triangle pointer */}
      <div className="w-3 h-3 bg-white/95 dark:bg-nord-surface/95 border-r border-b border-black/10 dark:border-white/10 transform rotate-45 mx-auto -mt-1.5" />
    </div>
  );
};
