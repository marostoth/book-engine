import React, { useEffect, useState, useMemo } from "react";
import {
  X,
  BarChart3,
  Calendar,
  Flame,
  Trophy,
  Target,
  Brain,
  Clock,
  Zap,
  CheckCircle,
  RefreshCw,
  TrendingUp,
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
import {
  getStudyAnalytics,
  fetchReadingVelocity,
} from "../lib/api";

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
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number } | null>(null);

  // Load analytics data via getStudyAnalytics and fetchReadingVelocity
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

  // Escape key handler
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

  // Transform heatmapData into a 52-week calendar grid (364 days, 7 rows: Mon-Sun)
  const calendarGrid = useMemo(() => {
    const activityMap = new Map<string, number>();
    for (const item of heatmapData) {
      activityMap.set(item.date, item.count);
    }

    const today = new Date();
    // Normalize to today midnight
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Calculate total weeks: 52 weeks (364 days)
    const daysToShow = 52 * 7;
    const start = new Date(end.getTime() - (daysToShow - 1) * 86400000);

    const weeks: { dateStr: string; count: number; month: string; isNewMonth: boolean }[][] = [];
    let currentWeek: { dateStr: string; count: number; month: string; isNewMonth: boolean }[] = [];
    let prevMonth = "";

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const count = activityMap.get(dateStr) || 0;
      const month = d.toLocaleString("default", { month: "short" });
      const isNewMonth = month !== prevMonth && d.getDate() <= 7;
      if (isNewMonth) prevMonth = month;

      currentWeek.push({ dateStr, count, month, isNewMonth });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return weeks;
  }, [heatmapData]);

  // Calculate streaks
  const { currentStreak, longestStreak, totalReviewsYear } = useMemo(() => {
    const activityMap = new Map<string, number>();
    let total = 0;
    for (const item of heatmapData) {
      activityMap.set(item.date, item.count);
      total += item.count;
    }

    const today = new Date();
    let current = 0;
    let longest = 0;
    let temp = 0;

    // Check last 365 days
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

    // Current streak from yesterday/today backwards
    for (let i = 0; i < 365; i++) {
      const d = new Date(today.getTime() - i * 86400000);
      const str = d.toISOString().split("T")[0];
      const count = activityMap.get(str) || 0;
      if (count > 0) {
        current++;
      } else if (i === 0) {
        // Today might not have a review yet, check yesterday
        continue;
      } else {
        break;
      }
    }

    return { currentStreak: current, longestStreak: longest, totalReviewsYear: total };
  }, [heatmapData]);

  // Format reading seconds into clean "Xh Ym"
  const formattedReadingTime = useMemo(() => {
    const totalSecs = velocityStats?.total_seconds || 0;
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m ${totalSecs % 60}s`;
  }, [velocityStats]);

  // Color tier resolver for GitHub activity cell
  const getCellColorClass = (count: number) => {
    if (count === 0) return "bg-black/[0.04] dark:bg-white/[0.05] border-black/5 dark:border-white/5";
    if (count <= 3) return "bg-emerald-300 dark:bg-emerald-900/60 border-emerald-400 dark:border-emerald-800";
    if (count <= 7) return "bg-emerald-400 dark:bg-emerald-700 border-emerald-500 dark:border-emerald-600";
    if (count <= 14) return "bg-emerald-500 dark:bg-emerald-500 border-emerald-600 dark:border-emerald-400";
    return "bg-emerald-700 dark:bg-emerald-400 border-emerald-800 dark:border-emerald-300";
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6 select-none animate-in fade-in duration-150">
      {/* Semi-transparent backdrop blur */}
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
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
            {/* Scope Switcher */}
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

            {/* Refresh Action */}
            <button
              onClick={loadAnalytics}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              title="Refresh Analytics"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            {/* Close Button */}
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
            {/* Retention Rate */}
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

            {/* Total Cards Mastered */}
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

            {/* Due Today */}
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

            {/* Total Vault Words Indexed */}
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

          {/* FSRS Card State Distribution Strip */}
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
              Streak: <strong className="text-neutral-900 dark:text-neutral-100">{currentStreak} {currentStreak === 1 ? "day" : "days"}</strong>
              <span className="text-[10px] text-neutral-400 font-sans">(Best: {longestStreak}d)</span>
            </div>
          </div>
        </div>



        {/* Section 2: FSRS Retention Activity Grid (GitHub-style Heatmap) */}
        <div className="p-5 rounded-3xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-600 dark:text-nord-accent" />
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                FSRS Review Activity Heatmap
              </span>
              <span className="text-[11px] text-neutral-400">
                ({totalReviewsYear} reviews in past 365 days)
              </span>
            </div>

            {/* Cell Tooltip or Hovered Status */}
            <div className="text-xs font-mono text-neutral-600 dark:text-neutral-300 h-5">
              {hoveredDay ? (
                <span>
                  <strong>{hoveredDay.count}</strong> {hoveredDay.count === 1 ? "review" : "reviews"} on{" "}
                  {new Date(hoveredDay.date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              ) : (
                <span className="text-neutral-400 text-[11px]">Hover over a day for details</span>
              )}
            </div>
          </div>

          {/* GitHub-style Horizontal Grid Container */}
          <div className="overflow-x-auto pb-2">
            <div className="inline-flex flex-col gap-1 min-w-[720px]">
              {/* Day rows (Mon, Tue, Wed, Thu, Fri, Sat, Sun) */}
              {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
                const dayLabels = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
                return (
                  <div key={dayIndex} className="flex items-center gap-1">
                    <span className="w-6 text-[9px] font-mono text-neutral-400 text-right pr-1">
                      {dayLabels[dayIndex]}
                    </span>
                    <div className="flex items-center gap-1">
                      {calendarGrid.map((week, weekIndex) => {
                        const dayData = week[dayIndex];
                        if (!dayData) {
                          return (
                            <div
                              key={weekIndex}
                              className="w-3 h-3 rounded-sm bg-transparent"
                            />
                          );
                        }
                        const isHovered = hoveredDay?.date === dayData.dateStr;
                        return (
                          <div
                            key={weekIndex}
                            onMouseEnter={() =>
                              setHoveredDay({ date: dayData.dateStr, count: dayData.count })
                            }
                            onMouseLeave={() => setHoveredDay(null)}
                            className={`w-3 h-3 rounded-[2.5px] border cursor-pointer transition-all ${getCellColorClass(
                              dayData.count
                            )} ${isHovered ? "ring-2 ring-amber-500 scale-125 z-10" : ""}`}
                            title={`${dayData.dateStr}: ${dayData.count} reviews`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Heatmap Legend */}
          <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1 border-t border-black/5 dark:border-white/5">
            <span>Queried deterministically from local index.db</span>
            <div className="flex items-center gap-1.5">
              <span>Less</span>
              <div className="w-2.5 h-2.5 rounded-[2px] bg-black/[0.04] dark:bg-white/[0.05] border border-black/5" />
              <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-300 dark:bg-emerald-900/60" />
              <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-400 dark:bg-emerald-700" />
              <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-500 dark:bg-emerald-500" />
              <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-700 dark:bg-emerald-400" />
              <span>More</span>
            </div>
          </div>
        </div>

        {/* Section 3: Reading Velocity & Completed Chapters */}
        <div className="p-5 rounded-3xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-600 dark:text-nord-accent" />
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                Reading Velocity & Progress
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-neutral-500">
                Total Words: <strong className="text-neutral-800 dark:text-neutral-200">{velocityStats?.total_words_read.toLocaleString() ?? 0}</strong>
              </span>
              <span className="text-neutral-500">
                Time: <strong className="text-neutral-800 dark:text-neutral-200">{formattedReadingTime}</strong>
              </span>
            </div>
          </div>

          {/* Velocity Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-black/20 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-neutral-400">Average Velocity</span>
                <div className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-100 flex items-baseline gap-1">
                  {velocityStats?.average_wpm ? Math.round(velocityStats.average_wpm) : 250}
                  <span className="text-xs font-normal text-neutral-400">WPM</span>
                </div>
              </div>
              <TrendingUp className="w-5 h-5 text-emerald-500" />
            </div>

            <div className="p-3.5 rounded-xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-black/20 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-neutral-400">Completed Chapters</span>
                <div className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
                  {velocityStats?.completed_chapters ?? 0} / {bookMeta?.total_chapters ?? 1}
                </div>
              </div>
              <CheckCircle className="w-5 h-5 text-amber-600 dark:text-nord-accent" />
            </div>

            <div className="p-3.5 rounded-xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-black/20 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-neutral-400">Reading Time</span>
                <div className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
                  {formattedReadingTime}
                </div>
              </div>
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
          </div>

          {/* Chapter-by-Chapter Velocity Breakdown Table */}
          {velocityStats && velocityStats.chapter_stats.length > 0 && (
            <div className="rounded-xl border border-black/10 dark:border-white/10 overflow-hidden bg-white/40 dark:bg-black/20">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] text-neutral-500 text-[11px]">
                    <th className="py-2.5 px-3.5 font-semibold">Chapter</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Words</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Time Spent</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Velocity</th>
                    <th className="py-2.5 px-3.5 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5 font-mono text-[11px]">
                  {velocityStats.chapter_stats.map((stat) => {
                    const mins = Math.floor(stat.seconds_spent / 60);
                    const secs = stat.seconds_spent % 60;
                    return (
                      <tr key={stat.chapter_file} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                        <td className="py-2 px-3.5 font-sans font-medium text-neutral-800 dark:text-neutral-200 truncate max-w-[200px]">
                          {stat.chapter_title || stat.chapter_file}
                        </td>
                        <td className="py-2 px-3 text-right text-neutral-600 dark:text-neutral-400">
                          {stat.words_read.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right text-neutral-600 dark:text-neutral-400">
                          {mins}m {secs}s
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                          {stat.wpm > 0 ? `${Math.round(stat.wpm)} WPM` : "-"}
                        </td>
                        <td className="py-2 px-3.5 text-right font-sans">
                          {stat.completed ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold">
                              <CheckCircle className="w-2.5 h-2.5" />
                              Completed
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-neutral-500">
                              Reading
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
