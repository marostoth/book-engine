import React, { useState } from "react";
import { useSyntopiconSession } from "../../hooks/useSyntopiconSession";
import { CrossBookCitation } from "../../lib/types/syntopicon";
import { SyntopicTermsTab } from "./SyntopicTermsTab";
import { IssueMatrixTab } from "./IssueMatrixTab";
import { SynthesisTab } from "./SynthesisTab";
import { Layers, Plus, BookCopy } from "lucide-react";

interface SyntopiconPaneProps {
  session: ReturnType<typeof useSyntopiconSession>;
  onNavigateCitation?: (citation: CrossBookCitation) => void;
  currentBookId?: string | null;
}

export const SyntopiconPane: React.FC<SyntopiconPaneProps> = ({
  session,
  onNavigateCitation,
  currentBookId,
}) => {
  const [activeTab, setActiveTab] = useState<"terms" | "issues" | "synthesis">("terms");
  const [showNewTopicForm, setShowNewTopicForm] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicDesc, setNewTopicDesc] = useState("");

  const {
    topics,
    activeTopicId,
    activeTopic,
    loading,
    selectTopic,
    createTopic,
    deleteNeutralTerm,
    saveQuestion,
    deleteQuestion,
    deleteControversy,
    openTermModal,
    openControversyModal,
    stagedCitation,
  } = session;

  const handleCreateTopicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim()) return;
    await createTopic(newTopicTitle.trim(), newTopicDesc.trim());
    setNewTopicTitle("");
    setNewTopicDesc("");
    setShowNewTopicForm(false);
  };

  const booksInvolved = activeTopic
    ? Array.from(
        new Set([
          ...activeTopic.neutralTerms.flatMap((t) => t.mappings.map((m) => m.bookId)),
          ...activeTopic.controversies.flatMap((c) => c.perspectives.map((p) => p.bookId)),
          ...(topics.find((t) => t.id === activeTopic.id)?.booksInvolved || []),
        ])
      )
    : [];
  const isCurrentBookCited = !currentBookId || !activeTopic || booksInvolved.includes(currentBookId);

  return (
    <div className="flex flex-col h-full bg-stone-950 text-stone-200 border-l border-stone-800">
      {/* Top Header */}
      <div className="p-4 border-b border-stone-800 bg-stone-900/60 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Level IV: Syntopicon Registry
            </span>
          </div>
          <button
            onClick={() => setShowNewTopicForm(!showNewTopicForm)}
            className="flex items-center gap-1 px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded text-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            New Topic
          </button>
        </div>

        {/* New Topic Form */}
        {showNewTopicForm && (
          <form onSubmit={handleCreateTopicSubmit} className="p-3 bg-stone-900 border border-stone-700 rounded-lg space-y-2 text-xs">
            <input
              type="text"
              value={newTopicTitle}
              onChange={(e) => setNewTopicTitle(e.target.value)}
              placeholder="Topic Title (e.g. Division of Labor & Human Alienation)..."
              className="w-full bg-stone-950 border border-stone-700 rounded px-2.5 py-1.5 text-stone-200 focus:border-amber-500 focus:outline-none"
            />
            <textarea
              value={newTopicDesc}
              onChange={(e) => setNewTopicDesc(e.target.value)}
              rows={2}
              placeholder="Brief description of the cross-book syntopical inquiry..."
              className="w-full bg-stone-950 border border-stone-700 rounded px-2.5 py-1.5 text-stone-200 focus:border-amber-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewTopicForm(false)}
                className="px-2.5 py-1 text-stone-400 hover:text-stone-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold rounded"
              >
                Create Topic
              </button>
            </div>
          </form>
        )}

        {/* Topic Selector & Metadata */}
        <div className="flex items-center gap-2">
          <BookCopy className="w-4 h-4 text-stone-400 shrink-0" />
          <select
            value={activeTopicId || ""}
            onChange={(e) => selectTopic(e.target.value)}
            className="flex-1 bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-xs text-stone-200 focus:border-amber-500 focus:outline-none"
          >
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.booksInvolved.length} books)
              </option>
            ))}
          </select>
        </div>

        {/* Ambient Cross-Book Context Banner */}
        {!isCurrentBookCited && (
          <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200/90 text-[11px] leading-relaxed flex items-start gap-2">
            <span className="text-amber-400 font-bold text-xs mt-0.5 shrink-0">ℹ</span>
            <span>
              Active reading volume is not cited in this topic. Click any author citation below to jump to a cited text.
            </span>
          </div>
        )}

        {activeTopic && (
          <div className="space-y-1.5">
            {activeTopic.description && (
              <p className="text-[11px] text-stone-400 line-clamp-2 leading-relaxed">
                {activeTopic.description}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[10px] uppercase font-semibold text-stone-500">Books:</span>
              {booksInvolved.map((bid) => (
                <span key={bid} className="bg-stone-800 text-amber-300/90 px-1.5 py-0.5 rounded text-[10px] font-mono">
                  {bid}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex border-b border-stone-800 pt-1">
          <button
            onClick={() => setActiveTab("terms")}
            className={`flex-1 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "terms"
                ? "border-amber-500 text-amber-300"
                : "border-transparent text-stone-400 hover:text-stone-300"
            }`}
          >
            Neutral Terms ({activeTopic?.neutralTerms.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("issues")}
            className={`flex-1 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "issues"
                ? "border-amber-500 text-amber-300"
                : "border-transparent text-stone-400 hover:text-stone-300"
            }`}
          >
            Issue Matrix ({activeTopic?.controversies.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("synthesis")}
            className={`flex-1 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "synthesis"
                ? "border-amber-500 text-amber-300"
                : "border-transparent text-stone-400 hover:text-stone-300"
            }`}
          >
            Synthesis (Rule 5)
          </button>
        </div>
      </div>

      {/* Main Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-12 text-stone-500 text-xs">Loading syntopicon topic data...</div>
        ) : !activeTopic ? (
          <div className="text-center py-12 text-stone-500 text-xs">No active topic selected.</div>
        ) : activeTab === "terms" ? (
          <SyntopicTermsTab
            terms={activeTopic.neutralTerms}
            onOpenTermModal={openTermModal}
            onDeleteTerm={deleteNeutralTerm}
            onNavigateCitation={onNavigateCitation}
            stagedCitation={stagedCitation}
          />
        ) : activeTab === "issues" ? (
          <IssueMatrixTab
            questions={activeTopic.questions}
            controversies={activeTopic.controversies}
            onSaveQuestion={saveQuestion}
            onDeleteQuestion={deleteQuestion}
            onOpenControversyModal={openControversyModal}
            onDeleteControversy={deleteControversy}
            onNavigateCitation={onNavigateCitation}
            stagedCitation={stagedCitation}
          />
        ) : (
          <SynthesisTab session={session} />
        )}
      </div>
    </div>
  );
};
