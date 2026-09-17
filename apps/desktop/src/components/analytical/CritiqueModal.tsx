import React, { useState, useEffect } from "react";
import {
  CritiqueItem,
  CritiqueJudgment,
  CritiqueDefect,
  AnchoredCitation,
  ArgumentNode,
} from "../../lib/types/analytical";
import { citationPlace } from "../../lib/citations";

interface CritiqueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: CritiqueItem) => void;
  targetArgId?: string;
  targetCitation?: AnchoredCitation;
  argumentsList: ArgumentNode[];
  editingCritique: CritiqueItem | null;
  currentChapterFile?: string;
}

const DEFECT_OPTIONS: Array<{ id: CritiqueDefect; label: string; desc: string }> = [
  { id: "uninformed", label: "Uninformed", desc: "Author lacks relevant knowledge or evidence" },
  { id: "misinformed", label: "Misinformed", desc: "Author asserts falsehoods or factual errors" },
  { id: "illogical", label: "Illogical", desc: "Reasoning contains invalid inferences or contradictions" },
  { id: "incomplete", label: "Incomplete", desc: "Author failed to solve the structural problem posed" },
];

export const CritiqueModal: React.FC<CritiqueModalProps> = ({
  isOpen,
  onClose,
  onSave,
  targetArgId,
  targetCitation,
  argumentsList,
  editingCritique,
  currentChapterFile,
}) => {
  const [understandingDeclared, setUnderstandingDeclared] = useState<boolean>(false);
  const [judgment, setJudgment] = useState<CritiqueJudgment>("agree");
  const [defects, setDefects] = useState<CritiqueDefect[]>([]);
  const [rationale, setRationale] = useState<string>("");
  const [selectedArgId, setSelectedArgId] = useState<string>("");
  const [citation, setCitation] = useState<AnchoredCitation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingCritique) {
      setUnderstandingDeclared(editingCritique.understandingDeclared);
      setJudgment(editingCritique.judgment);
      setDefects(editingCritique.defects || []);
      setRationale(editingCritique.rationale || "");
      setSelectedArgId(editingCritique.targetArgumentId || "");
      setCitation(editingCritique.citation || null);
    } else {
      setUnderstandingDeclared(false);
      setJudgment("agree");
      setDefects([]);
      setRationale("");
      setSelectedArgId(targetArgId || "");
      setCitation(
        targetCitation ||
          (currentChapterFile
            ? { chapterFile: currentChapterFile, anchor: "", quote: "" }
            : null)
      );
    }
    setError(null);
  }, [editingCritique, targetArgId, targetCitation, currentChapterFile, isOpen]);

  if (!isOpen) return null;

  const targetArg = argumentsList.find((a) => a.id === selectedArgId);

  const toggleDefect = (defect: CritiqueDefect) => {
    setDefects((prev) =>
      prev.includes(defect) ? prev.filter((d) => d !== defect) : [...prev, defect]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!understandingDeclared) {
      setError("Rule 9 Precondition: You must certify comprehension before presenting an evaluation.");
      return;
    }
    if (!selectedArgId && (!citation || !citation.quote.trim())) {
      setError("Grounding Constraint: Critique must link to an author argument or an anchored passage citation.");
      return;
    }
    if (judgment === "disagree" && defects.length === 0) {
      setError("Rule 12: Disagreement requires designating at least one defect vector (Uninformed, Misinformed, Illogical, Incomplete).");
      return;
    }
    if (!rationale.trim()) {
      setError("Rules 10 & 11: Please provide an objective rationale for your critical judgment.");
      return;
    }

    const payload: CritiqueItem = {
      id: editingCritique ? editingCritique.id : `crit-${Date.now()}`,
      targetArgumentId: selectedArgId || null,
      citation: citation || (targetArg ? targetArg.conclusion : null),
      understandingDeclared: true,
      judgment,
      defects: judgment === "disagree" ? defects : [],
      rationale: rationale.trim(),
      createdAt: editingCritique ? editingCritique.createdAt : new Date().toISOString(),
    };

    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-xl border border-zinc-700/80 bg-zinc-900 shadow-2xl overflow-hidden text-zinc-100">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div>
            <span className="rounded bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-400">
              Stage III: Critical Evaluation (Rules 9–12)
            </span>
            <h3 className="mt-1 text-lg font-bold text-zinc-100">
              {editingCritique ? "Edit Critique" : "Evaluate Author Proposition"}
            </h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-xs">
          {error && (
            <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-rose-300">
              {error}
            </div>
          )}

          {/* Context Preview */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Target Grounding</span>
            {targetArg ? (
              <p className="text-zinc-200 font-medium">Argument: "{targetArg.title}"</p>
            ) : citation ? (
              <p className="text-zinc-300 italic truncate">Passage: "{citation.quote}" ({citationPlace(citation.chapterFile, citation.anchor)})</p>
            ) : (
              <p className="text-zinc-500 italic">No specific target linked (select chapter anchor or argument below)</p>
            )}
          </div>

          {/* Rule 9 Precondition Gate */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={understandingDeclared}
                onChange={(e) => setUnderstandingDeclared(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-amber-500/40 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-amber-200 font-medium leading-relaxed">
                Rule 9 Certification: "I confirm I have understood the author's propositions and arguments before judging."
              </span>
            </label>
          </div>

          {/* Judgment Selector (Disabled until Rule 9 is certified) */}
          <div className={`space-y-1.5 ${!understandingDeclared ? "opacity-40 pointer-events-none" : ""}`}>
            <label className="block font-semibold text-zinc-300">Judgment (Rule 9 Choice)</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setJudgment("agree")}
                className={`py-2 px-3 rounded-lg border font-semibold text-center transition-colors ${
                  judgment === "agree"
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                ✓ Agree
              </button>
              <button
                type="button"
                onClick={() => setJudgment("disagree")}
                className={`py-2 px-3 rounded-lg border font-semibold text-center transition-colors ${
                  judgment === "disagree"
                    ? "border-rose-500 bg-rose-500/20 text-rose-300"
                    : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                ✕ Disagree
              </button>
              <button
                type="button"
                onClick={() => setJudgment("suspend")}
                className={`py-2 px-3 rounded-lg border font-semibold text-center transition-colors ${
                  judgment === "suspend"
                    ? "border-amber-500 bg-amber-500/20 text-amber-300"
                    : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                ⏸ Suspend
              </button>
            </div>
          </div>

          {/* Defect Vectors if Disagree (Rule 12) */}
          {judgment === "disagree" && understandingDeclared && (
            <div className="space-y-2 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3">
              <label className="block font-semibold text-rose-300">
                Rule 12 Defect Vectors (Select at least 1)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {DEFECT_OPTIONS.map((opt) => {
                  const selected = defects.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleDefect(opt.id)}
                      className={`p-2 rounded border text-left transition-all ${
                        selected
                          ? "border-rose-500 bg-rose-500/30 text-rose-100"
                          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <div className="font-bold">{opt.label}</div>
                      <div className="text-[10px] text-zinc-400 leading-tight mt-0.5">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rationale Textarea (Rules 10 & 11) */}
          <div className="space-y-1">
            <label className="block font-semibold text-zinc-300">
              Evaluative Rationale &amp; Evidence (Rules 10 &amp; 11: Non-contentious)
            </label>
            <textarea
              rows={3}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="State reasons with objective evidence; avoid contentious contradiction..."
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 p-2.5 text-zinc-100 placeholder-zinc-500 focus:border-rose-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 font-medium text-zinc-400 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-rose-600 px-4 py-2 font-semibold text-white shadow hover:bg-rose-500"
            >
              {editingCritique ? "Update Critique" : "Save Critique"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
