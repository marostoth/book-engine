import React, { useState, useEffect } from "react";
import {
  SyntopicControversy,
  SyntopicQuestion,
  SyntopicPerspective,
  StagedCitation,
} from "../../lib/types/syntopicon";
import { Plus, Trash2, Scale, Link } from "lucide-react";
import { useDialog } from "../../hooks/useDialog";
import { DiscardNotice } from "../DiscardNotice";

interface ControversyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (controversy: SyntopicControversy) => void;
  questions: SyntopicQuestion[];
  stagedCitation: StagedCitation | null;
  editingControversy: SyntopicControversy | null;
  currentBookId?: string | null;
  currentChapterFile?: string;
}

export const ControversyModal: React.FC<ControversyModalProps> = ({
  isOpen,
  onClose,
  onSave,
  questions,
  stagedCitation,
  editingControversy,
  currentBookId,
  currentChapterFile,
}) => {
  const [questionId, setQuestionId] = useState("");
  const [title, setTitle] = useState("");
  const [perspectives, setPerspectives] = useState<SyntopicPerspective[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Perspective entry form state
  const [pBookId, setPBookId] = useState("");
  const [pStance, setPStance] = useState("");
  const [pChapter, setPChapter] = useState("");
  const [pAnchor, setPAnchor] = useState("");
  const [pQuote, setPQuote] = useState("");

  useEffect(() => {
    if (editingControversy) {
      setQuestionId(editingControversy.questionId);
      setTitle(editingControversy.title);
      setPerspectives(editingControversy.perspectives || []);
    } else {
      setQuestionId(questions.length > 0 ? questions[0].id : "");
      setTitle("");
      setPerspectives([]);
    }

    if (stagedCitation) {
      setPBookId(stagedCitation.bookId);
      setPChapter(stagedCitation.chapterFile);
      setPAnchor(stagedCitation.anchor);
      setPQuote(stagedCitation.quote);
    } else {
      setPBookId(currentBookId || "");
      setPChapter(currentChapterFile || "ch-01.md");
      setPAnchor("");
      setPQuote("");
    }
    setError(null);
  }, [editingControversy, questions, stagedCitation, currentBookId, currentChapterFile, isOpen]);

  // A form the reader types into: Escape asks before it throws the words away (RD-07).
  const { panelProps, titleId, close, askedToDiscard } = useDialog({ isOpen, onClose, protectTyping: true });

  if (!isOpen) return null;

  const handleAddPerspective = () => {
    if (!pBookId.trim() || !pStance.trim()) {
      setError("Please provide Book ID and the author's stance on this issue.");
      return;
    }

    const citations = pAnchor.trim()
      ? [
          {
            bookId: pBookId.trim(),
            chapterFile: pChapter.trim() || "ch-01.md",
            anchor: pAnchor.trim(),
            quote: pQuote.trim(),
          },
        ]
      : [];

    setPerspectives([
      ...perspectives,
      {
        bookId: pBookId.trim(),
        stance: pStance.trim(),
        citations,
      },
    ]);
    setPStance("");
    setPQuote("");
    setError(null);
  };

  const handleRemovePerspective = (idx: number) => {
    setPerspectives(perspectives.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionId) {
      setError("Please select the syntopic question this controversy addresses (Rule 3).");
      return;
    }
    if (!title.trim()) {
      setError("Please provide a controversy title defining the issue (Rule 4).");
      return;
    }
    if (perspectives.length === 0) {
      setError("Please attach at least one author perspective.");
      return;
    }

    onSave({
      id: editingControversy ? editingControversy.id : `controversy-${Date.now()}`,
      questionId,
      title: title.trim(),
      perspectives,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        {...panelProps}
        className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-stone-200"
      >
        <div className="px-6 py-4 border-b border-stone-800 flex justify-between items-center bg-stone-900/80">
          <div>
            <h3 id={titleId} className="text-lg font-semibold text-amber-200 flex items-center gap-2">
              <Scale className="w-5 h-5 text-amber-400" />
              {editingControversy ? "Edit Controversy" : "New Controversy (Rule 4: Defining the Issues)"}
            </h3>
            <p className="text-xs text-stone-400 mt-0.5">
              Map opposing or nuanced author positions on a framed syntopical question.
            </p>
          </div>
          <button
            onClick={close}
            aria-label="Close without saving the controversy"
            className="text-stone-400 hover:text-stone-200 text-lg px-2"
          >
            ✕
          </button>
        </div>

        {askedToDiscard && (
          <div className="px-6 pt-3">
            <DiscardNotice />
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <div className="p-3 bg-red-950/60 border border-red-800/80 rounded text-red-300 text-xs">{error}</div>}

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-400 mb-1">Framed Question (Rule 3)</label>
            <select
              value={questionId}
              onChange={(e) => setQuestionId(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded px-3 py-2 text-stone-200 text-sm focus:border-amber-500 focus:outline-none"
            >
              {questions.length === 0 ? (
                <option value="">No questions defined yet (Add a question first)</option>
              ) : (
                questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    #{q.order}: {q.question}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-400 mb-1">Controversy / Issue Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cognitive Stultification vs Dexterity Amplification"
              className="w-full bg-stone-950 border border-stone-700 rounded px-3 py-2 text-stone-200 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Perspectives List */}
          <div className="border-t border-stone-800 pt-4">
            <label className="block text-xs font-semibold uppercase text-stone-400 mb-2">
              Author Perspectives ({perspectives.length})
            </label>
            {perspectives.length > 0 && (
              <div className="space-y-2 mb-3">
                {perspectives.map((p, idx) => (
                  <div key={idx} className="bg-stone-950/80 border border-stone-800 rounded p-2.5 flex items-start justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded text-[10px] font-mono">{p.bookId}</span>
                        <span className="font-semibold text-stone-200">{p.stance}</span>
                      </div>
                      {p.citations.map((c, cIdx) => (
                        <div key={cIdx} className="text-stone-400 mt-1 text-[11px]">
                          {c.chapterFile} <span className="font-mono text-amber-400/80">{c.anchor}</span>
                          {c.quote && <p className="italic text-stone-400 mt-0.5 line-clamp-1">&ldquo;{c.quote}&rdquo;</p>}
                        </div>
                      ))}
                    </div>
                    <button type="button" aria-label="Remove this perspective" onClick={() => handleRemovePerspective(idx)} className="text-stone-500 hover:text-red-400 p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Perspective Subform */}
            <div className="bg-stone-950/50 border border-stone-800 rounded p-3 space-y-2 text-xs">
              <div className="font-medium text-stone-300 flex items-center gap-1.5">
                <Link className="w-3.5 h-3.5 text-amber-400" />
                Add Author Stance &amp; Evidence
              </div>
              <input
                type="text"
                value={pBookId}
                onChange={(e) => setPBookId(e.target.value)}
                placeholder="Book ID (e.g. wealth-of-nations)"
                className="w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-200"
              />
              <textarea
                value={pStance}
                onChange={(e) => setPStance(e.target.value)}
                rows={2}
                placeholder="Author's stance or thesis on this issue..."
                className="w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-200"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={pChapter}
                  onChange={(e) => setPChapter(e.target.value)}
                  placeholder="Chapter file (e.g. ch-01.md)"
                  className="bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-200"
                />
                <input
                  type="text"
                  value={pAnchor}
                  onChange={(e) => setPAnchor(e.target.value)}
                  placeholder="Anchor (e.g. ^p-001)"
                  className="bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-200 font-mono"
                />
              </div>
              <input
                type="text"
                value={pQuote}
                onChange={(e) => setPQuote(e.target.value)}
                placeholder="Verbatim quote from author's text..."
                className="w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-200 text-xs italic"
              />
              <button
                type="button"
                onClick={handleAddPerspective}
                className="flex items-center gap-1 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-amber-200 rounded text-xs font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Add Author Perspective
              </button>
            </div>
          </div>

          <div className="border-t border-stone-800 pt-4 flex justify-end gap-2">
            <button type="button" onClick={close} className="px-4 py-2 rounded text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-300">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-stone-950">
              Save Controversy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
