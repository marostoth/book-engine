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
import { ScenarioCardView } from "./practice/ScenarioCardView";
import { currentSessionCard, recordSessionReview, startSession, syncSession } from "../lib/practiceSession";
import { reportBackendError } from "../lib/backendErrors";

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
  const [session, setSession] = useState(() => startSession([]));
  const [userAnswer, setUserAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [suggestedRating, setSuggestedRating] = useState<number | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const currentCard = currentSessionCard(session);
  const { completed } = session;

  // Walk a session copy of the due cards, because rating a card removes it from `cards`.
  // Closing the window resets the session, so the next opening starts fresh.
  useEffect(() => {
    setSession((prev) => (isOpen ? syncSession(prev, cards) : startSession([])));
  }, [isOpen, cards]);

  useEffect(() => {
    setUserAnswer("");
    setRevealed(false);
    setSuggestedRating(undefined);
  }, [currentCard?.card_id]);

  const handleRate = useCallback(
    async (rating: number) => {
      if (!currentCard || submitting) return;
      setSubmitting(true);
      try {
        const schedule = await submitReview(currentCard.card_id, rating);
        // Update the session before the deck, so the shrinking due list cannot restart it.
        setSession((prev) => recordSessionReview(prev, currentCard.card_id, rating));
        onReviewSubmitted(currentCard.card_id, schedule);
      } catch (err) {
        reportBackendError("Your rating was not saved. Rate the card again.", err);
      } finally {
        setSubmitting(false);
      }
    },
    [currentCard, submitting, onReviewSubmitted]
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
        className="w-full max-w-2xl rounded-3xl border border-[var(--theme-border)] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden select-none text-[var(--theme-text)]"
        style={{ backgroundColor: "var(--theme-surface)" }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--theme-border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--theme-accent)]/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[var(--theme-accent)]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--theme-text)] flex items-center gap-2">
                <span>Extractive Practice Suite</span>
                {currentCard && (
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-muted)]">
                    {currentCard.item_type}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-[var(--theme-muted)] truncate max-w-xs sm:max-w-md">
                {bookTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!completed && session.cards.length > 0 && (
              <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-muted)]">
                {session.index + 1} / {session.cards.length}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent)]/10 transition-colors"
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
              <div className="w-16 h-16 rounded-3xl bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] mx-auto flex items-center justify-center">
                <Trophy className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[var(--theme-text)]">
                  Practice Session Completed!
                </h3>
                <p className="text-sm text-[var(--theme-muted)] mt-1">
                  You reviewed {session.reviews.length} extractive items with FSRS-5 scheduling.
                </p>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-[var(--theme-accent)] hover:brightness-110 text-white font-medium text-sm transition-all shadow-md active:scale-95"
                >
                  Return to Reader
                </button>
              </div>
            </div>
          ) : !currentCard ? (
            <div className="py-12 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="text-base font-bold text-[var(--theme-text)]">
                No Cards Due for Review!
              </h3>
              <p className="text-xs text-[var(--theme-muted)] max-w-sm mx-auto">
                All study cards for this book are scheduled for future review intervals. Keep reading to unlock new chapters!
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] text-xs font-semibold hover:bg-[var(--theme-surface)] transition-colors"
              >
                Back to Book
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Card Anchor Info */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[var(--theme-accent)] font-semibold">
                    {currentCard.anchor || "§p-anchor"}
                  </span>
                  <span className="text-[var(--theme-muted)]">•</span>
                  <span className="text-[var(--theme-muted)] font-medium">
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
                    className="flex items-center gap-1 text-[11px] font-medium text-[var(--theme-muted)] hover:text-[var(--theme-accent)] transition-colors"
                    title="Jump to source paragraph anchor in reader"
                  >
                    <BookOpen className="w-3 h-3" />
                    <span>View in Context</span>
                  </button>
                )}
              </div>

              {/* Scenario Drill vs Cloze/Scramble Drill */}
              {currentCard.card_type === "scenario" || currentCard.item_type === "scenario" || currentCard.cardType === "scenario" ? (
                <ScenarioCardView
                  card={currentCard}
                  onAnswerSubmitted={(isCorrect) => {
                    setRevealed(true);
                    setSuggestedRating(isCorrect ? undefined : 1);
                  }}
                  onJumpToAnchor={onJumpToAnchor}
                />
              ) : (
                <>
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
                    <div className="p-4 rounded-xl bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20 space-y-1.5 animate-in fade-in duration-150">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--theme-accent)]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Exact Answer Key:</span>
                        <code className="font-mono bg-[var(--theme-accent)]/20 px-1.5 py-0.5 rounded text-[11px]">
                          {currentCard.answer}
                        </code>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* FSRS Rating Buttons */}
              {revealed && (
                <RatingBar
                  onRate={handleRate}
                  submitting={submitting}
                  suggestedRating={suggestedRating}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
