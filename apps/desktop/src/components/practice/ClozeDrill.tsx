import React from "react";
import { Eye } from "lucide-react";
import { PracticeCardItem } from "../../lib/types";

interface ClozeDrillProps {
  card: PracticeCardItem;
  userAnswer: string;
  onUserAnswerChange: (val: string) => void;
  revealed: boolean;
  onReveal: () => void;
}

export const ClozeDrill: React.FC<ClozeDrillProps> = ({
  card,
  userAnswer,
  onUserAnswerChange,
  revealed,
  onReveal,
}) => {
  const prompt = card.prompt;
  let before = prompt;
  const target = card.answer;
  let after = "";

  if (prompt.includes("{{c1::")) {
    const parts = prompt.split(/\{\{c1::.*?\}\}/);
    before = parts[0] || "";
    after = parts[1] || "";
  } else if (prompt.includes("==")) {
    const parts = prompt.split(/==.*?==/);
    before = parts[0] || "";
    after = parts[1] || "";
  } else {
    const idx = prompt.indexOf(target);
    if (idx !== -1) {
      before = prompt.substring(0, idx);
      after = prompt.substring(idx + target.length);
    }
  }

  const isMatch = userAnswer.trim().toLowerCase() === target.trim().toLowerCase();

  return (
    <div className="p-6 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 space-y-4">
      <div className="text-base sm:text-lg leading-relaxed text-neutral-800 dark:text-neutral-100 font-serif">
        <span>{before}</span>
        <span className="inline-block mx-1.5 align-baseline">
          {revealed ? (
            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 dark:bg-nord-accent/30 text-amber-900 dark:text-nord-accent font-bold border border-amber-500/40 dark:border-nord-accent/40 font-mono text-sm">
              {target}
            </span>
          ) : (
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => onUserAnswerChange(e.target.value)}
              placeholder="type answer..."
              autoFocus
              className={`px-2.5 py-0.5 rounded-lg border text-sm font-mono font-medium outline-none transition-all duration-150 ${
                isMatch
                  ? "bg-emerald-500/15 border-emerald-500 text-emerald-900 dark:text-emerald-300"
                  : "bg-black/[0.04] dark:bg-white/[0.06] border-black/20 dark:border-white/20 focus:border-amber-600 dark:focus:border-nord-accent focus:bg-white dark:focus:bg-stone-800"
              }`}
              style={{ minWidth: `${Math.max(120, target.length * 10)}px` }}
            />
          )}
        </span>
        <span>{after}</span>
      </div>

      {!revealed && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-neutral-400">
            Type answer and press Enter, or click Show Answer.
          </p>
          <button
            type="button"
            onClick={onReveal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 transition-all"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Show Answer</span>
          </button>
        </div>
      )}
    </div>
  );
};
