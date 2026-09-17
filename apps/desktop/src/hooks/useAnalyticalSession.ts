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

export function useAnalyticalSession({
  bookId,
  currentChapterFile,
  currentAnchor,
}: UseAnalyticalSessionProps) {
  const [analyticalStore, setAnalyticalStore] = useState<AnalyticalStore>({
    terms: [],
    arguments: [],
    critiques: [],
    inquiries: [],
  });
  const [loading, setLoading] = useState<boolean>(false);
  // The book whose analytical data loaded. Changes are saved only for this book: a save of data that did not load
  // would replace the analytical.json of the book with it.
  const [loadedBookId, setLoadedBookId] = useState<string | null>(null);

  const modals = useAnalyticalModals({ currentChapterFile, currentAnchor });

  // Load analytical data whenever active book changes
  useEffect(() => {
    let isCurrent = true;
    setLoadedBookId(null);
    if (!bookId) {
      setAnalyticalStore({ terms: [], arguments: [], critiques: [], inquiries: [] });
      modals.closeModals();
      return;
    }

    setLoading(true);
    getAnalyticalData(bookId)
      .then((data) => {
        if (isCurrent) {
          setAnalyticalStore({
            terms: data?.terms || [],
            arguments: data?.arguments || [],
            critiques: data?.critiques || [],
            inquiries: data?.inquiries || [],
            overallVerdict: data?.overallVerdict,
          });
          setLoadedBookId(bookId);
        }
      })
      .catch((err) => {
        if (isCurrent) {
          setAnalyticalStore({ terms: [], arguments: [], critiques: [], inquiries: [] });
          reportBackendError("Your analytical notes for this book did not load, so changes to them are not saved.", err);
        }
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [bookId]);

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

      setAnalyticalStore(newStore);
      modals.closeModals();
      await saveStore(newStore);
    },
    [bookId, analyticalStore, modals.closeModals, canSave, saveStore]
  );

  const deleteTerm = useCallback(
    async (termId: string) => {
      if (!bookId || !canSave()) return;
      const updatedTerms = analyticalStore.terms.filter((t) => t.id !== termId);
      const newStore: AnalyticalStore = {
        ...analyticalStore,
        terms: updatedTerms,
      };

      setAnalyticalStore(newStore);
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

      setAnalyticalStore(newStore);
      modals.closeModals();
      await saveStore(newStore);
    },
    [bookId, analyticalStore, modals.closeModals, canSave, saveStore]
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

      setAnalyticalStore(newStore);
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

      setAnalyticalStore(newStore);
      modals.closeModals();
      await saveStore(newStore);
    },
    [bookId, analyticalStore, modals.closeModals, canSave, saveStore]
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

      setAnalyticalStore(newStore);
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

      setAnalyticalStore(newStore);
      modals.closeModals();
      await saveStore(newStore);
    },
    [bookId, analyticalStore, modals.closeModals, canSave, saveStore]
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

      setAnalyticalStore(newStore);
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
