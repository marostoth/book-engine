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
      <div className="flex items-center gap-1 px-1.5 py-1 rounded-full shadow-xl border bg-[var(--theme-surface)]/95 backdrop-blur-md border-[var(--theme-border)] text-xs font-medium text-[var(--theme-text)]">
        <button
          onClick={onHighlight}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full hover:bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] transition-colors"
          title="Highlight passage"
        >
          <Highlighter className="w-3.5 h-3.5" />
          <span>Highlight</span>
        </button>

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
