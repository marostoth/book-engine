import React from "react";

interface RatingBarProps {
  onRate: (rating: number) => void;
  submitting: boolean;
}

export const RatingBar: React.FC<RatingBarProps> = ({ onRate, submitting }) => {
  return (
    <div className="pt-2 space-y-2 animate-in fade-in duration-150">
      <p className="text-center text-[11px] text-neutral-400 font-medium">
        Rate recall difficulty (Hotkeys: 1, 2, 3, 4):
      </p>

      <div className="grid grid-cols-4 gap-2">
        {/* Again (1) */}
        <button
          type="button"
          onClick={() => onRate(1)}
          disabled={submitting}
          className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-900 dark:text-red-300 flex flex-col items-center gap-1 transition-all active:scale-95"
        >
          <span className="text-xs font-bold">Again</span>
          <span className="text-[10px] text-red-700 dark:text-red-400 font-mono">&lt; 10m</span>
          <kbd className="text-[9px] px-1 rounded bg-red-500/20 font-mono">1</kbd>
        </button>

        {/* Hard (2) */}
        <button
          type="button"
          onClick={() => onRate(2)}
          disabled={submitting}
          className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-300 flex flex-col items-center gap-1 transition-all active:scale-95"
        >
          <span className="text-xs font-bold">Hard</span>
          <span className="text-[10px] text-amber-700 dark:text-amber-400 font-mono">~1d</span>
          <kbd className="text-[9px] px-1 rounded bg-amber-500/20 font-mono">2</kbd>
        </button>

        {/* Good (3) */}
        <button
          type="button"
          onClick={() => onRate(3)}
          disabled={submitting}
          className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 flex flex-col items-center gap-1 transition-all active:scale-95"
        >
          <span className="text-xs font-bold">Good</span>
          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono">~3d</span>
          <kbd className="text-[9px] px-1 rounded bg-emerald-500/20 font-mono">3</kbd>
        </button>

        {/* Easy (4) */}
        <button
          type="button"
          onClick={() => onRate(4)}
          disabled={submitting}
          className="p-3 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-900 dark:text-sky-300 flex flex-col items-center gap-1 transition-all active:scale-95"
        >
          <span className="text-xs font-bold">Easy</span>
          <span className="text-[10px] text-sky-700 dark:text-sky-400 font-mono">~7d</span>
          <kbd className="text-[9px] px-1 rounded bg-sky-500/20 font-mono">4</kbd>
        </button>
      </div>
    </div>
  );
};
