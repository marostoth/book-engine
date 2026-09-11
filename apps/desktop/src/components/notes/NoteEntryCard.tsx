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
          ? "bg-[var(--theme-accent)]/[0.06] border-[var(--theme-accent)]/25 hover:border-[var(--theme-accent)]/50 hover:shadow-sm"
          : "bg-[var(--theme-surface)]/60 border-[var(--theme-border)] hover:border-[var(--theme-accent)]/40 hover:shadow-sm"
      }`}
    >
      {/* Entry Meta Header */}
      <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px]">
        <div className="flex items-center gap-1.5">
          {isHighlight ? (
            <span className="flex items-center gap-1 font-semibold text-[var(--theme-accent)] uppercase tracking-wide">
              <Highlighter className="w-2.5 h-2.5" />
              Highlight
            </span>
          ) : (
            <span className="flex items-center gap-1 font-semibold text-[var(--theme-text)] uppercase tracking-wide">
              <FileText className="w-2.5 h-2.5 text-[var(--theme-muted)]" />
              {entry.section_heading || "Reflection"}
            </span>
          )}

          {entry.anchor && (
            <span className="inline-flex items-center gap-0.5 font-mono px-1.5 py-0.2 rounded bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-muted)]">
              <Hash className="w-2.5 h-2.5" />
              {entry.anchor.replace(/^\^/, "")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[var(--theme-muted)] group-hover:text-[var(--theme-accent)] transition-colors">
          <span className="text-[10px] hidden group-hover:inline font-sans">
            Jump to text
          </span>
          <ExternalLink className="w-3 h-3" />
        </div>
      </div>

      {/* Entry Body */}
      {isHighlight ? (
        <blockquote className="text-xs font-serif leading-relaxed italic pl-2.5 border-l-2 border-[var(--theme-accent)] text-[var(--theme-text)]">
          "{entry.text}"
        </blockquote>
      ) : (
        <p className="text-xs leading-relaxed text-[var(--theme-text)] font-sans">
          {entry.text}
        </p>
      )}
    </div>
  );
};
