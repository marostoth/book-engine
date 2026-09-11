import React, { useState } from "react";
import { Highlighter, FileText, Copy, Check } from "lucide-react";

interface SelectionMenuProps {
  position: { x: number; y: number } | null;
  onHighlight: () => void;
  onAddNote: () => void;
  onCopyLink: () => void;
}

export const SelectionMenu: React.FC<SelectionMenuProps> = ({
  position,
  onHighlight,
  onAddNote,
  onCopyLink,
}) => {
  const [copied, setCopied] = useState(false);

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
      <div className="flex items-center gap-1 px-1.5 py-1 rounded-full shadow-xl border bg-white/90 dark:bg-nord-surface/90 backdrop-blur-md border-black/10 dark:border-white/10 text-xs font-medium">
        <button
          onClick={onHighlight}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-amber-600 dark:text-amber-400 transition-colors"
          title="Highlight passage"
        >
          <Highlighter className="w-3.5 h-3.5" />
          <span>Highlight</span>
        </button>

        <div className="w-[1px] h-3.5 bg-black/10 dark:bg-white/10" />

        <button
          onClick={onAddNote}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-sky-600 dark:text-sky-400 transition-colors"
          title="Attach reflection note"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Note</span>
        </button>

        <div className="w-[1px] h-3.5 bg-black/10 dark:bg-white/10" />

        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-emerald-600 dark:text-emerald-400 transition-colors"
          title="Copy quote anchor link"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? "Copied" : "Copy Link"}</span>
        </button>
      </div>
    </div>
  );
};
