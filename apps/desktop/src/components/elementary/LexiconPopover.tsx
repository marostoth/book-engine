import React, { useEffect, useState } from "react";
import { Bookmark, Check, X, Sparkles } from "lucide-react";
import { DictionaryEntry, VocabularyEntry } from "../../lib/types";
import { lookupDictionaryTerm, saveBookVocabulary } from "../../lib/api";
import { savedWord } from "../../lib/citations";
import { reportBackendError } from "../../lib/backendErrors";
import { vocabularyWasSaved } from "../../lib/vocabularySaves";

interface LexiconPopoverProps {
  word: string;
  /** The anchor of the block that holds the word, or none when the chapter holds no anchor (RD-04). */
  anchor?: string;
  bookId: string;
  /** The chapter that holds the word. A saved word keeps it, so the word can be found again (RD-04). */
  chapterFile?: string;
  position: { x: number; y: number } | null;
  onClose: () => void;
}

export const LexiconPopover: React.FC<LexiconPopoverProps> = ({
  word,
  anchor,
  bookId,
  chapterFile,
  position,
  onClose,
}) => {
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // The reader gives this a `key` of the word, so a new word is a new popover: it starts out looking the word up
  // and not yet saved. An effect used to set both after the last word's answer was already on screen (TL-11).
  useEffect(() => {
    if (!word) return;

    let mounted = true;
    lookupDictionaryTerm(word)
      .then((res) => {
        if (mounted) {
          setEntry(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        reportBackendError(`Could not look up "${word.trim()}".`, err);
        if (mounted) {
          setEntry(null);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [word]);

  if (!position || !word) return null;

  // The word waits for the dictionary's answer. A save while the lookup ran stored "Vocabulary term: <word>" in place
  // of the meaning that arrived a moment later, and the button then said "Saved to Vocab" over it (RD-17). A lookup
  // that found nothing, or failed, still lets the word be saved, as the popover says.
  const canSave = !loading && !isSaved && !saving;

  const handleSaveToVocab = async () => {
    if (!canSave) return;
    setSaving(true);

    // The chapter and the anchor say where the word was read. The app writes neither of its own: it used to save
    // `^p-001` for a word with no anchor, which named the first block of the chapter (RD-04).
    const vocabEntry: VocabularyEntry = savedWord(word, entry, chapterFile, anchor, new Date().toISOString());

    try {
      await saveBookVocabulary(bookId, vocabEntry);
      setIsSaved(true);
      // The notes drawer reloads its words if it is open. This used to be an `onSavedVocabulary` prop that
      // nothing ever passed, so a saved word reached no screen at all (RD-10, `lib/vocabularySaves.ts`).
      vocabularyWasSaved(bookId);
    } catch (e) {
      reportBackendError(`"${vocabEntry.word}" was not saved to your vocabulary.`, e);
    } finally {
      setSaving(false);
    }
  };

  // Clamp within viewport
  const leftPos = Math.max(160, Math.min(window.innerWidth - 160, position.x));
  const topPos = Math.max(12, position.y - 12);

  return (
    <div
      className="fixed z-50 transform -translate-x-1/2 -translate-y-full pointer-events-auto transition-all duration-150 animate-in fade-in zoom-in-95"
      style={{ left: `${leftPos}px`, top: `${topPos}px` }}
    >
      <div className="w-80 max-w-[90vw] rounded-xl shadow-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)]/98 backdrop-blur-md p-4 text-[var(--theme-text)] font-sans text-xs">
        {/* Header: Icon, Word, Close */}
        <div className="flex items-start justify-between gap-2 border-b border-[var(--theme-border)] pb-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold font-serif text-base tracking-tight text-[var(--theme-text)] capitalize">
                {entry?.word || word.trim()}
              </span>
              {entry?.partOfSpeech && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  {entry.partOfSpeech}
                </span>
              )}
            </div>
            {entry?.pronunciation && (
              <p className="text-[11px] font-mono text-[var(--theme-muted)] mt-0.5">
                {entry.pronunciation}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body: Definition & Etymology */}
        <div className="py-3 space-y-2.5">
          {loading ? (
            <div className="flex items-center gap-2 text-[var(--theme-muted)] py-2">
              <div className="w-3 h-3 border-2 border-[var(--theme-accent)] border-t-transparent rounded-full animate-spin" />
              <span>Looking up lexicon...</span>
            </div>
          ) : entry ? (
            <>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)] block mb-0.5">
                  Definition
                </span>
                <p className="text-xs leading-relaxed text-[var(--theme-text)]">
                  {entry.definition}
                </p>
              </div>

              {entry.etymology && (
                <div className="pt-2 border-t border-[var(--theme-border)]/60">
                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)] mb-0.5">
                    <Sparkles className="w-3 h-3 text-amber-500/70" />
                    <span>Etymology</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--theme-muted)] italic">
                    {entry.etymology}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="py-2 text-[var(--theme-muted)] text-[11px]">
              No exact definition found in the offline cache. You can still save this word to your vocabulary bank.
            </div>
          )}
        </div>

        {/* Footer: Save to Vocabulary Action */}
        <div className="pt-2.5 border-t border-[var(--theme-border)] flex items-center justify-between gap-2">
          {anchor && (
            <span className="text-[10px] font-mono text-[var(--theme-muted)] truncate max-w-[120px]">
              {anchor}
            </span>
          )}

          <button
            onClick={handleSaveToVocab}
            disabled={!canSave}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ml-auto transition-all ${
              isSaved
                ? "bg-emerald-600 text-white shadow-sm"
                : loading
                  ? "bg-[var(--theme-accent)] text-white shadow-sm opacity-50 cursor-wait"
                  : "bg-[var(--theme-accent)] text-white hover:opacity-90 shadow-sm cursor-pointer"
            }`}
            title="Keep this word. It joins your notes and highlights in this book."
          >
            {isSaved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Saved to Vocab</span>
              </>
            ) : (
              <>
                <Bookmark className="w-3.5 h-3.5" />
                <span>{saving ? "Saving..." : "Save to Vocab"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
