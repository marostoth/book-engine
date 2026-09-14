import React, { useState } from "react";
import {
  AnalyticalStore,
  AuthorTerm,
  ArgumentNode,
  CritiqueItem,
  AuthorInquiry,
  AnchoredCitation,
} from "../../lib/types/analytical";
import { TermsTab } from "./TermsTab";
import { ArgumentsTab } from "./ArgumentsTab";
import { InquiriesTab } from "./InquiriesTab";
import { CritiqueTab } from "./CritiqueTab";

interface AnalyticalWorkbenchPaneProps {
  store: AnalyticalStore;
  loading: boolean;
  onNavigateCitation: (chapterFile: string, anchor: string) => void;
  onOpenTermModal: (target?: AnchoredCitation | AuthorTerm) => void;
  onOpenArgumentModal: (target?: AnchoredCitation | ArgumentNode) => void;
  onOpenCritiqueModal: (
    targetArgId?: string,
    citation?: AnchoredCitation,
    critique?: CritiqueItem
  ) => void;
  onOpenInquiryModal: (target?: AuthorInquiry) => void;
  onDeleteTerm: (id: string) => void;
  onDeleteArgument: (id: string) => void;
  onDeleteCritique: (id: string) => void;
  onDeleteInquiry: (id: string) => void;
}

export const AnalyticalWorkbenchPane: React.FC<AnalyticalWorkbenchPaneProps> = ({
  store,
  loading,
  onNavigateCitation,
  onOpenTermModal,
  onOpenArgumentModal,
  onOpenCritiqueModal,
  onOpenInquiryModal,
  onDeleteTerm,
  onDeleteArgument,
  onDeleteCritique,
  onDeleteInquiry,
}) => {
  const [activeTab, setActiveTab] = useState<
    "terms" | "arguments" | "inquiries" | "critiques"
  >("terms");

  const critiquesList = store.critiques || [];
  const inquiriesList = store.inquiries || [];

  return (
    <aside className="w-80 md:w-96 flex-shrink-0 border-l border-zinc-800 bg-zinc-950 flex flex-col h-full overflow-hidden text-zinc-200">
      {/* Header */}
      <div className="p-3.5 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 ring-2 ring-amber-400/20 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Level III: Analytical Reading
            </span>
          </div>
          <h2 className="text-sm font-semibold text-zinc-100 mt-0.5">
            Interpretive &amp; Critical Workbench
          </h2>
        </div>

        {activeTab === "terms" ? (
          <button
            onClick={() => onOpenTermModal()}
            className="rounded bg-amber-600/90 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-amber-500"
          >
            + Term
          </button>
        ) : activeTab === "arguments" ? (
          <button
            onClick={() => onOpenArgumentModal()}
            className="rounded bg-sky-600/90 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-sky-500"
          >
            + Arg
          </button>
        ) : activeTab === "inquiries" ? (
          <button
            onClick={() => onOpenInquiryModal()}
            className="rounded bg-amber-600/90 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-amber-500"
          >
            + Inquiry
          </button>
        ) : (
          <button
            onClick={() => onOpenCritiqueModal()}
            className="rounded bg-rose-600/90 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-rose-500"
          >
            + Critique
          </button>
        )}
      </div>

      {/* 4-Way Tab Switcher */}
      <div className="flex border-b border-zinc-800 text-[11px]">
        <button
          onClick={() => setActiveTab("terms")}
          className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors ${
            activeTab === "terms"
              ? "border-amber-400 text-amber-400 bg-zinc-900/50"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Terms ({store.terms.length})
        </button>
        <button
          onClick={() => setActiveTab("arguments")}
          className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors ${
            activeTab === "arguments"
              ? "border-sky-400 text-sky-400 bg-zinc-900/50"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Args ({store.arguments.length})
        </button>
        <button
          onClick={() => setActiveTab("inquiries")}
          className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors ${
            activeTab === "inquiries"
              ? "border-amber-400 text-amber-300 bg-zinc-900/50"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Inquiries ({inquiriesList.length})
        </button>
        <button
          onClick={() => setActiveTab("critiques")}
          className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors ${
            activeTab === "critiques"
              ? "border-rose-400 text-rose-400 bg-zinc-900/50"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Critique ({critiquesList.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs">
        {loading && (
          <div className="flex justify-center py-8 text-zinc-500">
            Loading analytical store...
          </div>
        )}

        {/* Terms Tab */}
        {!loading && activeTab === "terms" && (
          <TermsTab
            terms={store.terms}
            onOpenTermModal={onOpenTermModal}
            onDeleteTerm={onDeleteTerm}
            onNavigateCitation={onNavigateCitation}
          />
        )}

        {/* Arguments Tab */}
        {!loading && activeTab === "arguments" && (
          <ArgumentsTab
            argumentsList={store.arguments}
            onOpenArgumentModal={onOpenArgumentModal}
            onOpenCritiqueModal={(targetArgId, citation) =>
              onOpenCritiqueModal(targetArgId, citation)
            }
            onDeleteArgument={onDeleteArgument}
            onNavigateCitation={onNavigateCitation}
          />
        )}

        {/* Inquiries Tab */}
        {!loading && activeTab === "inquiries" && (
          <InquiriesTab
            inquiries={inquiriesList}
            argumentsList={store.arguments}
            onOpenInquiryModal={onOpenInquiryModal}
            onDeleteInquiry={onDeleteInquiry}
            onNavigateCitation={onNavigateCitation}
          />
        )}

        {/* Critique Tab */}
        {!loading && activeTab === "critiques" && (
          <CritiqueTab
            critiques={critiquesList}
            argumentsList={store.arguments}
            onOpenCritiqueModal={onOpenCritiqueModal}
            onDeleteCritique={onDeleteCritique}
            onNavigateCitation={onNavigateCitation}
          />
        )}
      </div>
    </aside>
  );
};
