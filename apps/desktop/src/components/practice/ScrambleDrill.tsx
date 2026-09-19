import React, { useState } from "react";
import { RotateCcw, CheckCircle2, AlertCircle, X } from "lucide-react";
import { PracticeCardItem } from "../../lib/types";
import { scramblePieces } from "../../lib/practiceSession";

interface ScrambleDrillProps {
  card: PracticeCardItem;
  revealed: boolean;
  onReveal: () => void;
}

/**
 * The puzzle of one card. The window gives this a `key` of the card's id, so a new card is a new drill and the
 * pieces are in place before it is drawn. An effect used to build them after an empty drill was on screen (TL-11).
 */
export const ScrambleDrill: React.FC<ScrambleDrillProps> = ({
  card,
  revealed,
  onReveal,
}) => {
  const [scramblePool, setScramblePool] = useState<string[]>(() => scramblePieces(card.prompt));
  const [assembledClauses, setAssembledClauses] = useState<string[]>([]);
  const [scrambleCorrect, setScrambleCorrect] = useState<boolean | null>(null);

  const handleSelectScramblePiece = (piece: string, index: number) => {
    setAssembledClauses((prev) => [...prev, piece]);
    setScramblePool((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveAssembledPiece = (piece: string, index: number) => {
    setScramblePool((prev) => [...prev, piece]);
    setAssembledClauses((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCheckScramble = () => {
    const assembledText = assembledClauses.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
    const targetText = card.answer.replace(/\s+/g, " ").trim().toLowerCase();
    const isCorrect = assembledText === targetText || targetText.includes(assembledText);
    setScrambleCorrect(isCorrect);
    onReveal();
  };

  const handleReset = () => {
    setScramblePool([...scramblePool, ...assembledClauses]);
    setAssembledClauses([]);
    setScrambleCorrect(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
        Reorder the scrambled clauses into the original verbatim argument:
      </p>

      {/* Assembled Workspace */}
      <div className="min-h-24 p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border-2 border-dashed border-black/15 dark:border-white/15 flex flex-wrap gap-2 items-center">
        {assembledClauses.length === 0 ? (
          <span className="text-xs text-neutral-400 italic">
            Click clauses below in the correct order to assemble the sentence...
          </span>
        ) : (
          assembledClauses.map((clause, idx) => (
            <button
              key={`asm-${idx}`}
              type="button"
              onClick={() => handleRemoveAssembledPiece(clause, idx)}
              className="px-3 py-1.5 rounded-xl bg-amber-500/15 dark:bg-nord-accent/20 border border-amber-500/30 dark:border-nord-accent/30 text-neutral-800 dark:text-neutral-100 text-xs font-serif font-medium hover:bg-red-500/15 hover:border-red-500/30 transition-all flex items-center gap-1.5 group"
              title="Click to remove"
            >
              <span>{clause}</span>
              <X className="w-3 h-3 text-neutral-400 group-hover:text-red-500" />
            </button>
          ))
        )}
      </div>

      {/* Scrambled Pool */}
      {scramblePool.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {scramblePool.map((piece, idx) => (
            <button
              key={`pool-${idx}`}
              type="button"
              onClick={() => handleSelectScramblePiece(piece, idx)}
              className="px-3 py-1.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/12 text-neutral-800 dark:text-neutral-200 text-xs font-serif transition-all active:scale-95"
            >
              {piece}
            </button>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset Order</span>
        </button>

        <div className="flex items-center gap-2">
          {!revealed && (
            <>
              <button
                type="button"
                onClick={onReveal}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                Reveal
              </button>
              <button
                type="button"
                onClick={handleCheckScramble}
                disabled={assembledClauses.length === 0}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 dark:bg-nord-accent text-white hover:bg-amber-700 dark:hover:bg-nord-accent/90 disabled:opacity-40 transition-all shadow-sm"
              >
                Check Order
              </button>
            </>
          )}
        </div>
      </div>

      {scrambleCorrect !== null && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            scrambleCorrect
              ? "bg-emerald-500/15 text-emerald-900 dark:text-emerald-300 border border-emerald-500/30"
              : "bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/30"
          }`}
        >
          {scrambleCorrect ? (
            <>
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              <span>Perfect! The clauses match the original text sequence.</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
              <span>Close! Compare your sequence against the source below.</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
