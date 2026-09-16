import React, { useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import { heatmapWeeks, reviewsInLastDays, startOfLocalDay } from "../../lib/reviewDays";

interface HeatmapGridProps {
  /** The number of reviews on each "YYYY-MM-DD" day, in the time zone of this window (`reviewsPerDay`). */
  reviewsPerDay: Map<string, number>;
}

export const HeatmapGrid: React.FC<HeatmapGridProps> = ({ reviewsPerDay }) => {
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number } | null>(null);

  // 52 week columns with rows from Monday to Sunday; the last column ends today (AN-02)
  const calendarGrid = useMemo(() => heatmapWeeks(reviewsPerDay, new Date()), [reviewsPerDay]);

  const totalReviewsYear = useMemo(() => reviewsInLastDays(reviewsPerDay, new Date()), [reviewsPerDay]);

  const getCellColorClass = (count: number) => {
    if (count === 0) return "bg-black/[0.04] dark:bg-white/[0.05] border-black/5 dark:border-white/5";
    if (count <= 3) return "bg-emerald-300 dark:bg-emerald-900/60 border-emerald-400 dark:border-emerald-800";
    if (count <= 7) return "bg-emerald-400 dark:bg-emerald-700 border-emerald-500 dark:border-emerald-600";
    if (count <= 14) return "bg-emerald-500 dark:bg-emerald-500 border-emerald-600 dark:border-emerald-400";
    return "bg-emerald-700 dark:bg-emerald-400 border-emerald-800 dark:border-emerald-300";
  };

  return (
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

        <div className="text-xs font-mono text-neutral-600 dark:text-neutral-300 h-5">
          {hoveredDay ? (
            <span>
              <strong>{hoveredDay.count}</strong> {hoveredDay.count === 1 ? "review" : "reviews"} on{" "}
              {startOfLocalDay(hoveredDay.date).toLocaleDateString(undefined, {
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

      <div className="overflow-x-auto pb-2">
        <div className="inline-flex flex-col gap-1 min-w-[720px]">
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
                      return <div key={weekIndex} className="w-3 h-3 rounded-sm bg-transparent" />;
                    }
                    const isHovered = hoveredDay?.date === dayData.day;
                    return (
                      <div
                        key={weekIndex}
                        onMouseEnter={() => setHoveredDay({ date: dayData.day, count: dayData.count })}
                        onMouseLeave={() => setHoveredDay(null)}
                        className={`w-3 h-3 rounded-[2.5px] border cursor-pointer transition-all ${getCellColorClass(
                          dayData.count
                        )} ${isHovered ? "ring-2 ring-amber-500 scale-125 z-10" : ""}`}
                        title={`${dayData.day}: ${dayData.count} reviews`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
  );
};
