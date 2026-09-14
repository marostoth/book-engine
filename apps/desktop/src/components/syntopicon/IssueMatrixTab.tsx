import React, { useState } from "react";
import {
  SyntopicQuestion,
  SyntopicControversy,
  CrossBookCitation,
  StagedCitation,
} from "../../lib/types/syntopicon";
import { Plus, Trash2, Edit2, Scale, ExternalLink, HelpCircle, Bookmark } from "lucide-react";
import { sanitizeQuoteText } from "../../lib/markdown";

interface IssueMatrixTabProps {
  questions: SyntopicQuestion[];
  controversies: SyntopicControversy[];
  onSaveQuestion: (question: SyntopicQuestion) => void;
  onDeleteQuestion: (questionId: string) => void;
  onOpenControversyModal: (controversy?: SyntopicControversy) => void;
  onDeleteControversy: (controversyId: string) => void;
  onNavigateCitation?: (citation: CrossBookCitation) => void;
  stagedCitation: StagedCitation | null;
}

export const IssueMatrixTab: React.FC<IssueMatrixTabProps> = ({
  questions,
  controversies,
  onSaveQuestion,
  onDeleteQuestion,
  onOpenControversyModal,
  onDeleteControversy,
  onNavigateCitation,
  stagedCitation,
}) => {
  const [newQuestionText, setNewQuestionText] = useState("");

  const handleCreateQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) return;

    onSaveQuestion({
      id: `q-${Date.now()}`,
      question: newQuestionText.trim(),
      order: questions.length + 1,
    });
    setNewQuestionText("");
  };

  return (
    <div className="space-y-4">
      {/* Question creation form */}
      <form onSubmit={handleCreateQuestion} className="space-y-2 pb-2 border-b border-stone-800">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase text-stone-400">
            Framing Questions &amp; Defining Issues (Rules 3 &amp; 4)
          </h4>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newQuestionText}
            onChange={(e) => setNewQuestionText(e.target.value)}
            placeholder="Frame a question across authors (e.g. Does division of labor cause alienation?)..."
            className="flex-1 bg-stone-950 border border-stone-700 rounded px-3 py-1.5 text-xs text-stone-200 focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-amber-200 rounded text-xs font-semibold flex items-center gap-1 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Frame Question
          </button>
        </div>
      </form>

      {stagedCitation && (
        <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2 overflow-hidden">
            <Bookmark className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">
              Staged citation from <strong className="font-mono">{stagedCitation.bookId}</strong>:
              <em className="ml-1 text-stone-300 line-clamp-1">&ldquo;{sanitizeQuoteText(stagedCitation.quote)}&rdquo;</em>
            </span>
          </div>
          <button
            onClick={() => onOpenControversyModal()}
            className="px-2 py-1 bg-amber-600 text-stone-950 rounded text-[11px] font-bold hover:bg-amber-500 shrink-0 ml-2"
          >
            Attach to Issue
          </button>
        </div>
      )}

      {questions.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-stone-800 rounded-lg text-stone-500 text-xs">
          <HelpCircle className="w-8 h-8 mx-auto mb-2 text-stone-600" />
          <p>No syntopic questions framed yet.</p>
          <p className="text-[11px] text-stone-600 mt-1">
            Frame a question above that the various authors can be interpreted as addressing.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => {
            const questionControversies = controversies.filter((c) => c.questionId === q.id);

            return (
              <div key={q.id} className="bg-stone-900 border border-stone-800 rounded-lg p-3.5 space-y-3">
                {/* Question Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <span className="px-1.5 py-0.5 bg-amber-950 text-amber-400 border border-amber-800/80 rounded text-[10px] font-mono shrink-0">
                      Q#{q.order}
                    </span>
                    <h5 className="text-xs font-semibold text-stone-200 leading-snug">{q.question}</h5>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onOpenControversyModal()}
                      className="px-2 py-1 bg-stone-800 hover:bg-amber-600 hover:text-stone-950 text-amber-300 rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
                      title="Define Controversy"
                    >
                      <Plus className="w-3 h-3" />
                      Issue
                    </button>
                    <button
                      onClick={() => onDeleteQuestion(q.id)}
                      className="p-1 text-stone-400 hover:text-red-400 transition-colors"
                      title="Delete Question (Cascade removes controversies)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Controversies */}
                {questionControversies.length === 0 ? (
                  <p className="text-[11px] text-stone-500 italic pl-6">
                    No controversies mapped for this question yet. Click &ldquo;+ Issue&rdquo; to add opposing author stances.
                  </p>
                ) : (
                  <div className="space-y-2.5 pl-2">
                    {questionControversies.map((c) => (
                      <div key={c.id} className="bg-stone-950/70 border border-stone-800 rounded p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Scale className="w-3.5 h-3.5 text-amber-400" />
                            <h6 className="text-xs font-semibold text-amber-200">{c.title}</h6>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onOpenControversyModal(c)}
                              className="p-1 text-stone-400 hover:text-amber-400"
                              title="Edit Controversy"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => onDeleteControversy(c.id)}
                              className="p-1 text-stone-400 hover:text-red-400"
                              title="Delete Controversy"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Perspectives Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                          {c.perspectives.map((p, pIdx) => (
                            <div key={pIdx} className="bg-stone-900 border border-stone-800/80 rounded p-2 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                  {p.bookId}
                                </span>
                              </div>
                              <p className="text-[11px] text-stone-300">{p.stance}</p>
                              {p.citations.map((cit, citIdx) => (
                                <div key={citIdx} className="border-t border-stone-800/60 pt-1 mt-1">
                                  {onNavigateCitation && (
                                    <button
                                      onClick={() => onNavigateCitation(cit)}
                                      className="flex items-center gap-1 text-[10px] text-amber-400/80 hover:text-amber-300 hover:underline font-mono"
                                    >
                                      <span>{cit.chapterFile}</span>
                                      <span>{cit.anchor}</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                  {cit.quote && (
                                    <p className="text-[10px] text-stone-400 italic line-clamp-1">
                                      &ldquo;{sanitizeQuoteText(cit.quote)}&rdquo;
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
