import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { parseChapterMarkdown } from "../lib/markdown";
import { applyBionicReading } from "../lib/bionic";
import { applyHighlightsToHtml } from "../lib/highlights";
import { toAnchorAttribute } from "../lib/anchors";
import { createPlaceWatcher, paragraphAtMiddle, type ChapterRef } from "../lib/readingPlace";
import { FootnoteItem, HighlightItem, ReaderPreferences } from "../lib/types";
import { FootnotePopover } from "./FootnotePopover";
import { SelectionMenu } from "./SelectionMenu";
import { AnchorParagraph, FootnoteRef } from "./reader/TipTapExtensions";
import { ElementaryCanvas } from "./elementary/ElementaryCanvas";
import { LexiconPopover } from "./elementary/LexiconPopover";
import { useReaderSelection } from "./reader/useReaderSelection";
import { ArgumentGutterBadge } from "./analytical/ArgumentGutterBadge";
import { AnalyticalStore } from "../lib/types/analytical";
import { FigureLightboxModal } from "./FigureLightboxModal";

/** The place is saved this long after the reader stops scrolling, so a long scroll makes one save. */
const PLACE_SETTLE_MS = 1000;

/** The paragraph in the middle of the reader, in the saved form, read from the paragraphs on screen. */
function middleParagraph(container: HTMLElement | null): string | undefined {
  if (!container) return undefined;
  const view = container.getBoundingClientRect();
  const paragraphs = Array.from(container.querySelectorAll<HTMLElement>("[data-anchor]"), (element) => ({
    anchor: element.getAttribute("data-anchor"),
    top: element.getBoundingClientRect().top,
  }));
  return paragraphAtMiddle(paragraphs, view.top + view.height / 2);
}

interface ReaderProps {
  bookId: string;
  vaultPath?: string;
  markdown: string;
  /** The book and chapter whose words `markdown` holds. */
  markdownSource?: ChapterRef | null;
  /** Called once the reader stops scrolling, with the chapter on screen and the paragraph in the middle of it (DS-11). */
  onPlaceSettled?: (place: ChapterRef, anchor: string | undefined) => void;
  isBionic: boolean;
  highlights: HighlightItem[];
  targetAnchor?: string;
  /** Called on every scroll with how far down the reader is, in percent, and the chapter whose words are on screen. */
  onProgressChange: (progressPercent: number, chapter: ChapterRef | null) => void;
  onAddHighlight: (highlight: HighlightItem) => void;
  onAddNoteFromSelection: (quote: string, anchorId?: string) => void;
  onAddTerm?: (quote: string, anchorId?: string) => void;
  onAddArgument?: (quote: string, anchorId?: string) => void;
  onAddCritique?: (quote: string, anchorId?: string) => void;
  onAddInquiry?: (quote: string, anchorId?: string) => void;
  onAddSyntopic?: (quote: string, anchorId?: string) => void;
  analyticalStore?: AnalyticalStore;
  currentChapterFile?: string;
  preferences?: ReaderPreferences;
  onPreferencesChange?: (prefs: ReaderPreferences) => void;
  activeLevel?: string;
  onOpenInSplit?: () => void;
  isPacingRunning?: boolean;
  onTogglePacer?: () => void;
}

export const Reader: React.FC<ReaderProps> = ({
  bookId, vaultPath, markdown, markdownSource, onPlaceSettled, isBionic, highlights, targetAnchor,
  onProgressChange, onAddHighlight, onAddNoteFromSelection,
  onAddTerm, onAddArgument, onAddCritique, onAddInquiry, onAddSyntopic,
  analyticalStore, currentChapterFile, preferences, onPreferencesChange,
  activeLevel = "elementary", onOpenInSplit, isPacingRunning, onTogglePacer,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Where the reader stopped is reported a moment after the scrolling stops, for the chapter whose words are on
  // screen, so the book opens there next time (DS-11).
  const onPlaceSettledRef = useRef(onPlaceSettled);
  useEffect(() => {
    onPlaceSettledRef.current = onPlaceSettled;
  }, [onPlaceSettled]);
  const [placeWatcher] = useState(() =>
    createPlaceWatcher(
      PLACE_SETTLE_MS,
      () => middleParagraph(containerRef.current),
      (place, anchor) => onPlaceSettledRef.current?.(place, anchor)
    )
  );
  // A layout effect, because its clean-up runs while the paragraphs are still on screen: leaving the reader for
  // the inspectional level saves the place that was still waiting.
  useLayoutEffect(() => () => placeWatcher.flush(), [placeWatcher]);

  const [footnotes, setFootnotes] = useState<Record<string, FootnoteItem>>({});
  const [activeFootnote, setActiveFootnote] = useState<FootnoteItem | null>(null);
  const [footnotePos, setFootnotePos] = useState<{ x: number; y: number } | null>(null);
  const [activeLightboxImage, setActiveLightboxImage] = useState<{ src: string; alt: string } | null>(null);

  // Selection, highlight, and lexicon popover coordination hook
  const {
    selectionPos,
    selectedText,
    isSingleWord,
    lexiconWord,
    lexiconPos,
    lexiconAnchor,
    setLexiconWord,
    handleMouseUp,
    handleHighlight,
    handleAddNote,
    handleCopyLink,
    handleAddTerm,
    handleAddArgument,
    handleAddCritique,
    handleAddInquiry,
    handleAddSyntopic,
    handleDefine,
    handleDoubleClick,
  } = useReaderSelection({
    containerRef,
    onAddHighlight,
    onAddNoteFromSelection,
    onAddTerm,
    onAddArgument,
    onAddCritique,
    onAddInquiry,
    onAddSyntopic,
    instantDictionaryEnabled: preferences?.elementary?.instantDictionaryEnabled,
  });

  // Single-Chapter Virtualization: Mounts TipTap for only the current chapter
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        paragraph: false,
      }),
      AnchorParagraph,
      FootnoteRef,
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: "reader-image mx-auto my-6 rounded-lg shadow-md max-w-full border border-stone-200 dark:border-stone-800",
        },
      }),
      Highlight.configure({
        multicolor: true,
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "reader-prose prose max-w-none focus:outline-none font-serif text-lg leading-relaxed antialiased",
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement;
        const callout = target.closest(".footnote-callout");
        if (callout) {
          event.preventDefault();
          const fnId = callout.getAttribute("data-fn");
          if (fnId && footnotes[fnId]) {
            const rect = callout.getBoundingClientRect();
            setFootnotePos({
              x: rect.left + rect.width / 2,
              y: rect.top,
            });
            setActiveFootnote(footnotes[fnId]);
          }
          return true;
        }

        const img = target.closest("img") as HTMLImageElement | null;
        if (img && img.src) {
          event.preventDefault();
          setActiveLightboxImage({
            src: img.src,
            alt: img.alt || "Figure Diagram",
          });
          return true;
        }
        return false;
      },
    },
    editable: false,
  });

  // A chapter opens at its top. The reader used to keep the scroll position of the chapter before, so a chapter opened
  // part of the way down and could get the "Completed" mark of the chapter you left (AN-01). A jump to a paragraph, like
  // the place where you stopped, runs after this.
  const chapterAtTop = useRef<ChapterRef | null | undefined>(undefined);

  // Parse markdown, extract footnotes, resolve asset URLs, and inject into TipTap
  useEffect(() => {
    if (!editor || !markdown) return;

    const parsed = parseChapterMarkdown(markdown, bookId, vaultPath);
    setFootnotes(parsed.footnotes);

    let html = parsed.html;
    if (isBionic) {
      html = applyBionicReading(html);
    }
    if (highlights && highlights.length > 0) {
      html = applyHighlightsToHtml(html, highlights);
    }

    editor.commands.setContent(html);
    placeWatcher.shown(markdownSource ?? null);
    if (chapterAtTop.current !== markdownSource) {
      chapterAtTop.current = markdownSource;
      containerRef.current?.scrollTo({ top: 0, behavior: "instant" });
    }
    if (containerRef.current) {
      setTimeout(handleScroll, 50);
    }
  }, [editor, markdown, markdownSource, isBionic, highlights, bookId, vaultPath, placeWatcher]);

  // Jump to target paragraph anchor when requested. A chapter that has just opened lands on the paragraph at once,
  // for example where the reader stopped (DS-11): a smooth scroll does not move a window that is not on screen, and
  // the place saved next would then be the top of the chapter. A jump inside the open chapter still scrolls there.
  const chapterSeen = useRef<ChapterRef | null | undefined>(undefined);
  useEffect(() => {
    const cleanAnchor = toAnchorAttribute(targetAnchor);
    if (!cleanAnchor || !markdown || !containerRef.current) {
      chapterSeen.current = markdownSource;
      return;
    }
    // Read here, and written only when the jump runs, so an effect that React runs twice still sees a new chapter.
    const justOpened = chapterSeen.current !== markdownSource;

    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      chapterSeen.current = markdownSource;
      const el = containerRef.current.querySelector(`[data-anchor="${cleanAnchor}"]`);
      if (el) {
        el.scrollIntoView({ behavior: justOpened ? "instant" : "smooth", block: "center" });
        placeWatcher.moved();
        el.classList.add("bg-amber-100/50", "dark:bg-amber-900/30", "transition-colors", "duration-500");
        setTimeout(() => {
          el.classList.remove("bg-amber-100/50", "dark:bg-amber-900/30");
        }, 2000);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [targetAnchor, markdown, markdownSource, placeWatcher]);

  // Handle scroll progress tracking
  const handleScroll = () => {
    if (!containerRef.current) return;
    placeWatcher.moved();
    const chapter = markdownSource ?? null;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const total = scrollHeight - clientHeight;
    if (total <= 0) {
      onProgressChange(100, chapter);
    } else {
      const pct = Math.min(100, Math.max(0, Math.round((scrollTop / total) * 100)));
      onProgressChange(pct, chapter);
    }
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      className="relative flex-1 h-full overflow-y-auto overflow-x-hidden bg-[var(--theme-bg)] scroll-smooth px-8 py-12 md:px-16 lg:px-24"
    >
      <div className="w-full min-h-full pb-32">
        {preferences ? (
          <ElementaryCanvas
            containerRef={containerRef}
            preferences={preferences}
            onPreferencesChange={onPreferencesChange}
            activeLevel={activeLevel}
            isPacingRunning={isPacingRunning}
            onTogglePacer={onTogglePacer}
          >
            <EditorContent editor={editor} />
          </ElementaryCanvas>
        ) : (
          <div className="max-w-3xl mx-auto">
            <EditorContent editor={editor} />
          </div>
        )}
      </div>

      {/* Popover citation footnote resolver */}
      {activeFootnote && footnotePos && (
        <FootnotePopover
          footnote={activeFootnote}
          position={footnotePos}
          onClose={() => setActiveFootnote(null)}
        />
      )}

      {/* Floating selection toolbar with de-conflicted Define, Term, and Arg buttons */}
      {selectionPos && selectedText && !lexiconWord && (
        <SelectionMenu
          position={selectionPos} isSingleWord={isSingleWord} activeLevel={activeLevel}
          onHighlight={handleHighlight} onAddNote={handleAddNote} onCopyLink={handleCopyLink}
          onDefine={handleDefine} onAddTerm={handleAddTerm} onAddArgument={handleAddArgument}
          onAddCritique={handleAddCritique} onAddInquiry={handleAddInquiry} onAddSyntopic={handleAddSyntopic}
        />
      )}

      {/* Offline Lexicon Definition Popover */}
      {lexiconWord && lexiconPos && (
        <LexiconPopover
          word={lexiconWord} anchor={lexiconAnchor} bookId={bookId}
          position={lexiconPos} onClose={() => setLexiconWord(null)}
        />
      )}

      {/* Right Gutter Markers for Analytical Reading */}
      {analyticalStore && currentChapterFile && (
        <ArgumentGutterBadge
          containerRef={containerRef} currentChapterFile={currentChapterFile}
          store={analyticalStore} activeLevel={activeLevel}
          onBadgeClick={(anchor) => {
            const clean = toAnchorAttribute(anchor);
            const el = clean ? containerRef.current?.querySelector(`[data-anchor="${clean}"]`) : null;
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.add("bg-amber-100/40", "dark:bg-amber-900/30", "transition-colors", "duration-500");
              setTimeout(() => {
                el.classList.remove("bg-amber-100/40", "dark:bg-amber-900/30");
              }, 1500);
            }
          }}
        />
      )}
      {/* Figure Diagram Full-Resolution Lightbox */}
      {activeLightboxImage && (
        <FigureLightboxModal
          isOpen={true}
          imageSrc={activeLightboxImage.src}
          imageAlt={activeLightboxImage.alt}
          onClose={() => setActiveLightboxImage(null)}
          onOpenInSplit={onOpenInSplit}
        />
      )}
    </div>
  );
};
