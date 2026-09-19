import React from "react";
import { useSettings } from "../../hooks/useSettings";
import { Timer, HelpCircle, Layers, PanelLeftClose, Keyboard } from "lucide-react";

/** The settings come from `useSettings`, so this tab takes no props at all (RD-09). */
export const InspectionalTab: React.FC = () => {
  const { settings: preferences, change: onPreferencesChange } = useSettings();
  const inspectional = preferences.inspectional;

  const updateInspectional = (patch: Partial<typeof inspectional>) => {
    onPreferencesChange({
      ...preferences,
      inspectional: {
        ...inspectional,
        ...patch,
      },
    });
  };

  const handleTimerChange = (delta: number) => {
    const next = Math.max(3, Math.min(60, inspectional.defaultTimerMinutes + delta));
    updateInspectional({ defaultTimerMinutes: next });
  };

  const handleDepthChange = (delta: number) => {
    const next = Math.max(1, Math.min(4, inspectional.samplingDepthParagraphs + delta));
    updateInspectional({ samplingDepthParagraphs: next });
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Skim Timer Target */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Timer className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
            <span className="font-semibold text-[var(--theme-text)]">Inspectional Timer</span>
          </div>
          <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
            Default countdown timer for systematic skimming
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--theme-bg)] p-1 rounded-lg border border-[var(--theme-border)]">
          <button
            type="button"
            aria-label="Shorter skimming timer"
            onClick={() => handleTimerChange(-5)}
            disabled={inspectional.defaultTimerMinutes <= 3}
            className="w-6 h-6 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
          >
            -
          </button>
          <span className="w-14 text-center font-mono font-bold text-[var(--theme-text)]">
            {inspectional.defaultTimerMinutes} min
          </span>
          <button
            type="button"
            aria-label="Longer skimming timer"
            onClick={() => handleTimerChange(5)}
            disabled={inspectional.defaultTimerMinutes >= 60}
            className="w-6 h-6 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      <div className="h-[1px] bg-[var(--theme-border)]" />

      {/* Sampling Depth */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
            <span className="font-semibold text-[var(--theme-text)]">Sampling Depth</span>
          </div>
          <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
            Paragraphs sampled at chapter start and end
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--theme-bg)] p-1 rounded-lg border border-[var(--theme-border)]">
          <button
            type="button"
            aria-label="Fewer sampled paragraphs"
            onClick={() => handleDepthChange(-1)}
            disabled={inspectional.samplingDepthParagraphs <= 1}
            className="w-6 h-6 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
          >
            -
          </button>
          <span className="w-12 text-center font-mono font-bold text-[var(--theme-text)]">
            {inspectional.samplingDepthParagraphs} paras
          </span>
          <button
            type="button"
            aria-label="More sampled paragraphs"
            onClick={() => handleDepthChange(1)}
            disabled={inspectional.samplingDepthParagraphs >= 4}
            className="w-6 h-6 rounded flex items-center justify-center font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      <div className="h-[1px] bg-[var(--theme-border)]" />

      {/* Auto Prompt Exit Card */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
            <span className="font-semibold text-[var(--theme-text)]">Exit Comprehension Card</span>
          </div>
          <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
            Prompt 1-question blueprint check when timer concludes
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Exit comprehension card"
          aria-checked={inspectional.autoPromptExitCard}
          onClick={() =>
            updateInspectional({ autoPromptExitCard: !inspectional.autoPromptExitCard })
          }
          className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer ${
            inspectional.autoPromptExitCard
              ? "bg-[var(--theme-accent)]"
              : "bg-black/20 dark:bg-white/20"
          }`}
        >
          <div
            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
              inspectional.autoPromptExitCard ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Auto Hide Drawer on Skim */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <PanelLeftClose className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
            <span className="font-semibold text-[var(--theme-text)]">Auto-Collapse Sidebar</span>
          </div>
          <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
            Maximize reading view when entering inspectional mode
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Auto-collapse sidebar"
          aria-checked={inspectional.autoHideDrawerOnSkim}
          onClick={() =>
            updateInspectional({ autoHideDrawerOnSkim: !inspectional.autoHideDrawerOnSkim })
          }
          className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer ${
            inspectional.autoHideDrawerOnSkim
              ? "bg-[var(--theme-accent)]"
              : "bg-black/20 dark:bg-white/20"
          }`}
        >
          <div
            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
              inspectional.autoHideDrawerOnSkim ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Single Key Paging */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Keyboard className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
            <span className="font-semibold text-[var(--theme-text)]">Single-Key Paging</span>
          </div>
          <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
            Use Space / Shift+Space for fluid section advancement
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Single-key paging"
          aria-checked={inspectional.singleKeyPagingEnabled}
          onClick={() =>
            updateInspectional({ singleKeyPagingEnabled: !inspectional.singleKeyPagingEnabled })
          }
          className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer ${
            inspectional.singleKeyPagingEnabled
              ? "bg-[var(--theme-accent)]"
              : "bg-black/20 dark:bg-white/20"
          }`}
        >
          <div
            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
              inspectional.singleKeyPagingEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
};
