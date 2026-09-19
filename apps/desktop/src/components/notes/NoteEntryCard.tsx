import React from "react";
import { Highlighter, FileText, Hash, ExternalLink, Bookmark } from "lucide-react";
import { AggregatedNoteItem } from "../../lib/types";

interface NoteEntryCardProps {
  entry: AggregatedNoteItem;
  onClick: () => void;
}

export const NoteEntryCard: React.FC<NoteEntryCardProps> = ({ entry, onClick }) => {
  const isHighlight = entry.item_type === "highlight";
  // A saved word carries the word itself in `section_heading` and its meaning in `text` (`lib/vocabularyEntries.ts`).
  const isWord = entry.item_type === "word";
  // A word saved before the app kept chapters has no chapter, so there is nowhere to jump to (RD-04).
  const canJump = entry.chapter_file !== "";

  return (
    <div
      onClick={canJump ? onClick : undefined}
      className={`group p-3 rounded-xl border transition-all select-text ${canJump ? "cursor-pointer" : ""} ${
        isHighlight
          ? "bg-[var(--theme-accent)]/[0.06] border-[var(--theme-accent)]/25 hover:border-[var(--theme-accent)]/50 hover:shadow-sm"
          : "bg-[var(--theme-surface)]/60 border-[var(--theme-border)] hover:border-[var(--theme-accent)]/40 hover:shadow-sm"
      }`}
    >
      {/* Entry Meta Header */}
      <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px]">
        <div className="flex items-center gap-1.5">
          {isHighlight && (
            <span className="flex items-center gap-1 font-semibold text-[var(--theme-accent)] uppercase tracking-wide">
              <Highlighter className="w-2.5 h-2.5" />
              Highlight
            </span>
          )}

          {isWord && (
            <span className="flex items-center gap-1 font-semibold text-[var(--theme-text)] uppercase tracking-wide">
              <Bookmark className="w-2.5 h-2.5 text-[var(--theme-accent)]" />
              Word
            </span>
          )}

          {!isHighlight && !isWord && (
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

        {canJump ? (
          <div className="flex items-center gap-1 text-[var(--theme-muted)] group-hover:text-[var(--theme-accent)] transition-colors">
            <span className="text-[10px] hidden group-hover:inline font-sans">
              Jump to text
            </span>
            <ExternalLink className="w-3 h-3" />
          </div>
        ) : (
          <span className="text-[10px] text-[var(--theme-muted)] font-sans">Saved before the app kept the place</span>
        )}
      </div>

      {/* Entry Body */}
      {isHighlight && (
        <blockquote className="text-xs font-serif leading-relaxed italic pl-2.5 border-l-2 border-[var(--theme-accent)] text-[var(--theme-text)]">
          "{entry.text}"
        </blockquote>
      )}

      {isWord && (
        <div>
          <p className="font-serif font-bold text-sm capitalize text-[var(--theme-text)]">
            {entry.section_heading}
          </p>
          <p className="text-xs leading-relaxed text-[var(--theme-text)] font-sans">
            {entry.text || "No meaning was saved with this word."}
          </p>
        </div>
      )}

      {!isHighlight && !isWord && (
        <p className="text-xs leading-relaxed text-[var(--theme-text)] font-sans">
          {entry.text}
        </p>
      )}
    </div>
  );
};
