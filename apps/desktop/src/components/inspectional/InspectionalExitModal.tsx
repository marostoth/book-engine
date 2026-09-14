import React, { useState, useEffect } from "react";
import { X, Check, BookCheck, Plus, Trash2, HelpCircle } from "lucide-react";
import { ExitAssessmentPayload } from "../../lib/types";
import { saveInspectionalExitAssessment } from "../../lib/api";

interface InspectionalExitModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookId: string;
  bookTitle: string;
  initialAssessment?: ExitAssessmentPayload | null;
  onSaved?: (assessment: ExitAssessmentPayload) => void;
}

export const InspectionalExitModal: React.FC<InspectionalExitModalProps> = ({
  isOpen,
  onClose,
  bookId,
  bookTitle,
  initialAssessment,
  onSaved,
}) => {
  const [kind, setKind] = useState<"Theoretical" | "Practical">("Theoretical");
  const [category, setCategory] = useState<string>("Science");
  const [unityStatement, setUnityStatement] = useState<string>("");
  const [parts, setParts] = useState<string[]>(["", "", ""]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialAssessment) {
      const partsArr = initialAssessment.partsStructure || [];
      setParts(partsArr.length >= 3 ? partsArr : [...partsArr, "", "", ""].slice(0, 3));
      setUnityStatement(initialAssessment.unityStatement || "");
      if (initialAssessment.classification.includes("Practical")) {
        setKind("Practical");
      } else {
        setKind("Theoretical");
      }
      const catMatch = initialAssessment.classification.split("-")[1]?.trim();
      if (catMatch) setCategory(catMatch);
    } else {
      setKind("Theoretical");
      setCategory("Science");
      setUnityStatement("");
      setParts(["", "", ""]);
    }
    setErrorMsg(null);
  }, [initialAssessment, isOpen]);

  if (!isOpen) return null;

  const handleAddPart = () => {
    if (parts.length < 6) {
      setParts([...parts, ""]);
    }
  };

  const handleRemovePart = (index: number) => {
    if (parts.length > 2) {
      setParts(parts.filter((_, i) => i !== index));
    }
  };

  const handlePartChange = (index: number, val: string) => {
    const updated = [...parts];
    updated[index] = val;
    setParts(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unityStatement.trim()) {
      setErrorMsg("Please provide a unity statement (1–2 sentences).");
      return;
    }
    const cleanParts = parts.map((p) => p.trim()).filter(Boolean);
    if (cleanParts.length < 2) {
      setErrorMsg("Please specify at least 2 structural divisions/parts.");
      return;
    }

    const payload: ExitAssessmentPayload = {
      classification: `${kind} - ${category}`,
      unityStatement: unityStatement.trim(),
      partsStructure: cleanParts,
      completedAt: new Date().toISOString(),
    };

    try {
      setIsSaving(true);
      setErrorMsg(null);
      await saveInspectionalExitAssessment(bookId, payload);
      if (onSaved) onSaved(payload);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to save exit assessment.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 select-text">
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-2xl p-6 text-[var(--theme-text)]">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--theme-border)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]">
              <BookCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-serif">
                Inspectional Exit Assessment
              </h2>
              <p className="text-xs text-[var(--theme-muted)] truncate max-w-sm">
                Adler's 3 Rules for Skimming: {bookTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          {/* Question 1: Classification */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--theme-muted)] flex items-center gap-1.5">
              <span>1. Classification (Genre & Nature)</span>
              <HelpCircle className="w-3.5 h-3.5 opacity-60" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex rounded-xl bg-[var(--theme-bg)] p-1 border border-[var(--theme-border)]">
                <button
                  type="button"
                  onClick={() => setKind("Theoretical")}
                  className={`flex-1 py-1 text-xs font-medium rounded-lg transition-all ${
                    kind === "Theoretical"
                      ? "bg-[var(--theme-surface)] text-[var(--theme-text)] shadow-sm font-semibold"
                      : "text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
                  }`}
                >
                  Theoretical (Knowledge)
                </button>
                <button
                  type="button"
                  onClick={() => setKind("Practical")}
                  className={`flex-1 py-1 text-xs font-medium rounded-lg transition-all ${
                    kind === "Practical"
                      ? "bg-[var(--theme-surface)] text-[var(--theme-text)] shadow-sm font-semibold"
                      : "text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
                  }`}
                >
                  Practical (Action)
                </button>
              </div>

              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-3 py-1 text-xs rounded-xl bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] focus:outline-none"
              >
                <option value="Science">Science / Tech</option>
                <option value="Philosophy">Philosophy</option>
                <option value="History">History</option>
                <option value="Social Science">Social Science / Economics</option>
                <option value="Fiction">Fiction / Literature</option>
                <option value="Other">Other Non-Fiction</option>
              </select>
            </div>
          </div>

          {/* Question 2: Unity Statement */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--theme-muted)]">
                2. Unity Statement (What is the book as a whole about?)
              </label>
              <span className="text-[10px] text-[var(--theme-muted)]">1–2 sentences</span>
            </div>
            <textarea
              rows={3}
              value={unityStatement}
              onChange={(e) => setUnityStatement(e.target.value)}
              placeholder="State the unity of the entire book in a single sentence or at most a few sentences..."
              className="w-full p-3 text-xs rounded-xl bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] placeholder:text-[var(--theme-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)] transition-colors"
            />
          </div>

          {/* Question 3: Parts Structure */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--theme-muted)]">
                3. Major Structural Parts (Order & Relations)
              </label>
              <span className="text-[10px] text-[var(--theme-muted)]">3–5 key divisions</span>
            </div>
            <div className="space-y-2">
              {parts.map((part, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-[var(--theme-muted)] w-5 text-right">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={part}
                    onChange={(e) => handlePartChange(idx, e.target.value)}
                    placeholder={`Part ${idx + 1}: e.g. Foundations & Consensus`}
                    className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]"
                  />
                  {parts.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePart(idx)}
                      className="p-1.5 text-[var(--theme-muted)] hover:text-red-500 transition-colors"
                      title="Remove division"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {parts.length < 6 && (
              <button
                type="button"
                onClick={handleAddPart}
                className="flex items-center gap-1 text-[11px] text-[var(--theme-accent)] hover:underline font-medium pt-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Structural Division</span>
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--theme-border)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs rounded-xl border border-[var(--theme-border)] text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--theme-accent)] text-white hover:opacity-90 shadow-sm transition-opacity cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSaving ? "Saving..." : "Save Assessment"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
