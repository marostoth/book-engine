import React from "react";
import { NeutralTerm, CrossBookCitation, StagedCitation } from "../../lib/types/syntopicon";
import { Plus, Edit2, Trash2, BookOpen, ExternalLink, Bookmark } from "lucide-react";
import { sanitizeQuoteText } from "../../lib/markdown";

interface SyntopicTermsTabProps {
  terms: NeutralTerm[];
  onOpenTermModal: (term?: NeutralTerm) => void;
  onDeleteTerm: (termId: string) => void;
  onNavigateCitation?: (citation: CrossBookCitation) => void;
  stagedCitation: StagedCitation | null;
}

export const SyntopicTermsTab: React.FC<SyntopicTermsTabProps> = ({
  terms,
  onOpenTermModal,
  onDeleteTerm,
  onNavigateCitation,
  stagedCitation,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-stone-800">
        <div>
          <h4 className="text-xs font-semibold uppercase text-stone-400">
            Neutral Terminology (Rule 2: Bringing Authors to Terms)
          </h4>
          <p className="text-[11px] text-stone-500">
            Constructing a common semantic bridge between divergent author vocabularies.
          </p>
        </div>
        <button
          onClick={() => onOpenTermModal()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded text-xs font-semibold shadow transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Neutral Term
        </button>
      </div>

      {stagedCitation && (
        <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2 overflow-hidden">
            <Bookmark className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">
              Staged citation from <strong className="font-mono">{stagedCitation.bookId}</strong> ({stagedCitation.anchor}):
              <em className="ml-1 text-stone-300 line-clamp-1">&ldquo;{sanitizeQuoteText(stagedCitation.quote)}&rdquo;</em>
            </span>
          </div>
          <button
            onClick={() => onOpenTermModal()}
            className="px-2 py-1 bg-amber-600 text-stone-950 rounded text-[11px] font-bold hover:bg-amber-500 shrink-0 ml-2"
          >
            Attach to Term
          </button>
        </div>
      )}

      {terms.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-stone-800 rounded-lg text-stone-500 text-xs">
          <BookOpen className="w-8 h-8 mx-auto mb-2 text-stone-600" />
          <p>No neutral terms created yet for this topic.</p>
          <p className="text-[11px] text-stone-600 mt-1">
            Click &ldquo;Add Neutral Term&rdquo; or stage text in the reader with <span className="font-mono bg-stone-800 px-1 py-0.5 rounded text-amber-400">[§S Syntopic]</span>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {terms.map((t) => (
            <div key={t.id} className="bg-stone-900 border border-stone-800 rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-start justify-between">
                <div>
                  <h5 className="text-sm font-semibold text-amber-300">{t.term}</h5>
                  <p className="text-xs text-stone-300 mt-0.5 italic">&ldquo;{t.neutralDefinition}&rdquo;</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onOpenTermModal(t)}
                    className="p-1 text-stone-400 hover:text-amber-400 transition-colors"
                    title="Edit Term"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteTerm(t.id)}
                    className="p-1 text-stone-400 hover:text-red-400 transition-colors"
                    title="Delete Term"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Author mappings */}
              <div className="border-t border-stone-800/80 pt-2 space-y-1.5">
                <span className="text-[10px] font-semibold uppercase text-stone-500 tracking-wider">
                  Author Mappings ({t.mappings.length}):
                </span>
                <div className="grid grid-cols-1 gap-2">
                  {t.mappings.map((m, idx) => (
                    <div
                      key={idx}
                      className="bg-stone-950/60 border border-stone-800 rounded p-2 text-xs flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-amber-950/90 text-amber-300 border border-amber-800/60 px-1.5 py-0.5 rounded text-[10px] font-mono">
                            {m.bookId}
                          </span>
                          <span className="font-medium text-stone-200">
                            &ldquo;{m.authorVariant}&rdquo;
                          </span>
                        </div>
                        {onNavigateCitation && (
                          <button
                            onClick={() => onNavigateCitation(m.citation)}
                            className="flex items-center gap-1 text-[11px] text-amber-400/80 hover:text-amber-300 hover:underline font-mono"
                          >
                            <span>{m.citation.chapterFile}</span>
                            <span>{m.citation.anchor}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {m.citation.quote && (
                        <p className="text-[11px] text-stone-400 italic line-clamp-2 pl-1 border-l border-amber-500/30">
                          &ldquo;{sanitizeQuoteText(m.citation.quote)}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
