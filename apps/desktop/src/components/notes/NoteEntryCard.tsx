import React from "react";
import { Highlighter, FileText, Hash, ExternalLink } from "lucide-react";
import { AggregatedNoteItem } from "../../lib/types";

interface NoteEntryCardProps {
  entry: AggregatedNoteItem;
  onClick: () => void;
}

export const NoteEntryCard: React.FC<NoteEntryCardProps> = ({ entry, onClick }) => {
  const isHighlight = entry.item_type === "highlight";

  return (
    <div
      onClick={onClick}
      className={`group p-3 rounded-xl border transition-all cursor-pointer select-text ${
        isHighlight
          ? "bg-amber-500/[0.04] dark:bg-nord-accent/[0.05] border-amber-500/20 dark:border-nord-accent/20 hover:border-amber-500/50 dark:hover:border-nord-accent/50 hover:shadow-sm"
          : "bg-black/[0.02] dark:bg-white/[0.03] border-black/10 dark:border-white/10 hover:border-black/25 dark:hover:border-white/25 hover:shadow-sm"
      }`}
    >
      {/* Entry Meta Header */}
      <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px]">
        <div className="flex items-center gap-1.5">
          {isHighlight ? (
            <span className="flex items-center gap-1 font-semibold text-amber-700 dark:text-nord-accent uppercase tracking-wide">
              <Highlighter className="w-2.5 h-2.5" />
              Highlight
            </span>
          ) : (
            <span className="flex items-center gap-1 font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wide">
              <FileText className="w-2.5 h-2.5 text-neutral-400" />
              {entry.section_heading || "Reflection"}
            </span>
          )}

          {entry.anchor && (
            <span className="inline-flex items-center gap-0.5 font-mono px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10 text-neutral-500 dark:text-neutral-400">
              <Hash className="w-2.5 h-2.5" />
              {entry.anchor.replace(/^\^/, "")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-neutral-400 group-hover:text-amber-600 dark:group-hover:text-nord-accent transition-colors">
          <span className="text-[10px] hidden group-hover:inline font-sans">
            Jump to text
          </span>
          <ExternalLink className="w-3 h-3" />
        </div>
      </div>

      {/* Entry Body */}
      {isHighlight ? (
        <blockquote className="text-xs font-serif leading-relaxed italic pl-2.5 border-l-2 border-amber-500 dark:border-nord-accent text-neutral-800 dark:text-neutral-200">
          "{entry.text}"
        </blockquote>
      ) : (
        <p className="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 font-sans">
          {entry.text}
        </p>
      )}
    </div>
  );
};
