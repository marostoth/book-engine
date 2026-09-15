import React from "react";
import {
  BookMeta,
  BookMetadata,
  ChapterMeta,
  PracticeCardItem,
  CardSchedule,
  ReaderPreferences,
  ExitAssessmentPayload,
  ReadingLevelMode,
} from "../lib/types";
import { ReaderLocation } from "../lib/readerLocation";
import { InspectionalSessionState } from "../hooks/useInspectionalSession";
import { OmniSearchModal } from "./OmniSearchModal";
import { PracticeModal } from "./PracticeModal";
import { GatekeeperModal } from "./GatekeeperModal";
import { NotesDrawer } from "./NotesDrawer";
import { AnalyticsModal } from "./AnalyticsModal";
import { InspectionalExitModal } from "./inspectional/InspectionalExitModal";
import { LevelGuideModal } from "./LevelGuideModal";
import { TermModal } from "./analytical/TermModal";
import { ArgumentBuilderModal } from "./analytical/ArgumentBuilderModal";
import { CritiqueModal } from "./analytical/CritiqueModal";
import { InquiryModal } from "./analytical/InquiryModal";
import {
  AuthorTerm,
  ArgumentNode,
  CritiqueItem,
  AuthorInquiry,
  AnchoredCitation,
} from "../lib/types/analytical";

import { NeutralTermModal } from "./syntopicon/NeutralTermModal";
import { ControversyModal } from "./syntopicon/ControversyModal";
import { useSyntopiconSession } from "../hooks/useSyntopiconSession";

interface AppModalsProps {
  searchOpen: boolean;
  onCloseSearch: () => void;
  practiceModalOpen: boolean;
  onClosePractice: () => void;
  gatekeeperModalOpen: boolean;
  onCloseGatekeeper: () => void;
  notesDrawerOpen: boolean;
  onCloseNotesDrawer: () => void;
  analyticsModalOpen: boolean;
  onCloseAnalytics: () => void;
  guideOpen?: boolean;
  onCloseGuide?: () => void;
  activeLevel?: ReadingLevelMode;
  dueCards: PracticeCardItem[];
  pendingChapter: ChapterMeta | null;
  onGatekeeperComplete: () => void;
  onReviewSubmitted: (cardId: string, schedule: CardSchedule) => void;
  onNavigateAnchor: (chapterFile: string, anchor?: string) => void;
  /** Opens a location in its own book; search hits come from all books. */
  onNavigateLocation: (location: ReaderLocation) => void;
  activeBookId: string;
  bookMeta: BookMeta | null;
  availableBooks: BookMetadata[];
  preferences: ReaderPreferences;
  inspectionalSession: InspectionalSessionState;
  analyticalSession?: {
    termModalOpen: boolean;
    argumentModalOpen: boolean;
    critiqueModalOpen: boolean;
    inquiryModalOpen: boolean;
    stagedCitation: AnchoredCitation | null;
    stagedCritiqueTarget: { targetArgumentId?: string; citation?: AnchoredCitation } | null;
    stagedInquiryTarget: { question?: string; citation?: AnchoredCitation } | null;
    editingTerm: AuthorTerm | null;
    editingArgument: ArgumentNode | null;
    editingCritique: CritiqueItem | null;
    editingInquiry: AuthorInquiry | null;
    analyticalStore: { arguments: ArgumentNode[] };
    closeModals: () => void;
    saveTerm: (term: AuthorTerm) => Promise<void>;
    saveArgument: (arg: ArgumentNode) => Promise<void>;
    saveCritique: (item: CritiqueItem) => Promise<void>;
    saveInquiry: (item: AuthorInquiry) => Promise<void>;
  };
  syntopiconSession?: ReturnType<typeof useSyntopiconSession>;
  currentChapterFile?: string;
}

export const AppModals: React.FC<AppModalsProps> = ({
  searchOpen,
  onCloseSearch,
  practiceModalOpen,
  onClosePractice,
  gatekeeperModalOpen,
  onCloseGatekeeper,
  notesDrawerOpen,
  onCloseNotesDrawer,
  analyticsModalOpen,
  onCloseAnalytics,
  guideOpen = false,
  onCloseGuide,
  activeLevel = "elementary",
  dueCards,
  pendingChapter,
  onGatekeeperComplete,
  onReviewSubmitted,
  onNavigateAnchor,
  onNavigateLocation,
  activeBookId,
  bookMeta,
  availableBooks,
  preferences,
  inspectionalSession,
  analyticalSession,
  syntopiconSession,
  currentChapterFile,
}) => {
  return (
    <>
      <OmniSearchModal
        isOpen={searchOpen}
        onClose={onCloseSearch}
        books={availableBooks}
        onSelectResult={onNavigateLocation}
      />

      <PracticeModal
        isOpen={practiceModalOpen}
        onClose={onClosePractice}
        cards={dueCards}
        onReviewSubmitted={onReviewSubmitted}
        onJumpToAnchor={(chapterFile, anchor) => onNavigateAnchor(chapterFile, anchor)}
        bookTitle={bookMeta?.title || "Book Engine"}
      />

      <GatekeeperModal
        isOpen={gatekeeperModalOpen}
        onClose={onCloseGatekeeper}
        targetChapterTitle={pendingChapter?.title || "Next Chapter"}
        cards={dueCards}
        quota={preferences.study?.gatekeeperQuota ?? 3}
        onComplete={onGatekeeperComplete}
        onReviewSubmitted={onReviewSubmitted}
      />

      <NotesDrawer
        isOpen={notesDrawerOpen}
        onClose={onCloseNotesDrawer}
        bookMeta={bookMeta}
        onNavigateToAnchor={onNavigateAnchor}
      />

      <AnalyticsModal
        isOpen={analyticsModalOpen}
        onClose={onCloseAnalytics}
        activeBookId={activeBookId}
        bookMeta={bookMeta}
        preferences={preferences}
      />

      <InspectionalExitModal
        isOpen={inspectionalSession.isExitModalOpen}
        onClose={inspectionalSession.closeExitModal}
        bookId={activeBookId}
        bookTitle={bookMeta?.title || "Book"}
        initialAssessment={bookMeta?.inspectional_blueprint?.exit_assessment as ExitAssessmentPayload | null | undefined}
        onSaved={(assessment) => {
          if (bookMeta) {
            if (!bookMeta.inspectional_blueprint) {
              bookMeta.inspectional_blueprint = {
                front_matter: {},
                pivotal_chapters: [],
                synthetic_index_clusters: [],
              };
            }
            bookMeta.inspectional_blueprint.exit_assessment = assessment;
          }
        }}
      />

      {analyticalSession && (
        <>
          <TermModal
            isOpen={analyticalSession.termModalOpen}
            onClose={analyticalSession.closeModals}
            onSave={analyticalSession.saveTerm}
            stagedCitation={analyticalSession.stagedCitation}
            editingTerm={analyticalSession.editingTerm}
            currentChapterFile={currentChapterFile}
          />

          <ArgumentBuilderModal
            isOpen={analyticalSession.argumentModalOpen}
            onClose={analyticalSession.closeModals}
            onSave={analyticalSession.saveArgument}
            stagedCitation={analyticalSession.stagedCitation}
            editingArgument={analyticalSession.editingArgument}
            currentChapterFile={currentChapterFile}
          />

          <CritiqueModal
            isOpen={analyticalSession.critiqueModalOpen}
            onClose={analyticalSession.closeModals}
            onSave={analyticalSession.saveCritique}
            targetArgId={analyticalSession.stagedCritiqueTarget?.targetArgumentId}
            targetCitation={analyticalSession.stagedCritiqueTarget?.citation}
            argumentsList={analyticalSession.analyticalStore.arguments}
            editingCritique={analyticalSession.editingCritique}
            currentChapterFile={currentChapterFile}
          />

          <InquiryModal
            isOpen={analyticalSession.inquiryModalOpen}
            onClose={analyticalSession.closeModals}
            onSave={analyticalSession.saveInquiry}
            stagedQuestion={analyticalSession.stagedInquiryTarget?.question}
            stagedCitation={analyticalSession.stagedInquiryTarget?.citation}
            argumentsList={analyticalSession.analyticalStore.arguments}
            editingInquiry={analyticalSession.editingInquiry}
            currentChapterFile={currentChapterFile}
          />
        </>
      )}

      {syntopiconSession && (
        <>
          <NeutralTermModal
            isOpen={syntopiconSession.isTermModalOpen}
            onClose={syntopiconSession.closeTermModal}
            onSave={syntopiconSession.saveNeutralTerm}
            stagedCitation={syntopiconSession.stagedCitation}
            editingTerm={syntopiconSession.editingTerm}
            currentBookId={activeBookId}
            currentChapterFile={currentChapterFile}
          />
          <ControversyModal
            isOpen={syntopiconSession.isControversyModalOpen}
            onClose={syntopiconSession.closeControversyModal}
            onSave={syntopiconSession.saveControversy}
            questions={syntopiconSession.activeTopic?.questions || []}
            stagedCitation={syntopiconSession.stagedCitation}
            editingControversy={syntopiconSession.editingControversy}
            currentBookId={activeBookId}
            currentChapterFile={currentChapterFile}
          />
        </>
      )}

      <LevelGuideModal
        isOpen={guideOpen}
        onClose={onCloseGuide || (() => {})}
        activeLevel={activeLevel}
      />
    </>
  );
};
