import { useState, useCallback } from "react";
import {
  AuthorTerm,
  ArgumentNode,
  CritiqueItem,
  AuthorInquiry,
  AnchoredCitation,
} from "../lib/types/analytical";

export interface UseAnalyticalModalsProps {
  currentChapterFile?: string;
  /** The anchor of the paragraph on screen. */
  currentAnchor?: string;
}

export function useAnalyticalModals({ currentChapterFile, currentAnchor }: UseAnalyticalModalsProps) {
  /**
   * The citation of a modal that opens from a button, with no selection in the reader: the paragraph on screen, and no
   * anchor when the reader is not on one. The app used to write `^p-001` here, which named the first block of the
   * chapter wherever the reader was (RD-04).
   *
   * Made once for a place, because the four openers below are made once as well and each of them calls it (TL-11).
   * They used to list the two values THIS function reads instead of listing this function, which was the same list
   * by hand: a third value read here would have left all four openers pointing at the place before, with nothing to
   * say so. `react-hooks/exhaustive-deps` says so.
   */
  const placeOnScreen = useCallback(
    (): AnchoredCitation | null =>
      currentChapterFile ? { chapterFile: currentChapterFile, anchor: currentAnchor ?? "", quote: "" } : null,
    [currentChapterFile, currentAnchor]
  );

  const [termModalOpen, setTermModalOpen] = useState<boolean>(false);
  const [argumentModalOpen, setArgumentModalOpen] = useState<boolean>(false);
  const [critiqueModalOpen, setCritiqueModalOpen] = useState<boolean>(false);
  const [inquiryModalOpen, setInquiryModalOpen] = useState<boolean>(false);

  const [stagedCitation, setStagedCitation] = useState<AnchoredCitation | null>(null);
  const [stagedCritiqueTarget, setStagedCritiqueTarget] = useState<{
    targetArgumentId?: string;
    citation?: AnchoredCitation;
  } | null>(null);
  const [stagedInquiryTarget, setStagedInquiryTarget] = useState<{
    question?: string;
    citation?: AnchoredCitation;
  } | null>(null);

  const [editingTerm, setEditingTerm] = useState<AuthorTerm | null>(null);
  const [editingArgument, setEditingArgument] = useState<ArgumentNode | null>(null);
  const [editingCritique, setEditingCritique] = useState<CritiqueItem | null>(null);
  const [editingInquiry, setEditingInquiry] = useState<AuthorInquiry | null>(null);

  const openTermModal = useCallback(
    (target?: AnchoredCitation | AuthorTerm) => {
      if (target && "term" in target) {
        setEditingTerm(target);
        setStagedCitation(target.citation);
      } else if (target && "chapterFile" in target) {
        setEditingTerm(null);
        setStagedCitation(target);
      } else {
        setEditingTerm(null);
        setStagedCitation(placeOnScreen());
      }
      setTermModalOpen(true);
    },
    [placeOnScreen]
  );

  const openArgumentModal = useCallback(
    (target?: AnchoredCitation | ArgumentNode) => {
      if (target && "inferenceType" in target) {
        setEditingArgument(target);
        setStagedCitation(target.conclusion);
      } else if (target && "chapterFile" in target) {
        setEditingArgument(null);
        setStagedCitation(target);
      } else {
        setEditingArgument(null);
        setStagedCitation(placeOnScreen());
      }
      setArgumentModalOpen(true);
    },
    [placeOnScreen]
  );

  const openCritiqueModal = useCallback(
    (targetArgId?: string, citation?: AnchoredCitation, critiqueToEdit?: CritiqueItem) => {
      setEditingCritique(critiqueToEdit || null);
      if (critiqueToEdit) {
        setStagedCritiqueTarget({
          targetArgumentId: critiqueToEdit.targetArgumentId || undefined,
          citation: critiqueToEdit.citation || undefined,
        });
      } else {
        setStagedCritiqueTarget({
          targetArgumentId: targetArgId,
          citation: citation || placeOnScreen() || undefined,
        });
      }
      setCritiqueModalOpen(true);
    },
    [placeOnScreen]
  );

  const openInquiryModal = useCallback(
    (target?: { quote?: string; anchor?: string; chapterFile?: string } | AuthorInquiry) => {
      if (target && "question" in target && "domain" in target) {
        setEditingInquiry(target);
        setStagedInquiryTarget({
          question: target.question,
          citation: target.citation || undefined,
        });
      } else if (target && "quote" in target) {
        setEditingInquiry(null);
        setStagedInquiryTarget({
          question: target.quote,
          citation: {
            chapterFile: target.chapterFile || currentChapterFile || "",
            anchor: target.anchor || currentAnchor || "",
            quote: target.quote || "",
          },
        });
      } else {
        setEditingInquiry(null);
        setStagedInquiryTarget({
          question: "",
          citation: placeOnScreen() || undefined,
        });
      }
      setInquiryModalOpen(true);
    },
    // This one reads the chapter and the anchor itself as well, for the staged question, so it names all three.
    [placeOnScreen, currentChapterFile, currentAnchor]
  );

  const closeModals = useCallback(() => {
    setTermModalOpen(false);
    setArgumentModalOpen(false);
    setCritiqueModalOpen(false);
    setInquiryModalOpen(false);
    setStagedCitation(null);
    setStagedCritiqueTarget(null);
    setStagedInquiryTarget(null);
    setEditingTerm(null);
    setEditingArgument(null);
    setEditingCritique(null);
    setEditingInquiry(null);
  }, []);

  return {
    termModalOpen,
    argumentModalOpen,
    critiqueModalOpen,
    inquiryModalOpen,
    stagedCitation,
    stagedCritiqueTarget,
    stagedInquiryTarget,
    editingTerm,
    editingArgument,
    editingCritique,
    editingInquiry,
    openTermModal,
    openArgumentModal,
    openCritiqueModal,
    openInquiryModal,
    closeModals,
  };
}
