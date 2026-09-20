import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { parseChapterMarkdown } from "../lib/markdown";
import { resolveAssetUrl } from "../lib/api";
import { applyBionicReading } from "../lib/bionic";
import { bionicOn, useSettings } from "../hooks/useSettings";
import { toAnchorAttribute } from "../lib/anchors";
import { createPlaceWatcher, paragraphAtMiddle, type ChapterRef } from "../lib/readingPlace";
import { createProgressTicker } from "../lib/readerProgress";
import { FootnoteItem, HighlightItem } from "../lib/types";
import { FootnotePopover } from "./FootnotePopover";
import { SelectionMenu } from "./SelectionMenu";
import { readerEditorOptions, type ChapterClick } from "./reader/readerEditorOptions";
import { showHighlights } from "./reader/ReaderHighlights";
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
  highlights: HighlightItem[];
  targetAnchor?: string;
  /** Called on every scroll with how far down the reader is, in percent, and the chapter whose words are on screen. */
  onProgressChange: (progressPercent: number, chapter: ChapterRef | null) => void;
  onAddHighlight: (highlight: HighlightItem) => void;
  onAddNoteFromSelection: (quote: string, anchorId?: string) => void;
  // Each citation names the anchor of the block of the selection. The reader stages none without one (RD-04).
  onAddTerm?: (quote: string, anchor: string) => void;
  onAddArgument?: (quote: string, anchor: string) => void;
  onAddCritique?: (quote: string, anchor: string) => void;
  onAddInquiry?: (quote: string, anchor: string) => void;
  onAddSyntopic?: (quote: string, anchor: string) => void;
  analyticalStore?: AnalyticalStore;
  currentChapterFile?: string;
  activeLevel?: string;
  onOpenInSplit?: () => void;
  isPacingRunning?: boolean;
  onTogglePacer?: () => void;
}

const ReaderView: React.FC<ReaderProps> = ({
  bookId, vaultPath, markdown, markdownSource, onPlaceSettled, highlights, targetAnchor,
  onProgressChange, onAddHighlight, onAddNoteFromSelection,
  onAddTerm, onAddArgument, onAddCritique, onAddInquiry, onAddSyntopic,
  analyticalStore, currentChapterFile,
  activeLevel = "elementary", onOpenInSplit, isPacingRunning, onTogglePacer,
}) => {
  // The saved settings and Bionic Reading come from the two contexts `App.tsx` holds, not from props (RD-09).
  // The value of each context keeps its identity while the settings do not change, so a scroll still leaves the
  // chapter on screen alone (RD-06).
  const { settings: preferences } = useSettings();
  const isBionic = bionicOn(preferences);
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

  // The footnotes of the chapter on screen. A ref, not a state: only a click in the chapter reads them, so a new
  // chapter needs no render for them, and the click handler below stays the same one (RD-06).
  const footnotes = useRef<Record<string, FootnoteItem>>({});
  const [activeFootnote, setActiveFootnote] = useState<FootnoteItem | null>(null);
  const [footnotePos, setFootnotePos] = useState<{ x: number; y: number } | null>(null);
  const [activeLightboxImage, setActiveLightboxImage] = useState<{ src: string; alt: string } | null>(null);

  // A click on a footnote mark opens the note, and a click on a figure opens it big. The handler is made once, so
  // TipTap finds the options of the editor unchanged after a render (RD-06).
  const handleChapterClick = useCallback<ChapterClick>((_view, _pos, event) => {
    const target = event.target as HTMLElement;
    const callout = target.closest(".footnote-callout");
    if (callout) {
      event.preventDefault();
      const fnId = callout.getAttribute("data-fn");
      const note = fnId ? footnotes.current[fnId] : undefined;
      if (note) {
        const rect = callout.getBoundingClientRect();
        setFootnotePos({
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
        setActiveFootnote(note);
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
  }, []);

  // Single-Chapter Virtualization: Mounts TipTap for only the current chapter
  const editorOptions = useMemo(() => readerEditorOptions(handleChapterClick), [handleChapterClick]);
  const editor = useEditor(editorOptions);

  // Selection, highlight, and lexicon popover coordination hook
  const {
    selectionPos,
    closeSelectionMenu,
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
    editor,
    onAddHighlight,
    onAddNoteFromSelection,
    onAddTerm,
    onAddArgument,
    onAddCritique,
    onAddInquiry,
    onAddSyntopic,
    instantDictionaryEnabled: preferences.elementary?.instantDictionaryEnabled,
  });

  // A chapter opens at its top. The reader used to keep the scroll position of the chapter before, so a chapter opened
  // part of the way down and could get the "Completed" mark of the chapter you left (AN-01). A jump to a paragraph, like
  // the place where you stopped, runs after this.
  const chapterAtTop = useRef<ChapterRef | null | undefined>(undefined);

  // How far down the chapter the reader is. Every report renders the app, so each whole percent is reported once
  // and the many scroll events of one wheel turn do no more work than that (RD-06).
  const [progress] = useState(createProgressTicker);

  /**
   * Reports how far down the chapter the reader is, and that the reader moved.
   *
   * Made once for a chapter, because the reader keeps its place between renders (RD-06) and because the effect
   * below reports the place once a new chapter is shown. That effect used to reach DOWN the file for this handler,
   * which had not been made yet at the line that read it: it worked only because an effect runs after the whole
   * drawing. `react-hooks/immutability` says so, and `react-hooks/exhaustive-deps` said the effect never named it.
   *
   * Everything it reads is either made once (`placeWatcher`, `progress`) or already named by that effect
   * (`markdownSource`), except the app's own report handler, which the app makes once as well. So adding this to
   * that effect's list does not make a chapter be parsed and set again for a drawing. `nothingStaleIsShown.test.tsx`
   * fails if one of them ever stops being made once.
   */
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    placeWatcher.moved();
    const chapter = markdownSource ?? null;
    const percent = progress.changed(container, chapter);
    if (percent !== undefined) onProgressChange(percent, chapter);
  }, [placeWatcher, progress, markdownSource, onProgressChange]);

  // Parse the chapter Markdown into a document of reader nodes, with the footnotes and the addresses of its pictures,
  // and show it in TipTap. The reader gets no HTML from a chapter file (RD-03).
  useEffect(() => {
    if (!editor || !markdown) return;

    const parsed = parseChapterMarkdown(markdown, (src) => (bookId ? resolveAssetUrl(bookId, src, vaultPath) : src));
    footnotes.current = parsed.footnotes;

    editor.commands.setContent(isBionic ? applyBionicReading(parsed.doc) : parsed.doc);
    placeWatcher.shown(markdownSource ?? null);
    if (chapterAtTop.current !== markdownSource) {
      chapterAtTop.current = markdownSource;
      containerRef.current?.scrollTo({ top: 0, behavior: "instant" });
    }
    if (containerRef.current) {
      setTimeout(handleScroll, 50);
    }
  }, [editor, markdown, markdownSource, isBionic, bookId, vaultPath, placeWatcher, handleScroll]);

  // The saved highlights are drawn over the chapter, also with Bionic reading on. A new highlight shows without the
  // chapter being parsed and set again (RD-02).
  useEffect(() => {
    if (editor) showHighlights(editor, highlights);
  }, [editor, highlights]);

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

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      className="relative flex-1 h-full overflow-y-auto overflow-x-hidden bg-[var(--theme-bg)] scroll-smooth px-8 py-12 md:px-16 lg:px-24"
    >
      <div className="w-full min-h-full pb-32">
        <ElementaryCanvas
          containerRef={containerRef}
          activeLevel={activeLevel}
          isPacingRunning={isPacingRunning}
          onTogglePacer={onTogglePacer}
        >
          <EditorContent editor={editor} />
        </ElementaryCanvas>
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
          onDismiss={closeSelectionMenu}
          onHighlight={handleHighlight} onAddNote={handleAddNote} onCopyLink={handleCopyLink}
          onDefine={handleDefine} onAddTerm={handleAddTerm} onAddArgument={handleAddArgument}
          onAddCritique={handleAddCritique} onAddInquiry={handleAddInquiry} onAddSyntopic={handleAddSyntopic}
        />
      )}

      {/* Offline Lexicon Definition Popover */}
      {lexiconWord && lexiconPos && (
        <LexiconPopover
          key={lexiconWord}
          word={lexiconWord} anchor={lexiconAnchor} bookId={bookId} chapterFile={currentChapterFile}
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

/**
 * The chapter on screen. It is drawn again only for its own new props: a scroll moves the bar in the top navigation
 * and renders the app, and the chapter, its highlights and its ProseMirror state are then left alone (RD-06). Every
 * handler the app gives the reader must therefore be made once, with `useCallback`, and a test checks that.
 */
export const Reader = React.memo(ReaderView);
