import React, { useEffect, useState, useMemo } from "react";
import {
  X,
  BarChart3,
  Flame,
  Trophy,
  Target,
  Brain,
  RefreshCw,
  BookOpen,
  Layers,
} from "lucide-react";
import {
  ReaderPreferences,
  ReviewBlock,
  ReadingVelocityStats,
  StudyAnalytics,
} from "../lib/types";
import { getStudyAnalytics, fetchReadingVelocity } from "../lib/api";
import { reportBackendError } from "../lib/backendErrors";
import { countText, NO_DATA, retentionText } from "../lib/analyticsText";
import { reviewsPerDay, reviewStreaks } from "../lib/reviewDays";
import { HeatmapGrid } from "./analytics/HeatmapGrid";
import { VelocityTable } from "./analytics/VelocityTable";

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeBookId: string;
  preferences: ReaderPreferences;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  isOpen,
  onClose,
  activeBookId,
  preferences,
}) => {
  const [scope, setScope] = useState<"active" | "all">("active");
  const [loading, setLoading] = useState<boolean>(true);
  const [studyAnalytics, setStudyAnalytics] = useState<StudyAnalytics | null>(null);
  const [reviewBlocks, setReviewBlocks] = useState<ReviewBlock[]>([]);
  const [velocityStats, setVelocityStats] = useState<ReadingVelocityStats | null>(null);

  const loadAnalytics = async () => {
    setLoading(true);
    const targetBookId = scope === "active" ? activeBookId : undefined;
    try {
      const [analytics, velocity] = await Promise.all([
        getStudyAnalytics(targetBookId),
        fetchReadingVelocity(targetBookId),
      ]);
      setStudyAnalytics(analytics);
      setReviewBlocks(analytics.review_blocks);
      setVelocityStats(velocity);
    } catch (err) {
      reportBackendError("Could not load your study analytics.", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAnalytics();
    }
  }, [isOpen, scope, activeBookId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Reviews per day and the streaks, in the time zone of this window (AN-02)
  const perDay = useMemo(() => reviewsPerDay(reviewBlocks), [reviewBlocks]);
  const { current: currentStreak, longest: longestStreak } = useMemo(() => reviewStreaks(perDay, new Date()), [perDay]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6 select-none animate-in fade-in duration-150">
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div
        className="relative z-10 w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl border border-[var(--theme-border)] shadow-2xl p-6 sm:p-7 flex flex-col space-y-6 animate-in zoom-in-95 duration-150"
        style={{ backgroundColor: "var(--theme-surface)", color: "var(--theme-text)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--theme-border)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[var(--theme-text)] flex items-center gap-2">
                Study & Reading Analytics
              </h1>
              <p className="text-xs text-[var(--theme-muted)]">
                FSRS spaced repetition memory retention, activity grid, and reading time
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center p-0.5 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-border)] text-xs">
              <button
                onClick={() => setScope("active")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  scope === "active"
                    ? "bg-[var(--theme-accent)]/20 text-[var(--theme-text)] font-semibold shadow-sm"
                    : "text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
                }`}
              >
                Active Book
              </button>
              <button
                onClick={() => setScope("all")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  scope === "all"
                    ? "bg-[var(--theme-accent)]/20 text-[var(--theme-text)] font-semibold shadow-sm"
                    : "text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
                }`}
              >
                All Books
              </button>
            </div>

            <button
              onClick={loadAnalytics}
              className="p-2 rounded-xl text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent)]/10 transition-colors"
              title="Refresh Analytics"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent)]/10 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Section 1: Study Analytics Summary Cards */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)]/40 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[var(--theme-muted)] text-xs font-medium mb-2">
                <span>Retention Rate</span>
                <Brain className="w-4 h-4 text-purple-500" />
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {retentionText(studyAnalytics?.retention_rate)}
                </div>
                <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
                  {studyAnalytics && studyAnalytics.retention_rate === null ? "No reviews yet" : "Extractive memory recall"}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)]/40 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[var(--theme-muted)] text-xs font-medium mb-2">
                <span>Total Cards Mastered</span>
                <Trophy className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-[var(--theme-text)]">
                  {countText(studyAnalytics?.mastered_cards)}
                </div>
                <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
                  Stability &ge; 21 days ({countText(studyAnalytics?.state_counts.total_cards)} total)
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)]/40 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[var(--theme-muted)] text-xs font-medium mb-2">
                <span>Reviews Due</span>
                <Target className="w-4 h-4 text-[var(--theme-accent)]" />
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-[var(--theme-text)]">
                  {countText(studyAnalytics?.reviews_due)}
                </div>
                <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
                  {countText(studyAnalytics?.new_cards)} new cards
                </p>
                <p className="text-[11px] text-[var(--theme-muted)]">
                  Target: {preferences.dailyTarget} cards/day
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)]/40 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[var(--theme-muted)] text-xs font-medium mb-2">
                <span>Vault Words Indexed</span>
                <BookOpen className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-[var(--theme-text)]">
                  {countText(studyAnalytics?.total_vault_words)}
                </div>
                <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
                  {studyAnalytics ? `~${studyAnalytics.estimated_reading_time_mins} mins reading time` : NO_DATA}
                </p>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)]/30 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[var(--theme-muted)]">
              <Layers className="w-3.5 h-3.5 text-[var(--theme-muted)]" />
              <span className="font-semibold uppercase tracking-wider text-[10px]">Card States:</span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                New: <strong>{countText(studyAnalytics?.state_counts.new_count)}</strong>
              </span>
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Learning: <strong>{countText(studyAnalytics?.state_counts.learning_count)}</strong>
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Review: <strong>{countText(studyAnalytics?.state_counts.review_count)}</strong>
              </span>
              <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Relearning: <strong>{countText(studyAnalytics?.state_counts.relearning_count)}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--theme-muted)] font-mono">
              <Flame className="w-3.5 h-3.5 text-orange-500" />
              Streak:{" "}
              <strong className="text-[var(--theme-text)]">
                {currentStreak} {currentStreak === 1 ? "day" : "days"}
              </strong>
              <span className="text-[10px] text-[var(--theme-muted)] font-sans">(Best: {longestStreak}d)</span>
            </div>
          </div>
        </div>

        {/* Section 2: FSRS Retention Activity Grid (GitHub-style Heatmap) */}
        <HeatmapGrid reviewsPerDay={perDay} />

        {/* Section 3: Reading Time & Completed Chapters */}
        <VelocityTable velocityStats={velocityStats} showBooks={scope === "all"} />
      </div>
    </div>
  );
};
