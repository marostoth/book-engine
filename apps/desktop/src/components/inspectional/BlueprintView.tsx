import React, { useEffect, useState } from "react";
import {
  BookMeta,
  ChapterMeta,
  ExitAssessmentPayload,
  IndexCluster,
  InspectionalBlueprint,
} from "../../lib/types";
import { getInspectionalBlueprint } from "../../lib/api";
import { reportBackendError } from "../../lib/backendErrors";
import {
  Compass,
  BookOpen,
  Star,
  Tag,
  ArrowRight,
  CheckCircle2,
  Clock,
  Sparkles,
  FileText,
} from "lucide-react";

interface BlueprintViewProps {
  bookMeta: BookMeta | null;
  /** The reader's exit assessment of this book (`useInspectionalSession`), or null when there is none. */
  exitAssessment: ExitAssessmentPayload | null;
  onSelectChapter: (chapter: ChapterMeta) => void;
  onSwitchToDips: () => void;
  onOpenExitModal: () => void;
}

export const BlueprintView: React.FC<BlueprintViewProps> = ({
  bookMeta,
  exitAssessment,
  onSelectChapter,
  onSwitchToDips,
  onOpenExitModal,
}) => {
  /** The blueprint fetched for one book, and which book it belongs to. A blueprint of another book is not this one. */
  const [fetched, setFetched] = useState<{ of: string; blueprint: InspectionalBlueprint | null } | null>(null);

  const bookId = bookMeta?.book_id;
  const ownBlueprint = bookMeta?.inspectional_blueprint;
  /**
   * A book that carries its own blueprint needs no fetch, and that was copied into state inside an effect: the
   * page was drawn once with no blueprint, then again with it (TL-11). It is read straight off the book now.
   */
  const blueprint = ownBlueprint ?? (fetched && fetched.of === bookId ? fetched.blueprint : null);

  useEffect(() => {
    if (!bookId || ownBlueprint) return;
    let isCurrent = true;
    getInspectionalBlueprint(bookId)
      .then((bp) => {
        if (isCurrent) setFetched({ of: bookId, blueprint: bp });
      })
      .catch((e) => reportBackendError("Could not load the blueprint of this book.", e));
    return () => {
      isCurrent = false;
    };
  }, [bookId, ownBlueprint]);

  if (!bookMeta) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--theme-muted)] text-sm">
        Select a book to inspect its blueprint.
      </div>
    );
  }

  const frontMatter = blueprint?.front_matter as Record<string, unknown> | undefined;
  const blurb =
    (typeof frontMatter?.publisher_blurb === "string" ? frontMatter.publisher_blurb : "") ||
    `A structured structural blueprint for systematic skimming and superficial reading of ${bookMeta.title}.`;
  const pivotalChapterIds = new Set(blueprint?.pivotal_chapters || []);
  // The groups of the synthetic index have one name and one place. Four other names used to be read here as well,
  // under the belief that an older import had written them: `concept_clusters` and `clusters`, on the blueprint and
  // on the book. None of the four is written by the Rust backend, by the Python import, or held in the vault, so
  // nothing could ever arrive under them (RD-09).
  const clusters: IndexCluster[] = blueprint?.synthetic_index_clusters || [];

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 md:p-8 space-y-6 max-w-5xl mx-auto select-text">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--theme-border)]">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--theme-accent)]">
            <Compass className="w-4 h-4" />
            <span>Level II: Inspectional Reading Blueprint</span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-[var(--theme-text)] mt-1">
            {bookMeta.title}
          </h1>
          <p className="text-xs text-[var(--theme-muted)] mt-0.5">
            By {bookMeta.author} • {bookMeta.total_chapters} Chapters • {bookMeta.total_words.toLocaleString()} Words
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onSwitchToDips}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--theme-accent)] text-white text-xs font-semibold shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            <span>Dip Sampler</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onOpenExitModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] text-[var(--theme-text)] text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
            <span>{exitAssessment ? "Edit Exit Card" : "Write Exit Card"}</span>
          </button>
        </div>
      </div>

      {/* Exit Assessment Status (if already submitted) */}
      {exitAssessment && (
        <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-[var(--theme-text)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Inspectional Assessment Completed
              </span>
            </div>
            {exitAssessment.completedAt && (
              <span className="text-[11px] text-[var(--theme-muted)]">
                {new Date(exitAssessment.completedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          {exitAssessment.unityStatement && (
            <p className="text-xs italic mt-2 text-[var(--theme-text)]/90">
              "{exitAssessment.unityStatement}"
            </p>
          )}
        </div>
      )}

      {/* Grid: Dossier Card & Synthetic Index Clusters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Dossier Card (2 cols) */}
        <div className="md:col-span-2 p-5 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)]/80 backdrop-blur-sm space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--theme-muted)]">
            <BookOpen className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
            <span>Book Dossier & Front Matter</span>
          </div>
          <p className="text-sm leading-relaxed text-[var(--theme-text)]/90">
            {blurb}
          </p>
          {Boolean(frontMatter?.has_preface) && (
            <div className="pt-2 border-t border-[var(--theme-border)]/60 text-xs text-[var(--theme-muted)] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Preface detected in source document. Recommended reading for author intent.</span>
            </div>
          )}
        </div>

        {/* Synthetic Index Clusters (1 col) */}
        <div className="p-5 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)]/80 backdrop-blur-sm space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--theme-muted)]">
            <Tag className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
            <span>Key Concept Clusters</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {clusters.length > 0 ? (
              clusters.map((cluster: IndexCluster, idx: number) => {
                const term = cluster.term || cluster.name || `Topic ${idx + 1}`;
                return (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--theme-accent)]/10 text-[var(--theme-text)] border border-[var(--theme-accent)]/20"
                  >
                    <span>#{term}</span>
                  </span>
                );
              })
            ) : (
              <div className="py-1 space-y-1">
                <p className="text-xs text-[var(--theme-muted)] font-medium">
                  Thematic clusters have not been extracted for this volume.
                </p>
                <p className="text-[11px] text-[var(--theme-muted)]/70">
                  Extracted automatically from chapter headings during deep ingestion.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Analytical TOC & Skim Time Estimates */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--theme-muted)]">
            <Clock className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
            <span>Analytical Structure &amp; Skim Timings</span>
          </div>
          <span className="text-[11px] text-[var(--theme-muted)]">
            Inspectional Dip: ~300-word sample (~2–3 min)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {bookMeta.spine.map((chapter, idx) => {
            const isPivotal = pivotalChapterIds.has(chapter.id);
            const dipMinutes = Math.max(1, Math.min(3, Math.ceil(chapter.word_count / 10000) + 1));
            const wordDisplay =
              chapter.word_count >= 1000
                ? `${Math.round(chapter.word_count / 1000)}k words`
                : `${chapter.word_count} words`;
            const fullReadMinutes = Math.max(1, Math.ceil(chapter.word_count / 250));

            return (
              <button
                key={chapter.id}
                type="button"
                onClick={() => onSelectChapter(chapter)}
                className={`p-3.5 rounded-xl border text-left transition-all hover:scale-[1.01] cursor-pointer flex flex-col justify-between ${
                  isPivotal
                    ? "border-[var(--theme-accent)]/40 bg-[var(--theme-accent)]/5 hover:bg-[var(--theme-accent)]/10 shadow-sm"
                    : "border-[var(--theme-border)] bg-[var(--theme-surface)]/70 hover:bg-[var(--theme-surface)]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 text-[11px] text-[var(--theme-muted)] mb-1">
                    <span className="font-mono">Chapter {idx + 1}</span>
                    {isPivotal && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-800 dark:text-amber-300">
                        <Star className="w-2.5 h-2.5 fill-current" />
                        Pivotal
                      </span>
                    )}
                  </div>
                  <h2 className="text-xs font-semibold text-[var(--theme-text)] line-clamp-2">
                    {chapter.title}
                  </h2>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[var(--theme-muted)] mt-3 pt-2 border-t border-[var(--theme-border)]/50">
                  <span className="font-medium text-[var(--theme-text)]/90">
                    ~{dipMinutes}m dip • {wordDisplay}
                  </span>
                  <span className="text-[10px] text-[var(--theme-muted)]">
                    ~{fullReadMinutes}m full
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
