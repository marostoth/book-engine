import React from "react";
import { useLibrary } from "../../hooks/useLibrary";
import { bookTimeText, gradeText, sentenceText } from "../../lib/readabilityText";

/**
 * How hard the open book's sentences are and how long it takes to read, at the elementary level (TL-20).
 *
 * The import measures these for every book, and the audit fails a book that lacks them, but no screen showed them.
 * Elementary reading is the level of the sentence, so this is where they belong. A book with no measures shows a dash
 * for each (RD-15). Nothing shows before a book is open.
 */
export const BookReadability: React.FC = () => {
  const { bookMeta } = useLibrary();
  if (!bookMeta) return null;
  const metrics = bookMeta.elementary_metrics;

  const rows: { label: string; value: string; hint: string }[] = [
    {
      label: "Reading grade",
      value: gradeText(metrics),
      hint: "Flesch-Kincaid grade: the school year whose reader finds these sentences easy",
    },
    { label: "Per sentence", value: sentenceText(metrics), hint: "The average length of a sentence in this book" },
    { label: "Time to read", value: bookTimeText(metrics), hint: "The whole book at 200 words a minute" },
  ];

  return (
    <dl
      aria-label="How this book reads"
      className="mx-3 mt-2 grid grid-cols-3 gap-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)]/60 px-2 py-1.5 text-center"
    >
      {rows.map((row) => (
        <div key={row.label} title={row.hint} className="flex min-w-0 flex-col-reverse">
          <dt className="truncate text-[10px] text-[var(--theme-muted)]">{row.label}</dt>
          <dd className="font-mono text-xs font-semibold text-[var(--theme-text)] tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
};
