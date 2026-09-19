import React, { useState } from "react";
import {
  AuthorInquiry,
  InquiryDomain,
  InquiryPriority,
  ResolutionStatus,
  AnchoredCitation,
  ArgumentNode,
} from "../../lib/types/analytical";
import { formKey, inquiryFormStart } from "../../lib/formStart";
import { useDialog } from "../../hooks/useDialog";
import { DiscardNotice } from "../DiscardNotice";

interface InquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (inquiry: AuthorInquiry) => Promise<void>;
  stagedQuestion?: string;
  stagedCitation?: AnchoredCitation;
  argumentsList: ArgumentNode[];
  editingInquiry?: AuthorInquiry | null;
  currentChapterFile?: string;
}

/**
 * The window is built only while it is open, and a new question to ask is a new `key`, so React builds the form
 * again from what `inquiryFormStart` works out. An effect used to write over every field instead (TL-11).
 */
export const InquiryModal: React.FC<InquiryModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <OpenInquiryModal {...props} key={formKey([props.editingInquiry?.id, props.stagedQuestion])} />;
};

const OpenInquiryModal: React.FC<InquiryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  stagedQuestion = "",
  stagedCitation,
  argumentsList,
  editingInquiry,
  currentChapterFile = "ch-01.md",
}) => {
  const [start] = useState(() => inquiryFormStart(editingInquiry, stagedQuestion));
  const [question, setQuestion] = useState(start.question);
  const [domain, setDomain] = useState<InquiryDomain>(start.domain);
  const [priority, setPriority] = useState<InquiryPriority>(start.priority);
  const [resolution, setResolution] = useState<ResolutionStatus>(start.resolution);
  const [solutionNotes, setSolutionNotes] = useState(start.solutionNotes);
  const [solutionArgumentIds, setSolutionArgumentIds] = useState<string[]>(start.solutionArgumentIds);
  const [saving, setSaving] = useState(false);

  // A form the reader types into: Escape asks before it throws the words away (RD-07).
  const { panelProps, titleId, close, askedToDiscard } = useDialog({ isOpen, onClose, protectTyping: true });

  const toggleArgId = (id: string) => {
    setSolutionArgumentIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setSaving(true);
    try {
      const item: AuthorInquiry = {
        id: editingInquiry ? editingInquiry.id : `inq-${Date.now()}`,
        question: question.trim(),
        domain,
        priority,
        citation: editingInquiry?.citation || stagedCitation || {
          chapterFile: currentChapterFile,
          anchor: "",
          quote: question.slice(0, 80),
        },
        resolution,
        solutionNotes: solutionNotes.trim(),
        solutionArgumentIds,
        solutionCitation: editingInquiry?.solutionCitation || (resolution === "solved" && stagedCitation ? stagedCitation : undefined),
        createdAt: editingInquiry?.createdAt || new Date().toISOString(),
      };

      // The session closes this window after a save. A change that it does not save keeps its text here.
      await onSave(item);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
      <div
        {...panelProps}
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5 bg-zinc-950/40">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Rules 4 &amp; 8: Inquiry Ledger
            </span>
            <h2 id={titleId} className="text-base font-semibold text-zinc-100">
              {editingInquiry ? "Edit Author Inquiry" : "Catalog Author Inquiry"}
            </h2>
          </div>
          <button
            onClick={close}
            aria-label="Close without saving the inquiry"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        {askedToDiscard && (
          <div className="px-5">
            <DiscardNotice />
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Question */}
          <div className="space-y-1">
            <label className="font-semibold text-zinc-300">
              Author's Question or Problem <span className="text-rose-400">*</span>
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What question is the author trying to answer or problem trying to solve?"
              rows={2}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-200 focus:border-amber-400 focus:outline-none"
              required
            />
          </div>

          {/* Domain & Priority Dual Selector */}
          <div className="grid grid-cols-2 gap-3">
            {/* Domain */}
            <div className="space-y-1">
              <label className="font-semibold text-zinc-300">Domain (Rule 4)</label>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
                {(["theoretical", "practical"] as InquiryDomain[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDomain(d)}
                    className={`rounded py-1 text-center font-medium capitalize transition-colors ${
                      domain === d
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "text-zinc-400 hover:text-zinc-200 border border-transparent"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-1">
              <label className="font-semibold text-zinc-300">Hierarchy</label>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
                {(["primary", "subordinate"] as InquiryPriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`rounded py-1 text-center font-medium capitalize transition-colors ${
                      priority === p
                        ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                        : "text-zinc-400 hover:text-zinc-200 border border-transparent"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tripartite Resolution Status (Rule 8) */}
          <div className="space-y-1.5">
            <label className="font-semibold text-zinc-300">Solution Audit (Rule 8)</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { key: "solved", label: "Solved", desc: "Argued & resolved" },
                { key: "unsolvedAcknowledged", label: "Unsolved (Acknowledged)", desc: "Left open consciously" },
                { key: "unsolvedUnrecognized", label: "Unsolved (Unrecognized)", desc: "Failed to address" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setResolution(item.key as ResolutionStatus)}
                  className={`rounded-lg border p-2 text-left transition-colors ${
                    resolution === item.key
                      ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                      : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="font-semibold text-[11px]">{item.label}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Linked Resolving Arguments */}
          {argumentsList.length > 0 && (
            <div className="space-y-1.5">
              <label className="font-semibold text-zinc-300">
                Resolving Argument Graph(s)
              </label>
              <div className="max-h-28 overflow-y-auto space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                {argumentsList.map((arg) => (
                  <label
                    key={arg.id}
                    className="flex items-center gap-2 rounded px-2 py-1 hover:bg-zinc-800/60 cursor-pointer text-[11px]"
                  >
                    <input
                      type="checkbox"
                      checked={solutionArgumentIds.includes(arg.id)}
                      onChange={() => toggleArgId(arg.id)}
                      className="rounded border-zinc-700 text-amber-500 focus:ring-amber-400"
                    />
                    <span className="font-medium text-zinc-200 truncate">{arg.title}</span>
                    <span className="text-[10px] text-zinc-500 uppercase">({arg.inferenceType})</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Solution Notes */}
          <div className="space-y-1">
            <label className="font-semibold text-zinc-300">Solution Analysis &amp; Findings</label>
            <textarea
              value={solutionNotes}
              onChange={(e) => setSolutionNotes(e.target.value)}
              placeholder="How did the author answer this question, or why did they fail?"
              rows={2}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-200 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Citation Info */}
          {(editingInquiry?.citation || stagedCitation) && (
            <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2 text-[11px] text-zinc-400">
              <span className="font-semibold text-amber-300">Source Anchor: </span>
              {(editingInquiry?.citation || stagedCitation)?.chapterFile}#
              {(editingInquiry?.citation || stagedCitation)?.anchor}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-zinc-700 px-4 py-1.5 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !question.trim()}
              className="rounded-lg bg-amber-600 px-4 py-1.5 font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Inquiry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
