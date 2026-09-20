import React, { useState, useMemo } from "react";
import { CheckCircle2, XCircle, HelpCircle, BookOpen, ChevronRight } from "lucide-react";
import { PracticeCardItem } from "../../lib/types";

interface ScenarioCardViewProps {
  card: PracticeCardItem;
  onAnswerSubmitted: (isCorrect: boolean) => void;
  onJumpToAnchor?: (chapterFile: string, anchor: string) => void;
}

// Fisher-Yates shuffle algorithm to prevent positional memory bias
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const ScenarioCardView: React.FC<ScenarioCardViewProps> = ({
  card,
  onAnswerSubmitted,
  onJumpToAnchor,
}) => {
  const payload = card.scenario_payload;
  // The window gives this a `key` of the card's id, so a new card is a new view with nothing chosen and nothing
  // sent. An effect used to clear both after the next card was already on screen (TL-11).
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Anti-bias: the order is shuffled once per card. The card's id is the `key` of this view and not a dependency
  // here: a new card builds this view again, so the shuffle runs again on its own.
  const options = useMemo(() => {
    const rawOptions = payload?.options || [];
    return shuffleArray(rawOptions);
  }, [payload?.options]);

  const selectedOption = options.find((o) => o.key === selectedKey);
  const isCorrect = selectedOption?.is_correct ?? false;
  const chapterFile = payload?.citation?.chapterFile || card.chapter_file;
  const anchor = payload?.citation?.anchor || card.anchor;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedKey || submitted) return;
    setSubmitted(true);
    onAnswerSubmitted(isCorrect);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Scenario Stem */}
      <div className="p-4 rounded-2xl bg-[var(--theme-bg)] border border-[var(--theme-border)] space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--theme-accent)]">
          <HelpCircle className="w-4 h-4" />
          <span>What comes next</span>
        </div>
        <p className="text-sm font-medium leading-relaxed text-[var(--theme-text)] select-text whitespace-pre-line">
          {payload?.scenario || card.prompt}
        </p>
      </div>

      {/* Options List */}
      <div className="space-y-2.5">
        <div className="text-xs font-semibold text-[var(--theme-muted)] px-1">
          Pick the sentence that comes right after the passage:
        </div>
        {options.map((opt, idx) => {
          const isSelected = selectedKey === opt.key;
          let btnStyle = "border-[var(--theme-border)] bg-[var(--theme-bg)] hover:border-[var(--theme-accent)]/50";

          if (submitted) {
            if (isSelected && opt.is_correct) {
              btnStyle = "border-emerald-500 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 font-semibold ring-1 ring-emerald-500/40";
            } else if (isSelected && !opt.is_correct) {
              btnStyle = "border-rose-500 bg-rose-500/15 text-rose-900 dark:text-rose-200 ring-1 ring-rose-500/40";
            } else if (opt.is_correct) {
              btnStyle = "border-emerald-500/60 bg-emerald-500/10 text-emerald-900 dark:text-emerald-300 ring-1 ring-emerald-500/30";
            } else {
              btnStyle = "border-[var(--theme-border)] opacity-50";
            }
          } else if (isSelected) {
            btnStyle = "border-[var(--theme-accent)] bg-[var(--theme-accent)]/10 ring-1 ring-[var(--theme-accent)]";
          }

          return (
            <button
              key={opt.key}
              type="button"
              disabled={submitted}
              onClick={() => setSelectedKey(opt.key)}
              className={`w-full text-left p-3.5 rounded-xl border text-xs sm:text-sm flex items-start gap-3 transition-all ${btnStyle}`}
            >
              <span className="font-mono font-bold px-2 py-0.5 rounded-lg bg-[var(--theme-surface)] border border-[var(--theme-border)] text-xs text-[var(--theme-muted)] shrink-0">
                {String.fromCharCode(65 + idx)}
              </span>
              <span className="flex-1 leading-normal select-text">{opt.text}</span>
              {submitted && opt.is_correct && (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              )}
              {submitted && isSelected && !opt.is_correct && (
                <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Action: Submit Button (before submission) */}
      {!submitted && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={!selectedKey}
            className="px-5 py-2.5 rounded-xl bg-[var(--theme-accent)] text-white text-xs sm:text-sm font-semibold hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 flex items-center gap-1.5"
          >
            <span>Check answer</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Evaluation & Rationale Callout (after submission) */}
      {submitted && (
        <div className={`p-4 rounded-2xl border space-y-3 animate-in fade-in duration-200 ${
          isCorrect ? "bg-emerald-500/10 border-emerald-500/30" : "bg-rose-500/10 border-rose-500/30"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isCorrect ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                    Right: this sentence comes next
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-rose-500" />
                  <span className="text-xs font-bold text-rose-900 dark:text-rose-300">
                    Not the next sentence
                  </span>
                </>
              )}
            </div>

            {onJumpToAnchor && anchor && (
              <button
                type="button"
                onClick={() => onJumpToAnchor(chapterFile, anchor)}
                className="flex items-center gap-1 text-[11px] font-medium text-[var(--theme-muted)] hover:text-[var(--theme-accent)] transition-colors"
                title="Verify anchor in chapter reader"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>{anchor}</span>
              </button>
            )}
          </div>

          {payload?.rationale && (
            <div className="text-xs leading-relaxed text-[var(--theme-text)] border-t border-[var(--theme-border)]/50 pt-2.5 space-y-1">
              <span className="font-bold text-[10px] uppercase tracking-wide text-[var(--theme-muted)] block">
                From the book:
              </span>
              <p className="select-text italic">{payload.rationale}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
