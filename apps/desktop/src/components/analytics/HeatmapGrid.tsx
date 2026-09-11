import React, { useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import { DayReviewActivity } from "../../lib/types";

interface HeatmapGridProps {
  heatmapData: DayReviewActivity[];
}

export const HeatmapGrid: React.FC<HeatmapGridProps> = ({ heatmapData }) => {
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number } | null>(null);

  // Transform heatmapData into a 52-week calendar grid (364 days, 7 rows: Mon-Sun)
  const calendarGrid = useMemo(() => {
    const activityMap = new Map<string, number>();
    for (const item of heatmapData) {
      activityMap.set(item.date, item.count);
    }

    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
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

  const totalReviewsYear = useMemo(() => {
    return heatmapData.reduce((acc, item) => acc + item.count, 0);
  }, [heatmapData]);

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
                    const isHovered = hoveredDay?.date === dayData.dateStr;
                    return (
                      <div
                        key={weekIndex}
                        onMouseEnter={() => setHoveredDay({ date: dayData.dateStr, count: dayData.count })}
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
