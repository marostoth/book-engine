import React from "react";
import { ReadingLevelMode } from "../lib/types";
import { useAnalyticalSession } from "../hooks/useAnalyticalSession";
import { useSyntopiconSession } from "../hooks/useSyntopiconSession";
import { AnalyticalWorkbenchPane } from "./analytical/AnalyticalWorkbenchPane";
import { SyntopiconPane } from "./syntopicon/SyntopiconPane";
import { CrossBookCitation } from "../lib/types/syntopicon";

interface LevelCompanionPaneProps {
  activeLevel: ReadingLevelMode;
  isFocus: boolean;
  analyticalSession: ReturnType<typeof useAnalyticalSession>;
  syntopiconSession: ReturnType<typeof useSyntopiconSession>;
  onNavigateCitation: (chapterFile: string, anchor?: string) => void;
  onNavigateCrossBookCitation: (citation: CrossBookCitation) => void;
  currentBookId?: string | null;
}

export const LevelCompanionPane: React.FC<LevelCompanionPaneProps> = ({
  activeLevel,
  isFocus,
  analyticalSession,
  syntopiconSession,
  onNavigateCitation,
  onNavigateCrossBookCitation,
  currentBookId,
}) => {
  if (isFocus) return null;

  if (activeLevel === "analytical") {
    return (
      <AnalyticalWorkbenchPane
        store={analyticalSession.analyticalStore}
        loading={analyticalSession.loading}
        onNavigateCitation={onNavigateCitation}
        onOpenTermModal={analyticalSession.openTermModal}
        onOpenArgumentModal={analyticalSession.openArgumentModal}
        onOpenCritiqueModal={analyticalSession.openCritiqueModal}
        onOpenInquiryModal={analyticalSession.openInquiryModal}
        onDeleteTerm={analyticalSession.deleteTerm}
        onDeleteArgument={analyticalSession.deleteArgument}
        onDeleteCritique={analyticalSession.deleteCritique}
        onDeleteInquiry={analyticalSession.deleteInquiry}
      />
    );
  }

  if (activeLevel === "syntopical") {
    return (
      <div className="w-[440px] min-w-[360px] max-w-[500px] h-full overflow-hidden shrink-0">
        <SyntopiconPane
          session={syntopiconSession}
          onNavigateCitation={onNavigateCrossBookCitation}
          currentBookId={currentBookId}
        />
      </div>
    );
  }

  return null;
};
