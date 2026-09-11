import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  CheckCircle2,
  AlertCircle,
  Eye,
  RotateCcw,
  Sparkles,
  Trophy,
  BookOpen,
} from "lucide-react";
import { PracticeCardItem, CardSchedule } from "../lib/types";
import { submitReview } from "../lib/api";

interface PracticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: PracticeCardItem[];
  onReviewSubmitted: (cardId: string, schedule: CardSchedule) => void;
  onJumpToAnchor?: (chapterFile: string, anchor: string) => void;
  bookTitle?: string;
}

export const PracticeModal: React.FC<PracticeModalProps> = ({
  isOpen,
  onClose,
  cards,
  onReviewSubmitted,
  onJumpToAnchor,
  bookTitle = "Book Engine",
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Scramble drill state
  const [scramblePool, setScramblePool] = useState<string[]>([]);
  const [assembledClauses, setAssembledClauses] = useState<string[]>([]);
  const [scrambleCorrect, setScrambleCorrect] = useState<boolean | null>(null);

  // Session stats
  const [sessionReviews, setSessionReviews] = useState<{ rating: number; cardId: string }[]>([]);

  const currentCard = cards[currentIndex];

  // Initialize or reset card state on index change
  useEffect(() => {
    setUserAnswer("");
    setRevealed(false);
    setScrambleCorrect(null);

    if (!currentCard) return;

    if (currentCard.item_type === "scramble") {
      // Split prompt by '|' or punctuation clauses
      let pieces = currentCard.prompt.split("|").map((p) => p.trim()).filter(Boolean);
      if (pieces.length < 2) {
        // Fallback: split by comma or semicolons
        pieces = currentCard.prompt.split(/[,;]\s*/).map((p) => p.trim()).filter(Boolean);
      }
      if (pieces.length < 2) {
        // Fallback: split words into chunks
        const words = currentCard.prompt.split(/\s+/);
        pieces = [];
        for (let i = 0; i < words.length; i += 3) {
          pieces.push(words.slice(i, i + 3).join(" "));
        }
      }

      // Shuffle pieces deterministically for the drill
      const shuffled = [...pieces].sort((a, b) => b.localeCompare(a));
      setScramblePool(shuffled);
      setAssembledClauses([]);
    }
  }, [currentIndex, currentCard]);

  // Handle rating submission
  const handleRate = useCallback(
    async (rating: number) => {
      if (!currentCard || submitting) return;
      setSubmitting(true);
      try {
        const schedule = await submitReview(currentCard.card_id, rating);
        onReviewSubmitted(currentCard.card_id, schedule);
        setSessionReviews((prev) => [...prev, { rating, cardId: currentCard.card_id }]);

        if (currentIndex + 1 < cards.length) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          setCompleted(true);
        }
      } catch (err) {
        console.error("Failed to submit review:", err);
      } finally {
        setSubmitting(false);
      }
    },
    [currentCard, submitting, currentIndex, cards.length, onReviewSubmitted]
  );

  // Keyboard navigation shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (revealed && !submitting && !completed) {
        if (e.key === "1") handleRate(1);
        else if (e.key === "2") handleRate(2);
        else if (e.key === "3") handleRate(3);
        else if (e.key === "4") handleRate(4);
      } else if (e.key === "Enter" && !revealed && currentCard?.item_type === "cloze") {
        // Check answer or reveal
        if (userAnswer.trim()) {
          setRevealed(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, revealed, submitting, completed, currentCard, userAnswer, handleRate, onClose]);

  if (!isOpen) return null;

  // Extract cloze parts: before, target, after
  const renderClozePrompt = () => {
    if (!currentCard) return null;
    const prompt = currentCard.prompt;
    let before = prompt;
    let target = currentCard.answer;
    let after = "";

    if (prompt.includes("{{c1::")) {
      const parts = prompt.split(/\{\{c1::.*?\}\}/);
      before = parts[0] || "";
      after = parts[1] || "";
    } else if (prompt.includes("==")) {
      const parts = prompt.split(/==.*?==/);
      before = parts[0] || "";
      after = parts[1] || "";
    } else {
      const idx = prompt.indexOf(target);
      if (idx !== -1) {
        before = prompt.substring(0, idx);
        after = prompt.substring(idx + target.length);
      }
    }

    const isMatch = userAnswer.trim().toLowerCase() === target.trim().toLowerCase();

    return (
      <div className="text-base sm:text-lg leading-relaxed text-neutral-800 dark:text-neutral-100 font-serif">
        <span>{before}</span>
        <span className="inline-block mx-1.5 align-baseline">
          {revealed ? (
            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 dark:bg-nord-accent/30 text-amber-900 dark:text-nord-accent font-bold border border-amber-500/40 dark:border-nord-accent/40 font-mono text-sm">
              {target}
            </span>
          ) : (
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="type answer..."
              autoFocus
              className={`px-2.5 py-0.5 rounded-lg border text-sm font-mono font-medium outline-none transition-all duration-150 ${
                isMatch
                  ? "bg-emerald-500/15 border-emerald-500 text-emerald-900 dark:text-emerald-300"
                  : "bg-black/[0.04] dark:bg-white/[0.06] border-black/20 dark:border-white/20 focus:border-amber-600 dark:focus:border-nord-accent focus:bg-white dark:focus:bg-stone-800"
              }`}
              style={{ minWidth: `${Math.max(120, target.length * 10)}px` }}
            />
          )}
        </span>
        <span>{after}</span>
      </div>
    );
  };

  // Scramble drill handlers
  const handleSelectScramblePiece = (piece: string, index: number) => {
    setAssembledClauses((prev) => [...prev, piece]);
    setScramblePool((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveAssembledPiece = (piece: string, index: number) => {
    setScramblePool((prev) => [...prev, piece]);
    setAssembledClauses((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCheckScramble = () => {
    if (!currentCard) return;
    const assembledText = assembledClauses.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
    const targetText = currentCard.answer.replace(/\s+/g, " ").trim().toLowerCase();
    const isCorrect = assembledText === targetText || targetText.includes(assembledText);
    setScrambleCorrect(isCorrect);
    setRevealed(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden select-none"
        style={{ backgroundColor: "var(--theme-surface)" }}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 dark:bg-nord-accent/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-amber-700 dark:text-nord-accent" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <span>Extractive Practice Suite</span>
                {currentCard && (
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-neutral-500 dark:text-neutral-400">
                    {currentCard.item_type}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-xs sm:max-w-md">
                {bookTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!completed && cards.length > 0 && (
              <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.08] text-neutral-600 dark:text-neutral-300">
                {currentIndex + 1} / {cards.length}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              title="Close Practice Session (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 flex-1 overflow-y-auto">
          {completed ? (
            /* Session Completion Screen */
            <div className="py-8 text-center space-y-5">
              <div className="w-16 h-16 rounded-3xl bg-amber-500/15 dark:bg-nord-accent/20 text-amber-600 dark:text-nord-accent mx-auto flex items-center justify-center">
                <Trophy className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                  Practice Session Completed!
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                  You reviewed {sessionReviews.length} extractive items with FSRS-4.5 scheduling.
                </p>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 dark:bg-nord-accent dark:hover:bg-nord-accent/90 text-white font-medium text-sm transition-all shadow-md active:scale-95"
                >
                  Return to Reader
                </button>
              </div>
            </div>
          ) : !currentCard ? (
            /* Empty Deck State */
            <div className="py-12 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                No Cards Due for Review!
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                All study cards for this book are scheduled for future review intervals. Keep reading to unlock new chapters!
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-semibold hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
              >
                Back to Book
              </button>
            </div>
          ) : (
            /* Active Card Drill View */
            <div className="space-y-6">
              {/* Card Anchor Info */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-amber-700 dark:text-amber-400 font-semibold">
                    {currentCard.anchor || "§p-anchor"}
                  </span>
                  <span className="text-neutral-400">•</span>
                  <span className="text-neutral-500 dark:text-neutral-400 font-medium">
                    {currentCard.chapter_file}
                  </span>
                </div>

                {onJumpToAnchor && currentCard.anchor && (
                  <button
                    type="button"
                    onClick={() => {
                      onJumpToAnchor(currentCard.chapter_file, currentCard.anchor);
                      onClose();
                    }}
                    className="flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-amber-700 dark:hover:text-nord-accent transition-colors"
                    title="Jump to source paragraph anchor in reader"
                  >
                    <BookOpen className="w-3 h-3" />
                    <span>View in Context</span>
                  </button>
                )}
              </div>

              {/* Cloze Drill View */}
              {currentCard.item_type === "cloze" && (
                <div className="p-6 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 space-y-4">
                  {renderClozePrompt()}

                  {!revealed && (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-[11px] text-neutral-400">
                        Type answer and press Enter, or click Show Answer.
                      </p>
                      <button
                        type="button"
                        onClick={() => setRevealed(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Show Answer</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Scrambled Argument Drill View */}
              {currentCard.item_type === "scramble" && (
                <div className="space-y-4">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                    Reorder the scrambled clauses into the original verbatim argument:
                  </p>

                  {/* Assembled Workspace */}
                  <div className="min-h-24 p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border-2 border-dashed border-black/15 dark:border-white/15 flex flex-wrap gap-2 items-center">
                    {assembledClauses.length === 0 ? (
                      <span className="text-xs text-neutral-400 italic">
                        Click clauses below in the correct order to assemble the sentence...
                      </span>
                    ) : (
                      assembledClauses.map((clause, idx) => (
                        <button
                          key={`asm-${idx}`}
                          type="button"
                          onClick={() => handleRemoveAssembledPiece(clause, idx)}
                          className="px-3 py-1.5 rounded-xl bg-amber-500/15 dark:bg-nord-accent/20 border border-amber-500/30 dark:border-nord-accent/30 text-neutral-800 dark:text-neutral-100 text-xs font-serif font-medium hover:bg-red-500/15 hover:border-red-500/30 transition-all flex items-center gap-1.5 group"
                          title="Click to remove"
                        >
                          <span>{clause}</span>
                          <X className="w-3 h-3 text-neutral-400 group-hover:text-red-500" />
                        </button>
                      ))
                    )}
                  </div>

                  {/* Scrambled Pool */}
                  {scramblePool.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {scramblePool.map((piece, idx) => (
                        <button
                          key={`pool-${idx}`}
                          type="button"
                          onClick={() => handleSelectScramblePiece(piece, idx)}
                          className="px-3 py-1.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/12 text-neutral-800 dark:text-neutral-200 text-xs font-serif transition-all active:scale-95"
                        >
                          {piece}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Scramble Actions */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setScramblePool([...scramblePool, ...assembledClauses]);
                        setAssembledClauses([]);
                        setScrambleCorrect(null);
                      }}
                      className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Order</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {!revealed && (
                        <>
                          <button
                            type="button"
                            onClick={() => setRevealed(true)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                          >
                            Reveal
                          </button>
                          <button
                            type="button"
                            onClick={handleCheckScramble}
                            disabled={assembledClauses.length === 0}
                            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 dark:bg-nord-accent text-white hover:bg-amber-700 dark:hover:bg-nord-accent/90 disabled:opacity-40 transition-all shadow-sm"
                          >
                            Check Order
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {scrambleCorrect !== null && (
                    <div
                      className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                        scrambleCorrect
                          ? "bg-emerald-500/15 text-emerald-900 dark:text-emerald-300 border border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      {scrambleCorrect ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                          <span>Perfect! The clauses match the original text sequence.</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                          <span>Close! Compare your sequence against the source below.</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Revealed Answer & Source Display */}
              {revealed && (
                <div className="p-4 rounded-xl bg-amber-500/10 dark:bg-nord-accent/10 border border-amber-500/20 dark:border-nord-accent/20 space-y-1.5 animate-in fade-in duration-150">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-nord-accent">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Exact Answer Key:</span>
                    <code className="font-mono bg-amber-500/20 dark:bg-nord-accent/20 px-1.5 py-0.5 rounded text-[11px]">
                      {currentCard.answer}
                    </code>
                  </div>
                </div>
              )}

              {/* FSRS 4-Tier Rating Buttons */}
              {revealed && (
                <div className="pt-2 space-y-2 animate-in fade-in duration-150">
                  <p className="text-center text-[11px] text-neutral-400 font-medium">
                    Rate recall difficulty (Hotkeys: 1, 2, 3, 4):
                  </p>

                  <div className="grid grid-cols-4 gap-2">
                    {/* Again (1) */}
                    <button
                      type="button"
                      onClick={() => handleRate(1)}
                      disabled={submitting}
                      className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-900 dark:text-red-300 flex flex-col items-center gap-1 transition-all active:scale-95"
                    >
                      <span className="text-xs font-bold">Again</span>
                      <span className="text-[10px] text-red-700 dark:text-red-400 font-mono">&lt; 10m</span>
                      <kbd className="text-[9px] px-1 rounded bg-red-500/20 font-mono">1</kbd>
                    </button>

                    {/* Hard (2) */}
                    <button
                      type="button"
                      onClick={() => handleRate(2)}
                      disabled={submitting}
                      className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-300 flex flex-col items-center gap-1 transition-all active:scale-95"
                    >
                      <span className="text-xs font-bold">Hard</span>
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-mono">~1d</span>
                      <kbd className="text-[9px] px-1 rounded bg-amber-500/20 font-mono">2</kbd>
                    </button>

                    {/* Good (3) */}
                    <button
                      type="button"
                      onClick={() => handleRate(3)}
                      disabled={submitting}
                      className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 flex flex-col items-center gap-1 transition-all active:scale-95"
                    >
                      <span className="text-xs font-bold">Good</span>
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono">~3d</span>
                      <kbd className="text-[9px] px-1 rounded bg-emerald-500/20 font-mono">3</kbd>
                    </button>

                    {/* Easy (4) */}
                    <button
                      type="button"
                      onClick={() => handleRate(4)}
                      disabled={submitting}
                      className="p-3 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-900 dark:text-sky-300 flex flex-col items-center gap-1 transition-all active:scale-95"
                    >
                      <span className="text-xs font-bold">Easy</span>
                      <span className="text-[10px] text-sky-700 dark:text-sky-400 font-mono">~7d</span>
                      <kbd className="text-[9px] px-1 rounded bg-sky-500/20 font-mono">4</kbd>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
