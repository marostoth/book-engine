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
  BookMeta,
  ReaderPreferences,
  DayReviewActivity,
  ReadingVelocityStats,
  StudyAnalytics,
} from "../lib/types";
import { getStudyAnalytics, fetchReadingVelocity } from "../lib/api";
import { HeatmapGrid } from "./analytics/HeatmapGrid";
import { VelocityTable } from "./analytics/VelocityTable";

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeBookId: string;
  bookMeta: BookMeta | null;
  preferences: ReaderPreferences;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  isOpen,
  onClose,
  activeBookId,
  bookMeta,
  preferences,
}) => {
  const [scope, setScope] = useState<"active" | "all">("active");
  const [loading, setLoading] = useState<boolean>(true);
  const [studyAnalytics, setStudyAnalytics] = useState<StudyAnalytics | null>(null);
  const [heatmapData, setHeatmapData] = useState<DayReviewActivity[]>([]);
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
      setHeatmapData(analytics.daily_reviews);
      setVelocityStats(velocity);
    } catch (err) {
      console.warn("Failed to load analytics:", err);
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

  // Calculate streaks
  const { currentStreak, longestStreak } = useMemo(() => {
    const activityMap = new Map<string, number>();
    for (const item of heatmapData) {
      activityMap.set(item.date, item.count);
    }

    const today = new Date();
    let current = 0;
    let longest = 0;
    let temp = 0;

    for (let i = 365; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const str = d.toISOString().split("T")[0];
      const count = activityMap.get(str) || 0;
      if (count > 0) {
        temp++;
        longest = Math.max(longest, temp);
      } else {
        temp = 0;
      }
    }

    for (let i = 0; i < 365; i++) {
      const d = new Date(today.getTime() - i * 86400000);
      const str = d.toISOString().split("T")[0];
      const count = activityMap.get(str) || 0;
      if (count > 0) {
        current++;
      } else if (i === 0) {
        continue;
      } else {
        break;
      }
    }

    return { currentStreak: current, longestStreak: longest };
  }, [heatmapData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6 select-none animate-in fade-in duration-150">
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div
        className="relative z-10 w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl border border-black/10 dark:border-white/10 shadow-2xl p-6 sm:p-7 flex flex-col space-y-6 animate-in zoom-in-95 duration-150"
        style={{ backgroundColor: "var(--theme-surface)", color: "var(--theme-text)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-black/10 dark:border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 dark:bg-nord-accent/15 text-amber-700 dark:text-nord-accent">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                Study & Reading Analytics
              </h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                FSRS spaced repetition memory retention, activity grid, and reading velocity
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center p-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] border border-black/5 dark:border-white/5 text-xs">
              <button
                onClick={() => setScope("active")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  scope === "active"
                    ? "bg-white dark:bg-nord-surface text-neutral-900 dark:text-neutral-100 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
                }`}
              >
                Active Book
              </button>
              <button
                onClick={() => setScope("all")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  scope === "all"
                    ? "bg-white dark:bg-nord-surface text-neutral-900 dark:text-neutral-100 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
                }`}
              >
                All Books
              </button>
            </div>

            <button
              onClick={loadAnalytics}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              title="Refresh Analytics"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Section 1: Study Analytics Summary Cards */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] flex flex-col justify-between">
              <div className="flex items-center justify-between text-neutral-500 text-xs font-medium mb-2">
                <span>Retention Rate</span>
                <Brain className="w-4 h-4 text-purple-500" />
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {studyAnalytics?.retention_rate ? `${studyAnalytics.retention_rate}%` : "90.0%"}
                </div>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Extractive memory recall
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] flex flex-col justify-between">
              <div className="flex items-center justify-between text-neutral-500 text-xs font-medium mb-2">
                <span>Total Cards Mastered</span>
                <Trophy className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
                  {studyAnalytics?.mastered_cards ?? 0}
                </div>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Stability &ge; 21 days ({studyAnalytics?.state_counts.total_cards ?? 0} total)
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] flex flex-col justify-between">
              <div className="flex items-center justify-between text-neutral-500 text-xs font-medium mb-2">
                <span>Due Today</span>
                <Target className="w-4 h-4 text-amber-600 dark:text-nord-accent" />
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
                  {studyAnalytics?.cards_due_today ?? 0}
                </div>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Target: {preferences.dailyTarget} cards/day
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] flex flex-col justify-between">
              <div className="flex items-center justify-between text-neutral-500 text-xs font-medium mb-2">
                <span>Vault Words Indexed</span>
                <BookOpen className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
                  {(studyAnalytics?.total_vault_words ?? 0).toLocaleString()}
                </div>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  ~{studyAnalytics?.estimated_reading_time_mins ?? 0} mins reading time
                </p>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl border border-black/5 dark:border-white/5 bg-black/[0.015] dark:bg-white/[0.015] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-neutral-500">
              <Layers className="w-3.5 h-3.5 text-neutral-400" />
              <span className="font-semibold uppercase tracking-wider text-[10px]">Card States:</span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                New: <strong>{studyAnalytics?.state_counts.new_count ?? 0}</strong>
              </span>
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Learning: <strong>{studyAnalytics?.state_counts.learning_count ?? 0}</strong>
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Review: <strong>{studyAnalytics?.state_counts.review_count ?? 0}</strong>
              </span>
              <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Relearning: <strong>{studyAnalytics?.state_counts.relearning_count ?? 0}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-neutral-500 font-mono">
              <Flame className="w-3.5 h-3.5 text-orange-500" />
              Streak:{" "}
              <strong className="text-neutral-900 dark:text-neutral-100">
                {currentStreak} {currentStreak === 1 ? "day" : "days"}
              </strong>
              <span className="text-[10px] text-neutral-400 font-sans">(Best: {longestStreak}d)</span>
            </div>
          </div>
        </div>

        {/* Section 2: FSRS Retention Activity Grid (GitHub-style Heatmap) */}
        <HeatmapGrid heatmapData={heatmapData} />

        {/* Section 3: Reading Velocity & Completed Chapters */}
        <VelocityTable velocityStats={velocityStats} bookMeta={bookMeta} />
      </div>
    </div>
  );
};
