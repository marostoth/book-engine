import React, { useState, useEffect, useRef } from "react";
import { useSyntopiconSession } from "../../hooks/useSyntopiconSession";
import { FileText, Download, Check, Copy, Scale } from "lucide-react";
import { useStartAgainWhen } from "../../hooks/useStartAgainWhen";
import { useSaveBeforeClose } from "../../hooks/useSaveBeforeClose";

interface SynthesisTabProps {
  session: ReturnType<typeof useSyntopiconSession>;
}

export const SynthesisTab: React.FC<SynthesisTabProps> = ({ session }) => {
  const { activeTopic, saveSynthesis, exportReport, isExporting, lastExportPath } = session;

  const [synthesisNotes, setSynthesisNotes] = useState(activeTopic?.synthesisNotes || "");
  const [resolution, setResolution] = useState(activeTopic?.dialecticalResolution || "");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "failed">("saved");
  const [copied, setCopied] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  /** Set while words wait to be saved, and only then. */
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  /** The save the timer started. Closing the window waits for it instead of starting a second one. */
  const savingRef = useRef<Promise<boolean> | null>(null);
  const latestNotesRef = useRef(synthesisNotes);
  const latestResRef = useRef(resolution);

  useEffect(() => {
    latestNotesRef.current = synthesisNotes;
    latestResRef.current = resolution;
  }, [synthesisNotes, resolution]);

  // The words on this tab belong to the topic they were written about, and go with it. An effect used to bring the
  // next topic's words in one drawing after its name was already at the top of the tab (TL-11).
  useStartAgainWhen(activeTopic?.id, () => {
    if (!activeTopic) return;
    setSynthesisNotes(activeTopic.synthesisNotes || "");
    setResolution(activeTopic.dialecticalResolution || "");
    setSaveStatus("saved");
    setExportSuccess(null);
  });

  /**
   * Saves the words that are waiting, and gives back that save. Nothing is waiting: nothing is saved, and what comes
   * back is the save still on its way, if there is one.
   */
  const saveWhatIsWaiting = () => {
    if (!debounceTimerRef.current) return savingRef.current;
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
    if (!activeTopic) return;
    return saveSynthesis(latestNotesRef.current, latestResRef.current);
  };

  // Leaving the tab, or the topic, saves the words that are waiting into the topic they were typed about. A timer
  // left to fire later would put that topic back on screen over the one opened since, and the pane would load for
  // ever. The clean-up is keyed on the topic's id and asks the newest `saveWhatIsWaiting` of that topic: the ref is
  // written after every clean-up of a drawing has run. It used to be keyed on the topic itself, which every save
  // replaces with a new object, so each save ran the clean-up and the clean-up saved again: 51 writes for one
  // sentence (RD-12).
  const topicId = activeTopic?.id;
  const saveOnLeaving = useRef(saveWhatIsWaiting);
  useEffect(() => {
    saveOnLeaving.current = saveWhatIsWaiting;
  });
  useEffect(() => () => void saveOnLeaving.current(), [topicId]);

  // Closing the window destroys this tab instead of unmounting it, so the clean-up above never runs then (DS-17).
  useSaveBeforeClose(saveWhatIsWaiting);

  const scheduleSave = (newNotes: string, newRes: string) => {
    setSaveStatus("saving");
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      // The words stop waiting when their save starts. The timer used to stay set, so they waited for ever (RD-12).
      debounceTimerRef.current = null;
      const saving = saveSynthesis(newNotes, newRes);
      savingRef.current = saving;
      setSaveStatus((await saving) ? "saved" : "failed");
    }, 800);
  };

  const handleNotesChange = (val: string) => {
    setSynthesisNotes(val);
    scheduleSave(val, resolution);
  };

  const handleResolutionChange = (val: string) => {
    setResolution(val);
    scheduleSave(synthesisNotes, val);
  };

  const handleExport = async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      const saved = await saveSynthesis(synthesisNotes, resolution);
      setSaveStatus(saved ? "saved" : "failed");
      // Save-Before-Export: notes that were not saved are not exported.
      if (!saved) return;
    }
    try {
      const path = await exportReport();
      setExportSuccess(path);
    } catch (e) {
      console.error("Export failed:", e);
    }
  };

  const handleCopyPath = () => {
    const p = exportSuccess || lastExportPath;
    if (!p) return;
    navigator.clipboard.writeText(p);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!activeTopic) return null;

  const totalTerms = activeTopic.neutralTerms.length;
  const totalQuestions = activeTopic.questions.length;
  const totalPerspectives = activeTopic.controversies.reduce(
    (acc, c) => acc + c.perspectives.length,
    0
  );
  const totalBooks = new Set([
    ...activeTopic.neutralTerms.flatMap((t) => t.mappings.map((m) => m.bookId)),
    ...activeTopic.controversies.flatMap((c) => c.perspectives.map((p) => p.bookId)),
  ]).size;

  return (
    <div className="space-y-4 text-xs">
      {/* Top Banner & Adlerian Directive */}
      <div className="p-3 bg-stone-900 border border-stone-800 rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-amber-500" />
            <h3 className="font-semibold text-stone-200">Rule 5: Analyzing the Discussion</h3>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
              saveStatus === "saved"
                ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60"
                : saveStatus === "failed"
                  ? "bg-red-950/60 text-red-400 border border-red-800/60"
                  : "bg-amber-950/60 text-amber-400 border border-amber-800/60 animate-pulse"
            }`}
          >
            {saveStatus === "saved" ? "Saved" : saveStatus === "failed" ? "Not saved" : "Saving..."}
          </span>
        </div>
        <p className="text-[11px] text-stone-400 leading-relaxed">
          Syntopical reading culminates in dialectical detachment. Analyze the clash of perspectives, order the debate by major cleavages of opinion, and distill the central truth without dogmatic bias.
        </p>

        {/* Metrics Row */}
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-stone-800/80 text-center font-mono text-[10px]">
          <div className="bg-stone-950/60 p-1.5 rounded border border-stone-800">
            <div className="text-amber-400 font-bold">{totalTerms}</div>
            <div className="text-stone-500 uppercase">Terms</div>
          </div>
          <div className="bg-stone-950/60 p-1.5 rounded border border-stone-800">
            <div className="text-amber-400 font-bold">{totalQuestions}</div>
            <div className="text-stone-500 uppercase">Questions</div>
          </div>
          <div className="bg-stone-950/60 p-1.5 rounded border border-stone-800">
            <div className="text-amber-400 font-bold">{totalPerspectives}</div>
            <div className="text-stone-500 uppercase">Perspectives</div>
          </div>
          <div className="bg-stone-950/60 p-1.5 rounded border border-stone-800">
            <div className="text-amber-400 font-bold">{totalBooks}</div>
            <div className="text-stone-500 uppercase">Books</div>
          </div>
        </div>
      </div>

      {/* Dialectical Discussion Notes */}
      <div className="space-y-1.5">
        <label className="flex items-center justify-between text-stone-300 font-medium">
          <span>Dialectical Discussion Notes (Cleavages & Fundamental Assumptions)</span>
          <span className="text-[10px] text-stone-500 font-normal">Markdown supported</span>
        </label>
        <textarea
          value={synthesisNotes}
          onChange={(e) => handleNotesChange(e.target.value)}
          rows={5}
          placeholder="Examine the intellectual tension between perspectives. What presuppositions divide the authors? How do their underlying definitions shape their opposing answers?"
          className="w-full bg-stone-900 border border-stone-800 rounded-lg p-3 text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/80 leading-relaxed font-sans text-xs resize-y"
        />
      </div>

      {/* Dialectical Resolution */}
      <div className="space-y-1.5">
        <label className="flex items-center justify-between text-stone-300 font-medium">
          <span>Dialectical Resolution & Truth Distillation</span>
          <span className="text-[10px] text-stone-500 font-normal">Objective synthesis</span>
        </label>
        <textarea
          value={resolution}
          onChange={(e) => handleResolutionChange(e.target.value)}
          rows={5}
          placeholder="State the objective distillation of the inquiry. Which facets of the question are settled? What remains unresolved or requires further inquiry?"
          className="w-full bg-stone-900 border border-stone-800 rounded-lg p-3 text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/80 leading-relaxed font-sans text-xs resize-y"
        />
      </div>

      {/* Export Section */}
      <div className="p-3 bg-stone-900/80 border border-stone-800 rounded-lg space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-stone-200 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-500" />
              Dossier Compiler
            </div>
            <div className="text-[11px] text-stone-500">
              Compile publication-grade Markdown report to <code className="text-stone-400 font-mono">vault/syntopicon/reports/</code>
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-semibold rounded-md shadow-sm transition-all text-xs"
          >
            {isExporting ? (
              <>
                <div className="w-3 h-3 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                Compiling...
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Export Dialectical Dossier
              </>
            )}
          </button>
        </div>

        {/* Export Success Pill */}
        {(exportSuccess || lastExportPath) && (
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-emerald-950/40 border border-emerald-800/60 rounded text-[11px] text-emerald-300">
            <span className="truncate font-mono">
              Exported: {exportSuccess || lastExportPath}
            </span>
            <button
              onClick={handleCopyPath}
              className="ml-2 px-1.5 py-0.5 hover:bg-emerald-900/60 rounded text-emerald-400 flex items-center gap-1 shrink-0"
              title="Copy relative path"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
