import React from "react";
import { AuthorTerm } from "../../lib/types/analytical";

interface TermsTabProps {
  terms: AuthorTerm[];
  onOpenTermModal: (term?: AuthorTerm) => void;
  onDeleteTerm: (id: string) => void;
  onNavigateCitation: (chapterFile: string, anchor: string) => void;
}

export const TermsTab: React.FC<TermsTabProps> = ({
  terms,
  onOpenTermModal,
  onDeleteTerm,
  onNavigateCitation,
}) => {
  if (terms.length === 0) {
    return (
      <div className="text-center py-10 px-4 text-zinc-500 space-y-1.5">
        <p className="font-medium text-zinc-400">No Author Terms Yet</p>
        <p className="text-[11px]">
          Rule 5: Select text in the reader to capture specialized author terms.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {terms.map((term) => (
        <div
          key={term.id}
          className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2 shadow-sm hover:border-zinc-700 transition-colors"
        >
          <div className="flex items-start justify-between">
            <h3 className="font-semibold text-amber-300 text-sm">{term.term}</h3>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onOpenTermModal(term)}
                className="text-zinc-500 hover:text-zinc-300 p-0.5"
                title="Edit term"
              >
                ✎
              </button>
              <button
                onClick={() => onDeleteTerm(term.id)}
                className="text-zinc-500 hover:text-rose-400 p-0.5"
                title="Delete term"
              >
                ✕
              </button>
            </div>
          </div>
          <p className="text-zinc-300 italic bg-zinc-950/40 p-2 rounded border border-zinc-800/60 text-xs">
            "{term.authorDefinition}"
          </p>
          <div className="flex items-center justify-between text-[11px]">
            <button
              onClick={() =>
                onNavigateCitation(term.citation.chapterFile, term.citation.anchor)
              }
              className="flex items-center gap-1 font-mono text-amber-400/90 hover:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 text-[10px]"
            >
              § {term.citation.chapterFile}#{term.citation.anchor}
            </button>
            {term.citation.quote && (
              <span className="text-zinc-500 truncate max-w-[130px] text-[10px]">
                {term.citation.quote}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
