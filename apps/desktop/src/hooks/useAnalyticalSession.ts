import { useState, useEffect, useCallback } from "react";
import {
  AnalyticalStore,
  AuthorTerm,
  ArgumentNode,
  CritiqueItem,
  AuthorInquiry,
} from "../lib/types/analytical";
import { getAnalyticalData, saveAnalyticalData } from "../lib/api/analyticalApi";
import { reportBackendError } from "../lib/backendErrors";
import { useAnalyticalModals } from "./useAnalyticalModals";

export interface UseAnalyticalSessionProps {
  bookId?: string | null;
  currentChapterFile?: string;
  /** The anchor of the paragraph on screen, which a citation that is not made from a selection names (RD-04). */
  currentAnchor?: string;
}

/** No notes, as one value. It is what the app shows for a book whose notes have not read. */
const NO_NOTES: AnalyticalStore = { terms: [], arguments: [], critiques: [], inquiries: [] };

export function useAnalyticalSession({
  bookId,
  currentChapterFile,
  currentAnchor,
}: UseAnalyticalSessionProps) {
  /** The notes on screen. What is SHOWN is this only while the book they belong to did load, see below. */
  const [notes, setNotes] = useState<AnalyticalStore>(NO_NOTES);
  /** Which book was asked for, and whether its notes read. Nothing is asked for again while this matches. */
  const [asked, setAsked] = useState<{ of: string; read: boolean } | null>(null);

  const modals = useAnalyticalModals({ currentChapterFile, currentAnchor });
  /**
   * Shutting every window is taken out of `modals` on its own, because five of the calls below use only this one.
   * They used to write `modals.closeModals` in their list of what they read, and a list cannot hold half an object:
   * eslint read it as the whole of `modals`, which is a new object every drawing, and could say nothing about
   * whether the six were still current. `closeModals` is made once, so naming it keeps all six made once too.
   */
  const { closeModals } = modals;

  /**
   * The book whose analytical data loaded. Changes are saved only for this book: a save of data that did not load
   * would replace the analytical.json of the book with it.
   *
   * All three used to be set inside the effect below, two of them before the fetch was even started, so the page
   * was drawn once with the book before this one's notes still on it (TL-11). They are worked out here now.
   */
  const loadedBookId = bookId && asked?.of === bookId && asked.read ? bookId : null;
  const analyticalStore = loadedBookId ? notes : NO_NOTES;
  const loading = Boolean(bookId) && asked?.of !== bookId;

  // Load analytical data whenever active book changes
  useEffect(() => {
    if (!bookId) {
      closeModals();
      return;
    }
    let isCurrent = true;
    getAnalyticalData(bookId)
      .then((data) => {
        if (!isCurrent) return;
        setNotes({
          terms: data?.terms || [],
          arguments: data?.arguments || [],
          critiques: data?.critiques || [],
          inquiries: data?.inquiries || [],
          overallVerdict: data?.overallVerdict,
        });
        setAsked({ of: bookId, read: true });
      })
      .catch((err) => {
        if (!isCurrent) return;
        setAsked({ of: bookId, read: false });
        reportBackendError("Your analytical notes for this book did not load, so changes to them are not saved.", err);
      });

    return () => {
      isCurrent = false;
    };
  }, [bookId, closeModals]);

  /** True when the analytical data of this book loaded. Otherwise shows why a change is not saved. */
  const canSave = useCallback((): boolean => {
    if (bookId && loadedBookId === bookId) return true;
    reportBackendError(
      "Your change was not saved.",
      "The analytical notes of this book did not load, and a save now would erase them. Open another book, then this book again."
    );
    return false;
  }, [bookId, loadedBookId]);

  /** Saves the store to the vault. A failed save keeps the change on screen and shows the error. */
  const saveStore = useCallback(
    async (newStore: AnalyticalStore) => {
      if (!bookId) return;
      try {
        await saveAnalyticalData(bookId, newStore);
      } catch (err) {
        reportBackendError("Your analytical notes were not saved. The change stays on screen until you open another book.", err);
      }
    },
    [bookId]
  );

  const saveTerm = useCallback(
    async (term: AuthorTerm) => {
      if (!bookId || !canSave()) return;
      const index = analyticalStore.terms.findIndex((t) => t.id === term.id);
      const updatedTerms =
        index >= 0
          ? analyticalStore.terms.map((t) => (t.id === term.id ? term : t))
          : [...analyticalStore.terms, term];

      const newStore: AnalyticalStore = {
        ...analyticalStore,
        terms: updatedTerms,
      };

      setNotes(newStore);
      closeModals();
      await saveStore(newStore);
    },
    [bookId, analyticalStore, closeModals, canSave, saveStore]
  );

  const deleteTerm = useCallback(
    async (termId: string) => {
      if (!bookId || !canSave()) return;
      const updatedTerms = analyticalStore.terms.filter((t) => t.id !== termId);
      const newStore: AnalyticalStore = {
        ...analyticalStore,
        terms: updatedTerms,
      };

      setNotes(newStore);
      await saveStore(newStore);
    },
    [bookId, analyticalStore, canSave, saveStore]
  );

  const saveArgument = useCallback(
    async (argument: ArgumentNode) => {
      if (!bookId || !canSave()) return;
      const index = analyticalStore.arguments.findIndex((a) => a.id === argument.id);
      const updatedArguments =
        index >= 0
          ? analyticalStore.arguments.map((a) => (a.id === argument.id ? argument : a))
          : [...analyticalStore.arguments, argument];

      const newStore: AnalyticalStore = {
        ...analyticalStore,
        arguments: updatedArguments,
      };

      setNotes(newStore);
      closeModals();
      await saveStore(newStore);
    },
    [bookId, analyticalStore, closeModals, canSave, saveStore]
  );

  const deleteArgument = useCallback(
    async (argId: string) => {
      if (!bookId || !canSave()) return;
      const updatedArguments = analyticalStore.arguments.filter((a) => a.id !== argId);

      // Cascading referential integrity: remove deleted arg ID from solutionArgumentIds in all inquiries
      const currentInquiries = analyticalStore.inquiries || [];
      const updatedInquiries = currentInquiries.map((inq) => ({
        ...inq,
        solutionArgumentIds: inq.solutionArgumentIds.filter((id) => id !== argId),
      }));

      const newStore: AnalyticalStore = {
        ...analyticalStore,
        arguments: updatedArguments,
        inquiries: updatedInquiries,
      };

      setNotes(newStore);
      await saveStore(newStore);
    },
    [bookId, analyticalStore, canSave, saveStore]
  );

  const saveCritique = useCallback(
    async (item: CritiqueItem) => {
      if (!bookId || !canSave()) return;
      const critiques = analyticalStore.critiques || [];
      const index = critiques.findIndex((c) => c.id === item.id);
      const updated =
        index >= 0
          ? critiques.map((c) => (c.id === item.id ? item : c))
          : [...critiques, item];

      const newStore: AnalyticalStore = {
        ...analyticalStore,
        critiques: updated,
      };

      setNotes(newStore);
      closeModals();
      await saveStore(newStore);
    },
    [bookId, analyticalStore, closeModals, canSave, saveStore]
  );

  const deleteCritique = useCallback(
    async (id: string) => {
      if (!bookId || !canSave()) return;
      const critiques = analyticalStore.critiques || [];
      const updated = critiques.filter((c) => c.id !== id);
      const newStore: AnalyticalStore = {
        ...analyticalStore,
        critiques: updated,
      };

      setNotes(newStore);
      await saveStore(newStore);
    },
    [bookId, analyticalStore, canSave, saveStore]
  );

  const saveInquiry = useCallback(
    async (inquiry: AuthorInquiry) => {
      if (!bookId || !canSave()) return;
      const inquiries = analyticalStore.inquiries || [];
      const index = inquiries.findIndex((i) => i.id === inquiry.id);
      const updated =
        index >= 0
          ? inquiries.map((i) => (i.id === inquiry.id ? inquiry : i))
          : [...inquiries, inquiry];

      const newStore: AnalyticalStore = {
        ...analyticalStore,
        inquiries: updated,
      };

      setNotes(newStore);
      closeModals();
      await saveStore(newStore);
    },
    [bookId, analyticalStore, closeModals, canSave, saveStore]
  );

  const deleteInquiry = useCallback(
    async (id: string) => {
      if (!bookId || !canSave()) return;
      const inquiries = analyticalStore.inquiries || [];
      const updated = inquiries.filter((i) => i.id !== id);
      const newStore: AnalyticalStore = {
        ...analyticalStore,
        inquiries: updated,
      };

      setNotes(newStore);
      await saveStore(newStore);
    },
    [bookId, analyticalStore, canSave, saveStore]
  );

  return {
    analyticalStore,
    loading,
    ...modals,
    saveTerm,
    deleteTerm,
    saveArgument,
    deleteArgument,
    saveCritique,
    deleteCritique,
    saveInquiry,
    deleteInquiry,
  };
}
