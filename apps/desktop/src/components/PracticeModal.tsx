import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  CheckCircle2,
  Sparkles,
  Trophy,
  BookOpen,
} from "lucide-react";
import { PracticeCardItem, CardSchedule } from "../lib/types";
import { submitReview } from "../lib/api";
import { ClozeDrill } from "./practice/ClozeDrill";
import { ScrambleDrill } from "./practice/ScrambleDrill";
import { RatingBar } from "./practice/RatingBar";

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
  const [sessionReviews, setSessionReviews] = useState<{ rating: number; cardId: string }[]>([]);

  const currentCard = cards[currentIndex];

  useEffect(() => {
    setUserAnswer("");
    setRevealed(false);
  }, [currentIndex]);

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
        if (userAnswer.trim()) {
          setRevealed(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, revealed, submitting, completed, currentCard, userAnswer, handleRate, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden select-none"
        style={{ backgroundColor: "var(--theme-surface)" }}
      >
        {/* Header */}
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

              {/* Cloze Drill */}
              {currentCard.item_type === "cloze" && (
                <ClozeDrill
                  card={currentCard}
                  userAnswer={userAnswer}
                  onUserAnswerChange={setUserAnswer}
                  revealed={revealed}
                  onReveal={() => setRevealed(true)}
                />
              )}

              {/* Scrambled Drill */}
              {currentCard.item_type === "scramble" && (
                <ScrambleDrill
                  card={currentCard}
                  revealed={revealed}
                  onReveal={() => setRevealed(true)}
                />
              )}

              {/* Revealed Exact Answer */}
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

              {/* FSRS Rating Buttons */}
              {revealed && <RatingBar onRate={handleRate} submitting={submitting} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
