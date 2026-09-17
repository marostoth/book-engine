import React from "react";
import {
  ArgumentNode,
  InferenceType,
  AnchoredCitation,
} from "../../lib/types/analytical";
import { citationPlace } from "../../lib/citations";

interface ArgumentsTabProps {
  argumentsList: ArgumentNode[];
  onOpenArgumentModal: (arg?: ArgumentNode) => void;
  onOpenCritiqueModal: (
    targetArgId?: string,
    citation?: AnchoredCitation
  ) => void;
  onDeleteArgument: (id: string) => void;
  onNavigateCitation: (chapterFile: string, anchor: string) => void;
}

export const ArgumentsTab: React.FC<ArgumentsTabProps> = ({
  argumentsList,
  onOpenArgumentModal,
  onOpenCritiqueModal,
  onDeleteArgument,
  onNavigateCitation,
}) => {
  const getInferenceBadgeClass = (type: InferenceType) => {
    switch (type) {
      case "deductive":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
      case "inductive":
        return "bg-blue-500/20 text-blue-400 border-blue-500/40";
      case "analogical":
        return "bg-purple-500/20 text-purple-400 border-purple-500/40";
      default:
        return "bg-zinc-700/50 text-zinc-300 border-zinc-600";
    }
  };

  if (argumentsList.length === 0) {
    return (
      <div className="text-center py-10 px-4 text-zinc-500 space-y-1.5">
        <p className="font-medium text-zinc-400">No Arguments Constructed</p>
        <p className="text-[11px]">
          Rules 6 &amp; 7: Assemble propositions into premise-to-conclusion argument graphs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {argumentsList.map((arg) => (
        <div
          key={arg.id}
          className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2.5 shadow-sm hover:border-zinc-700"
        >
          <div className="flex items-start justify-between">
            <div>
              <span
                className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${getInferenceBadgeClass(
                  arg.inferenceType
                )}`}
              >
                {arg.inferenceType}
              </span>
              <h3 className="font-semibold text-zinc-100 text-sm mt-1">
                {arg.title}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onOpenCritiqueModal(arg.id, arg.conclusion)}
                className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 hover:bg-rose-500/20"
                title="Evaluate argument (Rules 9-12)"
              >
                Critique
              </button>
              <button
                onClick={() => onOpenArgumentModal(arg)}
                className="text-zinc-500 hover:text-zinc-300 p-0.5"
                title="Edit argument"
              >
                ✎
              </button>
              <button
                onClick={() => onDeleteArgument(arg.id)}
                className="text-zinc-500 hover:text-rose-400 p-0.5"
                title="Delete argument"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Conclusion */}
          <div className="rounded border border-sky-500/30 bg-sky-950/20 p-2 space-y-0.5">
            <div className="flex items-center justify-between text-[10px] uppercase font-bold text-sky-400">
              <span>Conclusion</span>
              <button
                onClick={() =>
                  onNavigateCitation(
                    arg.conclusion.chapterFile,
                    arg.conclusion.anchor
                  )
                }
                className="font-mono hover:underline text-sky-300"
              >
                {citationPlace(arg.conclusion.chapterFile, arg.conclusion.anchor)}
              </button>
            </div>
            <p className="text-zinc-200 italic">"{arg.conclusion.quote}"</p>
          </div>

          {/* Premises */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
              Premises:
            </span>
            {arg.premises.map((p, idx) => (
              <div
                key={idx}
                className="rounded border border-zinc-800 bg-zinc-950/50 p-1.5 space-y-0.5"
              >
                <div className="flex items-center justify-between text-[9px] text-zinc-400">
                  <span className="font-semibold text-zinc-300">P{idx + 1}</span>
                  <button
                    onClick={() => onNavigateCitation(p.chapterFile, p.anchor)}
                    className="font-mono hover:underline text-indigo-300"
                  >
                    {citationPlace(p.chapterFile, p.anchor)}
                  </button>
                </div>
                <p className="text-zinc-300 text-[10px]">"{p.quote}"</p>
              </div>
            ))}
          </div>

          {arg.notes && (
            <div className="pt-1 border-t border-zinc-800/80 text-[10px] text-zinc-400 leading-relaxed">
              <span className="font-medium text-zinc-300">Notes: </span>
              {arg.notes}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
