import React, { useState } from "react";
import {
  AuthorInquiry,
  ArgumentNode,
  ResolutionStatus,
} from "../../lib/types/analytical";
import { citationPlace } from "../../lib/citations";

interface InquiriesTabProps {
  inquiries: AuthorInquiry[];
  argumentsList: ArgumentNode[];
  onOpenInquiryModal: (target?: AuthorInquiry) => void;
  onDeleteInquiry: (id: string) => void;
  onNavigateCitation: (chapterFile: string, anchor: string) => void;
}

export const InquiriesTab: React.FC<InquiriesTabProps> = ({
  inquiries,
  argumentsList,
  onOpenInquiryModal,
  onDeleteInquiry,
  onNavigateCitation,
}) => {
  const [filter, setFilter] = useState<
    "all" | "primary" | "theoretical" | "practical" | "unsolved"
  >("all");

  const total = inquiries.length;
  const primaryCount = inquiries.filter((i) => i.priority === "primary").length;
  const solvedCount = inquiries.filter((i) => i.resolution === "solved").length;
  const unsolvedCount = total - solvedCount;

  const filteredInquiries = inquiries.filter((inq) => {
    if (filter === "primary") return inq.priority === "primary";
    if (filter === "theoretical") return inq.domain === "theoretical";
    if (filter === "practical") return inq.domain === "practical";
    if (filter === "unsolved") return inq.resolution !== "solved";
    return true;
  });

  const getResolutionBadge = (res: ResolutionStatus) => {
    switch (res) {
      case "solved":
        return {
          label: "Solved",
          cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
        };
      case "unsolvedAcknowledged":
        return {
          label: "Unsolved (Acknowledged)",
          cls: "bg-amber-500/20 text-amber-300 border-amber-500/40",
        };
      case "unsolvedUnrecognized":
        return {
          label: "Unsolved (Unrecognized)",
          cls: "bg-rose-500/20 text-rose-300 border-rose-500/40",
        };
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Metrics Header */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
          <div className="text-[10px] text-zinc-400 uppercase font-semibold">Total</div>
          <div className="text-base font-bold text-amber-400 mt-0.5">{total}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
          <div className="text-[10px] text-zinc-400 uppercase font-semibold">Primary</div>
          <div className="text-base font-bold text-sky-400 mt-0.5">{primaryCount}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
          <div className="text-[10px] text-zinc-400 uppercase font-semibold">Solved / Open</div>
          <div className="text-base font-bold text-emerald-400 mt-0.5">
            {solvedCount} <span className="text-xs text-zinc-500">/ {unsolvedCount}</span>
          </div>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-800 pb-2">
        {(
          [
            { id: "all", label: `All (${total})` },
            { id: "primary", label: `Primary (${primaryCount})` },
            { id: "theoretical", label: "Theoretical" },
            { id: "practical", label: "Practical" },
            { id: "unsolved", label: `Unsolved (${unsolvedCount})` },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
              filter === f.id
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Inquiry List */}
      {filteredInquiries.length === 0 ? (
        <div className="text-center py-10 px-4 text-zinc-500 space-y-1.5">
          <p className="font-medium text-zinc-400">No Inquiries Found</p>
          <p className="text-[11px]">
            Rules 4 &amp; 8: Catalog the primary and subordinate questions the author seeks to answer.
          </p>
        </div>
      ) : (
        filteredInquiries.map((inq) => {
          const resBadge = getResolutionBadge(inq.resolution);
          const linkedArgs = argumentsList.filter((a) =>
            inq.solutionArgumentIds.includes(a.id)
          );

          return (
            <div
              key={inq.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2.5 shadow-sm hover:border-zinc-700 transition-colors"
            >
              {/* Header Badges & Actions */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                    {inq.priority}
                  </span>
                  <span className="rounded border border-zinc-700 bg-zinc-800/80 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-zinc-300">
                    {inq.domain}
                  </span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${resBadge.cls}`}
                  >
                    {resBadge.label}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onOpenInquiryModal(inq)}
                    className="text-zinc-500 hover:text-zinc-300 p-0.5"
                    title="Edit inquiry"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => onDeleteInquiry(inq.id)}
                    className="text-zinc-500 hover:text-rose-400 p-0.5"
                    title="Delete inquiry"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Question */}
              <h3 className="font-semibold text-zinc-100 text-xs leading-snug">
                {inq.question}
              </h3>

              {/* Linked Arguments */}
              {linkedArgs.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold">
                    Resolved by Arguments:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {linkedArgs.map((arg) => (
                      <span
                        key={arg.id}
                        className="rounded border border-sky-500/30 bg-sky-950/40 px-1.5 py-0.5 text-[10px] font-mono text-sky-300 truncate max-w-[200px]"
                      >
                        {arg.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Solution Notes */}
              {inq.solutionNotes && (
                <p className="text-[11px] text-zinc-300 italic bg-zinc-950/40 p-2 rounded border border-zinc-800/60 leading-relaxed">
                  "{inq.solutionNotes}"
                </p>
              )}

              {/* Jump Buttons */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/60 text-[10px]">
                {inq.citation ? (
                  <button
                    onClick={() =>
                      onNavigateCitation(inq.citation!.chapterFile, inq.citation!.anchor)
                    }
                    className="flex items-center gap-1 font-mono text-amber-400/90 hover:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30"
                    title="Jump to question anchor in reader"
                  >
                    § Question: {citationPlace(inq.citation.chapterFile, inq.citation.anchor)}
                  </button>
                ) : (
                  <span />
                )}

                {inq.solutionCitation && (
                  <button
                    onClick={() =>
                      onNavigateCitation(
                        inq.solutionCitation!.chapterFile,
                        inq.solutionCitation!.anchor
                      )
                    }
                    className="flex items-center gap-1 font-mono text-emerald-400/90 hover:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30"
                    title="Jump to solution anchor in reader"
                  >
                    § Solution: {citationPlace(inq.solutionCitation.chapterFile, inq.solutionCitation.anchor)}
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
