import { useState, useEffect, useCallback } from "react";
import {
  SyntopicTopic,
  SyntopicTopicSummary,
  NeutralTerm,
  SyntopicQuestion,
  SyntopicControversy,
  StagedCitation,
} from "../lib/types/syntopicon";
import {
  getSyntopicTopics,
  getSyntopicTopic,
  saveSyntopicTopic,
  exportSyntopicReport,
} from "../lib/api/syntopiconApi";
import { reportBackendError } from "../lib/backendErrors";

export function useSyntopiconSession() {
  const [topics, setTopics] = useState<SyntopicTopicSummary[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [activeTopic, setActiveTopic] = useState<SyntopicTopic | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [lastExportPath, setLastExportPath] = useState<string | null>(null);

  // Staged citation captured from reader text selection
  const [stagedCitation, setStagedCitation] = useState<StagedCitation | null>(null);

  // Modal dialog states
  const [isTermModalOpen, setIsTermModalOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<NeutralTerm | null>(null);

  const [isControversyModalOpen, setIsControversyModalOpen] = useState(false);
  const [editingControversy, setEditingControversy] = useState<SyntopicControversy | null>(null);

  // Refresh topic summaries list
  const refreshTopics = useCallback(async () => {
    try {
      const list = await getSyntopicTopics();
      setTopics(list);
      return list;
    } catch (err) {
      reportBackendError("Could not load your syntopicon topics.", err);
      return [];
    }
  }, []);

  // Initial load
  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    refreshTopics()
      .then((list) => {
        if (!isCurrent) return;
        if (list.length > 0 && !activeTopicId) setActiveTopicId(list[0].id);
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });
    return () => { isCurrent = false; };
  }, [refreshTopics]);

  // Load active topic whenever activeTopicId changes
  useEffect(() => {
    let isCurrent = true;
    if (!activeTopicId) {
      setActiveTopic(null);
      return;
    }
    setLoading(true);
    getSyntopicTopic(activeTopicId)
      .then((t) => { if (isCurrent) setActiveTopic(t); })
      .catch((err) => {
        if (isCurrent) setActiveTopic(null);
        reportBackendError("Could not load the syntopicon topic.", err);
      })
      .finally(() => { if (isCurrent) setLoading(false); });
    return () => { isCurrent = false; };
  }, [activeTopicId]);

  // Create new syntopical topic. Gives null when the topic was not saved.
  const createTopic = useCallback(
    async (title: string, description: string) => {
      const id = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || `topic-${Date.now()}`;

      const newTopic: SyntopicTopic = {
        id,
        title,
        description,
        neutralTerms: [],
        questions: [],
        controversies: [],
        createdAt: new Date().toISOString(),
      };

      try {
        await saveSyntopicTopic(newTopic);
      } catch (err) {
        reportBackendError(`The topic "${title}" was not created.`, err);
        return null;
      }
      await refreshTopics();
      setActiveTopicId(id);
      setActiveTopic(newTopic);
      return newTopic;
    },
    [refreshTopics]
  );

  // Persist helper for updated active topic. A failed save keeps the change on screen, shows the error, and gives false.
  const persistTopic = useCallback(async (updated: SyntopicTopic): Promise<boolean> => {
    setActiveTopic(updated);
    try {
      await saveSyntopicTopic(updated);
    } catch (err) {
      reportBackendError("Your syntopicon changes were not saved. They stay on screen until you open another topic.", err);
      return false;
    }
    await refreshTopics();
    return true;
  }, [refreshTopics]);

  // Neutral Term CRUD
  const saveNeutralTerm = useCallback(
    async (term: NeutralTerm) => {
      if (!activeTopic) return;
      const idx = activeTopic.neutralTerms.findIndex((t) => t.id === term.id);
      const updatedTerms =
        idx >= 0
          ? activeTopic.neutralTerms.map((t) => (t.id === term.id ? term : t))
          : [...activeTopic.neutralTerms, term];

      await persistTopic({ ...activeTopic, neutralTerms: updatedTerms });
      setIsTermModalOpen(false);
      setEditingTerm(null);
    },
    [activeTopic, persistTopic]
  );

  const deleteNeutralTerm = useCallback(
    async (termId: string) => {
      if (!activeTopic) return;
      const updatedTerms = activeTopic.neutralTerms.filter((t) => t.id !== termId);
      await persistTopic({ ...activeTopic, neutralTerms: updatedTerms });
    },
    [activeTopic, persistTopic]
  );

  // Question CRUD with cascading controversy pruning
  const saveQuestion = useCallback(
    async (question: SyntopicQuestion) => {
      if (!activeTopic) return;
      const idx = activeTopic.questions.findIndex((q) => q.id === question.id);
      const updatedQuestions =
        idx >= 0
          ? activeTopic.questions.map((q) => (q.id === question.id ? question : q))
          : [...activeTopic.questions, question];

      await persistTopic({ ...activeTopic, questions: updatedQuestions });
    },
    [activeTopic, persistTopic]
  );

  const deleteQuestion = useCallback(
    async (questionId: string) => {
      if (!activeTopic) return;
      const updatedQuestions = activeTopic.questions.filter((q) => q.id !== questionId);
      const updatedControversies = activeTopic.controversies.filter(
        (c) => c.questionId !== questionId
      );
      await persistTopic({
        ...activeTopic,
        questions: updatedQuestions,
        controversies: updatedControversies,
      });
    },
    [activeTopic, persistTopic]
  );

  // Controversy CRUD
  const saveControversy = useCallback(
    async (controversy: SyntopicControversy) => {
      if (!activeTopic) return;
      const idx = activeTopic.controversies.findIndex((c) => c.id === controversy.id);
      const updatedControversies =
        idx >= 0
          ? activeTopic.controversies.map((c) => (c.id === controversy.id ? controversy : c))
          : [...activeTopic.controversies, controversy];

      await persistTopic({ ...activeTopic, controversies: updatedControversies });
      setIsControversyModalOpen(false);
      setEditingControversy(null);
    },
    [activeTopic, persistTopic]
  );

  const deleteControversy = useCallback(
    async (controversyId: string) => {
      if (!activeTopic) return;
      const updatedControversies = activeTopic.controversies.filter(
        (c) => c.id !== controversyId
      );
      await persistTopic({ ...activeTopic, controversies: updatedControversies });
    },
    [activeTopic, persistTopic]
  );

  // Rule 5: Dialectical Synthesis persistence
  const saveSynthesis = useCallback(
    async (synthesisNotes?: string, dialecticalResolution?: string): Promise<boolean> => {
      if (!activeTopic) return false;
      const updated: SyntopicTopic = {
        ...activeTopic,
        synthesisNotes,
        dialecticalResolution,
      };
      return persistTopic(updated);
    },
    [activeTopic, persistTopic]
  );

  // Dossier Markdown export with Save-Before-Export Invariant
  const exportReport = useCallback(async () => {
    if (!activeTopic) return "";
    setIsExporting(true);
    try {
      await saveSyntopicTopic(activeTopic);
      const relPath = await exportSyntopicReport(activeTopic.id);
      setLastExportPath(relPath);
      return relPath;
    } catch (err) {
      reportBackendError("The dialectical dossier was not exported.", err);
      throw err;
    } finally {
      setIsExporting(false);
    }
  }, [activeTopic]);

  // Modal openers
  const openTermModal = useCallback((term?: NeutralTerm) => {
    setEditingTerm(term || null);
    setIsTermModalOpen(true);
  }, []);

  const closeTermModal = useCallback(() => {
    setIsTermModalOpen(false);
    setEditingTerm(null);
  }, []);

  const openControversyModal = useCallback((controversy?: SyntopicControversy) => {
    setEditingControversy(controversy || null);
    setIsControversyModalOpen(true);
  }, []);

  const closeControversyModal = useCallback(() => {
    setIsControversyModalOpen(false);
    setEditingControversy(null);
  }, []);

  return {
    topics,
    activeTopicId,
    activeTopic,
    loading,
    isExporting,
    lastExportPath,
    stagedCitation,
    stageCitation: setStagedCitation,
    clearStagedCitation: () => setStagedCitation(null),
    selectTopic: setActiveTopicId,
    createTopic,
    saveNeutralTerm,
    deleteNeutralTerm,
    saveQuestion,
    deleteQuestion,
    saveControversy,
    deleteControversy,
    saveSynthesis,
    exportReport,
    isTermModalOpen,
    editingTerm,
    openTermModal,
    closeTermModal,
    isControversyModalOpen,
    editingControversy,
    openControversyModal,
    closeControversyModal,
    refreshTopics,
  };
}
