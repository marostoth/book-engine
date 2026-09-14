import React, { useState, useEffect } from "react";
import {
  ArgumentNode,
  InferenceType,
  AnchoredCitation,
} from "../../lib/types/analytical";

interface ArgumentBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (arg: ArgumentNode) => void;
  stagedCitation: AnchoredCitation | null;
  editingArgument: ArgumentNode | null;
  currentChapterFile?: string;
}

export const ArgumentBuilderModal: React.FC<ArgumentBuilderModalProps> = ({
  isOpen,
  onClose,
  onSave,
  stagedCitation,
  editingArgument,
  currentChapterFile,
}) => {
  const [title, setTitle] = useState("");
  const [inferenceType, setInferenceType] = useState<InferenceType>("deductive");
  const [conclusion, setConclusion] = useState<AnchoredCitation>({
    chapterFile: "",
    anchor: "^p-001",
    quote: "",
  });
  const [premises, setPremises] = useState<AnchoredCitation[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingArgument) {
      setTitle(editingArgument.title);
      setInferenceType(editingArgument.inferenceType);
      setConclusion(editingArgument.conclusion);
      setPremises(editingArgument.premises);
      setNotes(editingArgument.notes);
    } else if (stagedCitation) {
      setTitle("");
      setInferenceType("deductive");
      setConclusion(stagedCitation);
      setPremises([
        {
          chapterFile: currentChapterFile || stagedCitation.chapterFile,
          anchor: "^p-001",
          quote: "",
        },
      ]);
      setNotes("");
    } else {
      const defaultChap = currentChapterFile || "unknown.md";
      setTitle("");
      setInferenceType("deductive");
      setConclusion({ chapterFile: defaultChap, anchor: "^p-001", quote: "" });
      setPremises([{ chapterFile: defaultChap, anchor: "^p-002", quote: "" }]);
      setNotes("");
    }
    setError(null);
  }, [editingArgument, stagedCitation, currentChapterFile, isOpen]);

  if (!isOpen) return null;

  const handleAddPremise = () => {
    if (premises.length >= 4) return;
    setPremises([
      ...premises,
      {
        chapterFile: currentChapterFile || conclusion.chapterFile,
        anchor: `^p-00${premises.length + 2}`,
        quote: "",
      },
    ]);
  };

  const handleRemovePremise = (index: number) => {
    if (premises.length <= 1) return;
    setPremises(premises.filter((_, i) => i !== index));
  };

  const handlePremiseChange = (
    index: number,
    field: keyof AnchoredCitation,
    value: string
  ) => {
    const next = [...premises];
    next[index] = { ...next[index], [field]: value };
    setPremises(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please specify an argument title.");
      return;
    }
    if (!conclusion.quote.trim()) {
      setError("Please provide the verbatim text for the conclusion proposition.");
      return;
    }
    if (premises.length === 0 || !premises[0].quote.trim()) {
      setError("Please supply at least one supporting premise with verbatim quote.");
      return;
    }

    const payload: ArgumentNode = {
      id: editingArgument ? editingArgument.id : `arg-${Date.now()}`,
      title: title.trim(),
      inferenceType,
      conclusion,
      premises: premises.filter((p) => p.quote.trim().length > 0),
      notes: notes.trim(),
    };

    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-zinc-700/80 bg-zinc-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-400">
                Rules 6 &amp; 7: Propositions &amp; Arguments
              </span>
            </div>
            <h3 className="mt-1 text-lg font-bold text-zinc-100">
              {editingArgument ? "Edit Argument Graph" : "Assemble Argument Graph"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-sm">
          {error && (
            <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block font-medium text-zinc-300 mb-1">Argument Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Tendency of the Rate of Profit to Fall"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-sky-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-300 mb-1">Inference Type</label>
              <select
                value={inferenceType}
                onChange={(e) => setInferenceType(e.target.value as InferenceType)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 focus:border-sky-500 focus:outline-none"
              >
                <option value="deductive">Deductive (Necessary)</option>
                <option value="inductive">Inductive (Probable)</option>
                <option value="analogical">Analogical (Structural)</option>
              </select>
            </div>
          </div>

          {/* Conclusion */}
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wider text-sky-400">
                Main Conclusion (Rule 6 Proposition)
              </span>
              <span className="text-zinc-400">{conclusion.chapterFile} #{conclusion.anchor}</span>
            </div>
            <textarea
              rows={2}
              value={conclusion.quote}
              onChange={(e) => setConclusion({ ...conclusion, quote: e.target.value })}
              placeholder="Verbatim conclusion proposition from the text..."
              className="w-full rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Premises */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Supporting Premises ({premises.length}/4)
              </label>
              {premises.length < 4 && (
                <button
                  type="button"
                  onClick={handleAddPremise}
                  className="text-xs text-sky-400 hover:text-sky-300 font-medium"
                >
                  + Add Premise
                </button>
              )}
            </div>

            {premises.map((p, idx) => (
              <div key={idx} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-300">Premise {idx + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500">{p.chapterFile} #{p.anchor}</span>
                    {premises.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemovePremise(idx)}
                        className="text-zinc-500 hover:text-rose-400"
                        title="Remove premise"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={p.quote}
                  onChange={(e) => handlePremiseChange(idx, "quote", e.target.value)}
                  placeholder="Verbatim premise proposition..."
                  className="w-full rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-sky-500 focus:outline-none"
                />
              </div>
            ))}
          </div>

          {/* Notes & Critique */}
          <div>
            <label className="block font-medium text-zinc-300 mb-1">
              Analytical Notes / Critique
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Critique: valid steps, missing premises, or unstated assumptions..."
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-sky-500 focus:outline-none text-xs"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-sky-500"
            >
              {editingArgument ? "Update Argument" : "Save Argument"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
