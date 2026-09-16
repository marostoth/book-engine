import React from "react";
import { CheckCircle, Clock } from "lucide-react";
import { ReadingVelocityStats } from "../../lib/types";
import { bookName, chapterName, completedChaptersText, readingTimeText } from "../../lib/analyticsText";

interface VelocityTableProps {
  velocityStats: ReadingVelocityStats | null;
  /** "All Books": each row also names its book, because every book has a ch-01.md. */
  showBooks: boolean;
}

/**
 * Reading time and finished chapters. The app sees how long a chapter is on screen, but not how many words you read, so
 * this shows no word count and no reading speed (AN-01). The rows show the chapter titles, and the finished chapters
 * count against the chapters of the book or of every book in the vault (AN-03).
 */
export const VelocityTable: React.FC<VelocityTableProps> = ({
  velocityStats,
  showBooks,
}) => {
  return (
    <div className="p-5 rounded-3xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-600 dark:text-nord-accent" />
        <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
          Reading Time & Progress
        </span>
      </div>

      {/* Reading Time Highlights Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3.5 rounded-xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-black/20 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-neutral-400">Completed Chapters</span>
            <div className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
              {completedChaptersText(velocityStats)}
            </div>
          </div>
          <CheckCircle className="w-5 h-5 text-amber-600 dark:text-nord-accent" />
        </div>

        <div className="p-3.5 rounded-xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-black/20 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-neutral-400">Reading Time</span>
            <div className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
              {readingTimeText(velocityStats)}
            </div>
          </div>
          <Clock className="w-5 h-5 text-blue-500" />
        </div>
      </div>

      {/* Chapter-by-Chapter Reading Time Table */}
      {velocityStats && velocityStats.chapter_stats.length > 0 && (
        <div className="rounded-xl border border-black/10 dark:border-white/10 overflow-hidden bg-white/40 dark:bg-black/20">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] text-neutral-500 text-[11px]">
                <th className="py-2.5 px-3.5 font-semibold">Chapter</th>
                <th className="py-2.5 px-3 font-semibold text-right">Time Spent</th>
                <th className="py-2.5 px-3.5 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5 font-mono text-[11px]">
              {velocityStats.chapter_stats.map((stat) => {
                const mins = Math.floor(stat.seconds_spent / 60);
                const secs = stat.seconds_spent % 60;
                return (
                  <tr key={`${stat.book_id}/${stat.chapter_file}`} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                    <td
                      className="py-2 px-3.5 font-sans font-medium text-neutral-800 dark:text-neutral-200 truncate max-w-[360px]"
                      title={showBooks ? `${chapterName(stat)} (${bookName(stat)})` : chapterName(stat)}
                    >
                      {chapterName(stat)}
                      {showBooks && (
                        <span className="block text-[10px] font-normal text-neutral-400 truncate">{bookName(stat)}</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-neutral-600 dark:text-neutral-400">
                      {mins}m {secs}s
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
  );
};
