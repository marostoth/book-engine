import React from "react";
import {
  CritiqueItem,
  ArgumentNode,
  AnchoredCitation,
  CritiqueJudgment,
  CritiqueDefect,
} from "../../lib/types/analytical";

interface CritiqueTabProps {
  critiques: CritiqueItem[];
  argumentsList: ArgumentNode[];
  onOpenCritiqueModal: (targetArgId?: string, citation?: AnchoredCitation, critique?: CritiqueItem) => void;
  onDeleteCritique: (id: string) => void;
  onNavigateCitation: (chapterFile: string, anchor: string) => void;
}

export const CritiqueTab: React.FC<CritiqueTabProps> = ({
  critiques,
  argumentsList,
  onOpenCritiqueModal,
  onDeleteCritique,
  onNavigateCitation,
}) => {
  const agreeCount = critiques.filter((c) => c.judgment === "agree").length;
  const disagreeCount = critiques.filter((c) => c.judgment === "disagree").length;
  const suspendCount = critiques.filter((c) => c.judgment === "suspend").length;

  const defectCounts: Record<CritiqueDefect, number> = {
    uninformed: 0,
    misinformed: 0,
    illogical: 0,
    incomplete: 0,
  };
  critiques.forEach((c) => {
    (c.defects || []).forEach((d) => {
      if (defectCounts[d] !== undefined) defectCounts[d]++;
    });
  });

  const getJudgmentBadge = (j: CritiqueJudgment) => {
    switch (j) {
      case "agree":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
      case "disagree":
        return "bg-rose-500/20 text-rose-400 border-rose-500/40";
      case "suspend":
        return "bg-amber-500/20 text-amber-400 border-amber-500/40";
    }
  };

  return (
    <div className="space-y-4">
      {/* Metric Summary Cards */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2">
          <div className="text-lg font-bold text-emerald-400">{agreeCount}</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">Agree</div>
        </div>
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-2">
          <div className="text-lg font-bold text-rose-400">{disagreeCount}</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">Disagree</div>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2">
          <div className="text-lg font-bold text-amber-400">{suspendCount}</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">Suspend</div>
        </div>
      </div>

      {/* Defect Vector Distribution */}
      {disagreeCount > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
            Rule 12 Defect Distribution
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["uninformed", "misinformed", "illogical", "incomplete"] as CritiqueDefect[]).map((d) => (
              <span
                key={d}
                className={`text-[10px] px-2 py-0.5 rounded-full border ${
                  defectCounts[d] > 0
                    ? "border-rose-500/40 bg-rose-500/15 text-rose-300 font-semibold"
                    : "border-zinc-800 text-zinc-600"
                }`}
              >
                {d}: {defectCounts[d]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Critiques List */}
      {critiques.length === 0 ? (
        <div className="text-center py-10 px-4 text-zinc-500 space-y-2">
          <p className="font-semibold text-zinc-400">No Critical Evaluations Logged</p>
          <p className="text-[11px] leading-relaxed">
            Mortimer Adler Stage III (Rules 9–12): Do not judge until you understand.
            Evaluate author propositions by clicking [Critique] on an argument or selecting text.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {critiques.map((crit) => {
            const targetArg = argumentsList.find((a) => a.id === crit.targetArgumentId);
            const targetCitation = crit.citation || (targetArg ? targetArg.conclusion : null);

            return (
              <div
                key={crit.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2.5 shadow-sm hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getJudgmentBadge(
                        crit.judgment
                      )}`}
                    >
                      {crit.judgment}
                    </span>
                    {targetArg && (
                      <span className="font-semibold text-zinc-200 text-xs truncate max-w-[140px]" title={targetArg.title}>
                        {targetArg.title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onOpenCritiqueModal(crit.targetArgumentId || undefined, targetCitation || undefined, crit)}
                      className="text-zinc-500 hover:text-zinc-300 p-0.5"
                      title="Edit critique"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => onDeleteCritique(crit.id)}
                      className="text-zinc-500 hover:text-rose-400 p-0.5"
                      title="Delete critique"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Defect Vector Tags */}
                {crit.defects && crit.defects.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {crit.defects.map((def) => (
                      <span
                        key={def}
                        className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      >
                        {def}
                      </span>
                    ))}
                  </div>
                )}

                {/* Rationale */}
                <p className="text-zinc-300 text-xs leading-relaxed bg-zinc-950/40 p-2 rounded border border-zinc-800/60">
                  {crit.rationale}
                </p>

                {/* Grounding Citation Jump Pill */}
                {targetCitation && (
                  <div className="flex items-center justify-between text-[10px] pt-0.5">
                    <button
                      onClick={() => onNavigateCitation(targetCitation.chapterFile, targetCitation.anchor)}
                      className="flex items-center gap-1 font-mono text-rose-400/90 hover:text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30"
                      title="Jump to cited anchor"
                    >
                      <span>§</span>
                      <span>{targetCitation.chapterFile}#{targetCitation.anchor}</span>
                    </button>
                    {targetCitation.quote && (
                      <span className="text-zinc-500 truncate max-w-[130px]" title={targetCitation.quote}>
                        "{targetCitation.quote}"
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
