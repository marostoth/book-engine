import React from "react";
import { ReaderPreferences } from "../../lib/types";
import { ShieldCheck, Target, RefreshCw, BarChart3, BrainCircuit, ListOrdered } from "lucide-react";

interface PracticeTabProps {
  preferences: ReaderPreferences;
  onPreferencesChange: (prefs: ReaderPreferences) => void;
  onResyncDeck?: () => void;
  onOpenAnalytics?: () => void;
  dueCardsCount?: number;
  onClosePopover?: () => void;
}

export const PracticeTab: React.FC<PracticeTabProps> = ({
  preferences,
  onPreferencesChange,
  onResyncDeck,
  onOpenAnalytics,
  dueCardsCount = 0,
  onClosePopover,
}) => {
  const study = preferences.study;

  const updateStudy = (patch: Partial<typeof study>) => {
    onPreferencesChange({
      ...preferences,
      study: {
        ...study,
        ...patch,
      },
      gatekeeperMode: patch.gatekeeperMode !== undefined ? patch.gatekeeperMode : study.gatekeeperMode,
      dailyTarget: patch.dailyTargetCards !== undefined ? patch.dailyTargetCards : study.dailyTargetCards,
    });
  };

  const handleTargetChange = (delta: number) => {
    const next = Math.max(5, Math.min(100, study.dailyTargetCards + delta));
    updateStudy({ dailyTargetCards: next });
  };

  const handleQuotaChange = (delta: number) => {
    const next = Math.max(1, Math.min(10, study.gatekeeperQuota + delta));
    updateStudy({ gatekeeperQuota: next });
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Chapter Gatekeeper Mode Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
            <span className="font-semibold text-[var(--theme-text)]">Chapter Gatekeeper</span>
          </div>
          <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
            Require recall challenge before advancing chapters
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Chapter gatekeeper"
          aria-checked={study.gatekeeperMode}
          onClick={() => updateStudy({ gatekeeperMode: !study.gatekeeperMode })}
          className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer ${
            study.gatekeeperMode ? "bg-[var(--theme-accent)]" : "bg-black/20 dark:bg-white/20"
          }`}
        >
          <div
            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
              study.gatekeeperMode ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {study.gatekeeperMode && (
        <div className="flex items-center justify-between gap-3 pl-5">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--theme-muted)]">
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Gatekeeper Card Quota</span>
          </div>
          <div className="flex items-center gap-1.5 bg-[var(--theme-bg)] p-1 rounded-lg border border-[var(--theme-border)]">
            <button
              type="button"
              aria-label="Fewer gatekeeper cards"
              onClick={() => handleQuotaChange(-1)}
              disabled={study.gatekeeperQuota <= 1}
              className="w-5 h-5 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
            >
              -
            </button>
            <span className="w-8 text-center font-mono font-bold text-[var(--theme-text)]">
              {study.gatekeeperQuota}
            </span>
            <button
              type="button"
              aria-label="More gatekeeper cards"
              onClick={() => handleQuotaChange(1)}
              disabled={study.gatekeeperQuota >= 10}
              className="w-5 h-5 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
      )}

      <div className="h-[1px] bg-[var(--theme-border)]" />

      {/* Daily Review Target Stepper */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Target className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
            <span className="font-semibold text-[var(--theme-text)]">Daily Review Target</span>
          </div>
          <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
            Target cards scheduled per study session
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--theme-bg)] p-1 rounded-lg border border-[var(--theme-border)]">
          <button
            type="button"
            aria-label="Lower daily review target"
            onClick={() => handleTargetChange(-5)}
            disabled={study.dailyTargetCards <= 5}
            className="w-6 h-6 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
          >
            -
          </button>
          <span className="w-10 text-center font-mono font-bold text-[var(--theme-text)]">
            {study.dailyTargetCards}
          </span>
          <button
            type="button"
            aria-label="Higher daily review target"
            onClick={() => handleTargetChange(5)}
            disabled={study.dailyTargetCards >= 100}
            className="w-6 h-6 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      <div className="h-[1px] bg-[var(--theme-border)]" />

      {/* Practice Mode Selector */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <BrainCircuit className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
          <span className="text-[11px] font-semibold text-[var(--theme-muted)] uppercase tracking-wider">
            Practice Item Mode
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 bg-[var(--theme-bg)] p-1 rounded-xl border border-[var(--theme-border)]">
          {(
            [
              { id: "verbatim", label: "Verbatim" },
              { id: "mcq_scenario", label: "MCQ" },
              { id: "hybrid", label: "Hybrid" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => updateStudy({ practiceMode: m.id })}
              className={`py-1.5 px-2 rounded-lg font-medium transition-all text-center ${
                study.practiceMode === m.id
                  ? "bg-[var(--theme-accent)] text-white font-semibold shadow-sm"
                  : "text-[var(--theme-text)] hover:bg-[var(--theme-surface)]"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {study.practiceMode === "hybrid" && (
          <div className="mt-2.5 p-2 rounded-xl bg-[var(--theme-bg)] border border-[var(--theme-border)] space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-[var(--theme-muted)]">
              <span>Deck Ratio (Cloze : MCQ)</span>
              <span className="font-mono font-bold text-[var(--theme-accent)]">
                {study.hybridRatio === 0.7 ? "70 : 30" : study.hybridRatio === 0.3 ? "30 : 70" : "50 : 50"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {[
                { ratio: 0.5, label: "50:50" },
                { ratio: 0.7, label: "70:30" },
                { ratio: 0.3, label: "30:70" },
              ].map((r) => (
                <button
                  key={r.ratio}
                  type="button"
                  onClick={() => updateStudy({ hybridRatio: r.ratio })}
                  className={`py-1 rounded-lg text-[10px] font-semibold transition-all ${
                    (study.hybridRatio ?? 0.5) === r.ratio
                      ? "bg-[var(--theme-accent)] text-white shadow-sm"
                      : "text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface)]"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="h-[1px] bg-[var(--theme-border)]" />

      {/* Action Buttons: Sync Deck & Open Analytics */}
      <div className="pt-1 flex items-center justify-between gap-2">
        {onOpenAnalytics && (
          <button
            type="button"
            onClick={() => {
              onOpenAnalytics();
              if (onClosePopover) onClosePopover();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium text-[var(--theme-text)] bg-[var(--theme-bg)] hover:bg-[var(--theme-border)]/30 border border-[var(--theme-border)] transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
            <span>Analytics</span>
          </button>
        )}

        {onResyncDeck && (
          <button
            type="button"
            onClick={() => {
              onResyncDeck();
              if (onClosePopover) onClosePopover();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-[var(--theme-accent)] bg-[var(--theme-accent)]/10 hover:bg-[var(--theme-accent)]/20 border border-[var(--theme-accent)]/30 transition-colors ml-auto shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync Deck ({dueCardsCount})</span>
          </button>
        )}
      </div>
    </div>
  );
};
