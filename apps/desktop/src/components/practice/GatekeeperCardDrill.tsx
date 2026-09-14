import React, { useState, useEffect, useMemo } from "react";
import { PracticeCardItem } from "../../lib/types";
import { HelpCircle, CheckCircle2, XCircle } from "lucide-react";

interface GatekeeperCardDrillProps {
  card: PracticeCardItem;
  userAnswer: string;
  onUserAnswerChange: (val: string) => void;
  revealed: boolean;
  onReveal: () => void;
  onScenarioEvaluated?: (isCorrect: boolean) => void;
}

export const GatekeeperCardDrill: React.FC<GatekeeperCardDrillProps> = ({
  card,
  userAnswer,
  onUserAnswerChange,
  revealed,
  onReveal,
  onScenarioEvaluated,
}) => {
  const isScenario =
    card.card_type === "scenario" ||
    card.item_type === "scenario" ||
    !!card.scenario_payload;

  const payload = card.scenario_payload;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    setSelectedKey(null);
  }, [card.card_id]);

  const options = useMemo(() => {
    return payload?.options || [];
  }, [payload?.options]);

  if (isScenario) {
    const handleSelectOption = (key: string, isCorrect: boolean) => {
      if (revealed) return;
      setSelectedKey(key);
      onReveal();
      if (onScenarioEvaluated) {
        onScenarioEvaluated(isCorrect);
      }
    };

    return (
      <div className="space-y-3 text-xs">
        <div className="p-3 rounded-xl bg-[var(--theme-surface)] border border-[var(--theme-border)] space-y-1">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[var(--theme-accent)] text-[10px]">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Scenario Analysis Challenge</span>
          </div>
          <p className="font-medium text-[var(--theme-text)] leading-relaxed whitespace-pre-line">
            {payload?.scenario || card.prompt}
          </p>
        </div>

        <div className="space-y-1.5">
          {options.map((opt, idx) => {
            const isSelected = selectedKey === opt.key;
            let btnStyle = "border-[var(--theme-border)] bg-[var(--theme-surface)] hover:border-[var(--theme-accent)]/50";

            if (revealed) {
              if (isSelected && opt.is_correct) {
                btnStyle = "border-emerald-500 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 font-semibold";
              } else if (isSelected && !opt.is_correct) {
                btnStyle = "border-rose-500 bg-rose-500/15 text-rose-900 dark:text-rose-200";
              } else if (opt.is_correct) {
                btnStyle = "border-emerald-500/60 bg-emerald-500/10 text-emerald-900 dark:text-emerald-300 font-semibold";
              } else {
                btnStyle = "border-[var(--theme-border)] opacity-40";
              }
            } else if (isSelected) {
              btnStyle = "border-[var(--theme-accent)] bg-[var(--theme-accent)]/10";
            }

            return (
              <button
                key={opt.key}
                type="button"
                disabled={revealed}
                onClick={() => handleSelectOption(opt.key, opt.is_correct)}
                className={`w-full text-left p-2.5 rounded-xl border text-xs flex items-start gap-2.5 transition-all cursor-pointer ${btnStyle}`}
              >
                <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[10px] text-[var(--theme-muted)] shrink-0">
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="flex-1 leading-normal">{opt.text}</span>
                {revealed && opt.is_correct && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                )}
                {revealed && isSelected && !opt.is_correct && (
                  <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                )}
              </button>
            );
          })}
        </div>

        {revealed && payload?.rationale && (
          <div className="p-2.5 rounded-xl bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20 text-[11px] text-[var(--theme-text)] space-y-1 animate-in fade-in duration-150">
            <span className="font-bold uppercase tracking-wider text-[var(--theme-accent)] text-[9px] block">
              Extractive Grounding:
            </span>
            <p className="italic leading-relaxed">"{payload.rationale}"</p>
          </div>
        )}
      </div>
    );
  }

  // Cloze Drill inline
  let before = card.prompt;
  const target = card.answer;
  let after = "";

  if (card.prompt.includes("{{c1::")) {
    const parts = card.prompt.split(/\{\{c1::.*?\}\}/);
    before = parts[0] || "";
    after = parts[1] || "";
  } else if (card.prompt.includes("==")) {
    const parts = card.prompt.split(/==.*?==/);
    before = parts[0] || "";
    after = parts[1] || "";
  }

  const isMatch = userAnswer.trim().toLowerCase() === target.trim().toLowerCase();

  return (
    <div className="text-sm sm:text-base leading-relaxed text-[var(--theme-text)] font-serif">
      <span>{before}</span>
      <span className="inline-block mx-1.5 align-baseline">
        {revealed ? (
          <span className="px-2 py-0.5 rounded-md bg-[var(--theme-accent)]/20 text-[var(--theme-accent)] font-mono font-bold text-xs border border-[var(--theme-accent)]/40">
            {target}
          </span>
        ) : (
          <input
            type="text"
            value={userAnswer}
            onChange={(e) => onUserAnswerChange(e.target.value)}
            placeholder="type answer..."
            autoFocus
            className={`px-2 py-0.5 rounded-md border text-xs font-mono font-medium outline-none transition-all ${
              isMatch
                ? "bg-emerald-500/15 border-emerald-500 text-emerald-900 dark:text-emerald-300"
                : "bg-[var(--theme-bg)] border-[var(--theme-border)] text-[var(--theme-text)] focus:border-[var(--theme-accent)]"
            }`}
            style={{ minWidth: `${Math.max(100, target.length * 9)}px` }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && userAnswer.trim()) {
                onReveal();
              }
            }}
          />
        )}
      </span>
      <span>{after}</span>
    </div>
  );
};
