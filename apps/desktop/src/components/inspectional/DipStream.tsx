import React, { useEffect, useRef, useState } from "react";
import { BookMeta, ChapterMeta } from "../../lib/types";
import { fetchChapter } from "../../lib/api";
import { BookOpen, ArrowRight, Compass, Scissors, CornerDownRight } from "lucide-react";

interface DipStreamProps {
  bookMeta: BookMeta | null;
  onReadFullChapter: (chapter: ChapterMeta, targetAnchor?: string) => void;
  singleKeyPagingEnabled?: boolean;
}

export const DipStream: React.FC<DipStreamProps> = ({
  bookMeta,
  onReadFullChapter,
  singleKeyPagingEnabled = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hydratedExcerpts, setHydratedExcerpts] = useState<
    Record<string, { head?: string; tail?: string; firstAnchor?: string }>
  >({});

  // Dynamic anchor hydration for chapters lacking pre-extracted inspectional head/tail previews
  useEffect(() => {
    if (!bookMeta) return;

    const chaptersToHydrate = bookMeta.spine.filter((ch) => {
      const s = ch.inspectional_sampling;
      const hasHead = Boolean(s?.head_text_preview || (ch as any).opening_summary || (ch as any).head_sample);
      const hasTail = Boolean(s?.tail_text_preview || (ch as any).closing_summary || (ch as any).tail_sample);
      return (!hasHead || !hasTail) && !hydratedExcerpts[ch.id];
    });

    if (chaptersToHydrate.length === 0) return;

    let cancelled = false;

    chaptersToHydrate.forEach(async (ch) => {
      try {
        const text = await fetchChapter(bookMeta.book_id, ch.file_path);
        if (cancelled) return;

        const blocks = text.split(/\n\s*\n/);
        const paragraphs: { text: string; anchor: string }[] = [];

        for (const b of blocks) {
          const trimmed = b.trim();
          if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("![")) continue;
          const match = trimmed.match(/^(.*?)(?:\s*(\^p-\d+))$/s);
          if (match) {
            paragraphs.push({ text: match[1].trim(), anchor: match[2] });
          } else if (!trimmed.startsWith("[^")) {
            paragraphs.push({ text: trimmed, anchor: "^p-001" });
          }
        }

        const head = paragraphs.length > 0 ? paragraphs[0].text : undefined;
        const tail = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1].text : head;
        const firstAnchor = paragraphs.length > 0 ? paragraphs[0].anchor : "^p-001";

        setHydratedExcerpts((prev) => ({
          ...prev,
          [ch.id]: { head, tail, firstAnchor },
        }));
      } catch (e) {
        console.warn(`Failed to hydrate dip sample for chapter ${ch.id}:`, e);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bookMeta]);

  // Single-key paging handler with strict keyboard hygiene
  useEffect(() => {
    if (!singleKeyPagingEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when focused on any input, textarea, or contentEditable element
      const activeEl = document.activeElement;
      const tagName = activeEl?.tagName.toLowerCase();
      if (
        tagName === "input" ||
        tagName === "textarea" ||
        (activeEl as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const container = containerRef.current;
      if (!container) return;

      const pageAmount = 380;

      if (e.key === " " && !e.shiftKey) {
        e.preventDefault();
        container.scrollBy({ top: pageAmount, behavior: "smooth" });
      } else if (e.key === " " && e.shiftKey) {
        e.preventDefault();
        container.scrollBy({ top: -pageAmount, behavior: "smooth" });
      } else if (e.key.toLowerCase() === "j") {
        e.preventDefault();
        container.scrollBy({ top: 220, behavior: "smooth" });
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        container.scrollBy({ top: -220, behavior: "smooth" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [singleKeyPagingEnabled]);

  if (!bookMeta) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--theme-muted)] text-sm">
        Select a book to begin sampling chapter dips.
      </div>
    );
  }

  const chapters = bookMeta.spine;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="flex-1 h-full overflow-y-auto p-6 md:p-8 space-y-8 max-w-4xl mx-auto focus:outline-none select-text"
      aria-label="Inspectional Dip Stream"
    >
      {/* Stream Intro Card */}
      <div className="p-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)]/70 backdrop-blur-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-[var(--theme-muted)]">
          <Compass className="w-4 h-4 text-[var(--theme-accent)] flex-shrink-0" />
          <span>
            <strong>Chapter Dip Sampler</strong>: Reading opening propositions and trailing conclusions.
          </span>
        </div>
        {singleKeyPagingEnabled && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--theme-muted)] flex-shrink-0">
            <span>Scroll:</span>
            <kbd className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 border border-[var(--theme-border)]">
              Space
            </kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 border border-[var(--theme-border)]">
              J
            </kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 border border-[var(--theme-border)]">
              K
            </kbd>
          </div>
        )}
      </div>

      {/* Chapters Sampling Cards */}
      <div className="space-y-8">
        {chapters.map((chapter, idx) => {
          const sampling = chapter.inspectional_sampling;
          const hydrated = hydratedExcerpts[chapter.id];
          const headPreview =
            sampling?.head_text_preview ||
            (chapter as any).opening_summary ||
            (chapter as any).head_sample ||
            hydrated?.head ||
            "Opening summary unavailable for this chapter.";
          const tailPreview =
            sampling?.tail_text_preview ||
            (chapter as any).closing_summary ||
            (chapter as any).tail_sample ||
            hydrated?.tail ||
            "Closing conclusion unavailable for this chapter.";
          const targetAnchor = chapter.first_anchor || hydrated?.firstAnchor || "^p-001";
          const dipMinutes = Math.max(1, Math.min(3, Math.ceil(chapter.word_count / 10000) + 1));
          const wordDisplay =
            chapter.word_count >= 1000
              ? `${Math.round(chapter.word_count / 1000)}k words`
              : `${chapter.word_count} words`;

          return (
            <section
              key={chapter.id}
              className="p-6 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)]/85 shadow-sm space-y-4 transition-all hover:border-[var(--theme-accent)]/40"
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--theme-border)]/60">
                <div>
                  <div className="text-[11px] font-mono font-medium text-[var(--theme-muted)]">
                    Chapter {idx + 1} of {chapters.length}
                  </div>
                  <h2 className="text-base font-serif font-bold text-[var(--theme-text)] mt-0.5">
                    {chapter.title}
                  </h2>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-[var(--theme-muted)]">
                    ~{dipMinutes}m dip • {wordDisplay}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onReadFullChapter(chapter, targetAnchor)
                    }
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--theme-accent)] text-white text-xs font-semibold shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                    title="Switch to Level I Elementary mode and jump to first chapter anchor"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Read Chapter §</span>
                    <ArrowRight className="w-3 h-3 ml-0.5" />
                  </button>
                </div>
              </div>

              {/* Opening Head Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--theme-muted)]">
                  <CornerDownRight className="w-3 h-3 text-[var(--theme-accent)]" />
                  <span>Opening Propositions (Head)</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[var(--theme-bg)]/80 border border-[var(--theme-border)]/50 text-xs leading-relaxed text-[var(--theme-text)]/90 italic font-serif">
                  "{headPreview}"
                </div>
              </div>

              {/* Structural Dip Divider */}
              <div className="flex items-center justify-center gap-2 py-1 text-[var(--theme-muted)] text-[11px]">
                <div className="flex-1 h-[1px] bg-[var(--theme-border)]/50 border-dashed" />
                <span className="flex items-center gap-1 font-mono text-[10px] uppercase opacity-70">
                  <Scissors className="w-3 h-3" />
                  <span>Chapter Body Omitted (~{Math.max(0, chapter.word_count - 120)} words)</span>
                </span>
                <div className="flex-1 h-[1px] bg-[var(--theme-border)]/50 border-dashed" />
              </div>

              {/* Trailing Tail Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--theme-muted)]">
                  <CornerDownRight className="w-3 h-3 text-amber-600 dark:text-nord-accent" />
                  <span>Closing Conclusion (Tail)</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[var(--theme-bg)]/80 border border-[var(--theme-border)]/50 text-xs leading-relaxed text-[var(--theme-text)]/90 italic font-serif">
                  "{tailPreview}"
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
