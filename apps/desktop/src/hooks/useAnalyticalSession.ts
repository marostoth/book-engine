import { useState, useEffect, useCallback } from "react";
import {
  AnalyticalStore,
  AuthorTerm,
  ArgumentNode,
  CritiqueItem,
  AuthorInquiry,
} from "../lib/types/analytical";
import { getAnalyticalData, saveAnalyticalData } from "../lib/api/analyticalApi";
import { useAnalyticalModals } from "./useAnalyticalModals";

export interface UseAnalyticalSessionProps {
  bookId?: string | null;
  currentChapterFile?: string;
}

export function useAnalyticalSession({
  bookId,
  currentChapterFile,
}: UseAnalyticalSessionProps) {
  const [analyticalStore, setAnalyticalStore] = useState<AnalyticalStore>({
    terms: [],
    arguments: [],
    critiques: [],
    inquiries: [],
  });
  const [loading, setLoading] = useState<boolean>(false);

  const modals = useAnalyticalModals({ currentChapterFile });

  // Load analytical data whenever active book changes
  useEffect(() => {
    let isCurrent = true;
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
        }
      })
      .catch((err) => {
        console.error("Failed to load analytical store:", err);
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [bookId]);

  const saveTerm = useCallback(
    async (term: AuthorTerm) => {
      if (!bookId) return;
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
      await saveAnalyticalData(bookId, newStore);
    },
    [bookId, analyticalStore, modals.closeModals]
  );

  const deleteTerm = useCallback(
    async (termId: string) => {
      if (!bookId) return;
      const updatedTerms = analyticalStore.terms.filter((t) => t.id !== termId);
      const newStore: AnalyticalStore = {
        ...analyticalStore,
        terms: updatedTerms,
      };

      setAnalyticalStore(newStore);
      await saveAnalyticalData(bookId, newStore);
    },
    [bookId, analyticalStore]
  );

  const saveArgument = useCallback(
    async (argument: ArgumentNode) => {
      if (!bookId) return;
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
      await saveAnalyticalData(bookId, newStore);
    },
    [bookId, analyticalStore, modals.closeModals]
  );

  const deleteArgument = useCallback(
    async (argId: string) => {
      if (!bookId) return;
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
      await saveAnalyticalData(bookId, newStore);
    },
    [bookId, analyticalStore]
  );

  const saveCritique = useCallback(
    async (item: CritiqueItem) => {
      if (!bookId) return;
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
      await saveAnalyticalData(bookId, newStore);
    },
    [bookId, analyticalStore, modals.closeModals]
  );

  const deleteCritique = useCallback(
    async (id: string) => {
      if (!bookId) return;
      const critiques = analyticalStore.critiques || [];
      const updated = critiques.filter((c) => c.id !== id);
      const newStore: AnalyticalStore = {
        ...analyticalStore,
        critiques: updated,
      };

      setAnalyticalStore(newStore);
      await saveAnalyticalData(bookId, newStore);
    },
    [bookId, analyticalStore]
  );

  const saveInquiry = useCallback(
    async (inquiry: AuthorInquiry) => {
      if (!bookId) return;
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
      await saveAnalyticalData(bookId, newStore);
    },
    [bookId, analyticalStore, modals.closeModals]
  );

  const deleteInquiry = useCallback(
    async (id: string) => {
      if (!bookId) return;
      const inquiries = analyticalStore.inquiries || [];
      const updated = inquiries.filter((i) => i.id !== id);
      const newStore: AnalyticalStore = {
        ...analyticalStore,
        inquiries: updated,
      };

      setAnalyticalStore(newStore);
      await saveAnalyticalData(bookId, newStore);
    },
    [bookId, analyticalStore]
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
