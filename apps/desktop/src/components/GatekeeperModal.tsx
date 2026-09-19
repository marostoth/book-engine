import React, { useState, useEffect } from "react";
import { ShieldCheck, ArrowRight, Eye, CheckCircle2, Trophy, RotateCcw, X } from "lucide-react";
import { PracticeCardItem, CardSchedule } from "../lib/types";
import { submitReview } from "../lib/api";
import { gatePassed, gateRightAnswers } from "../lib/chapterGate";
import { currentSessionCard, recordSessionReview, startSession, syncSession } from "../lib/practiceSession";
import { reportBackendError } from "../lib/backendErrors";

import { GatekeeperCardDrill } from "./practice/GatekeeperCardDrill";
import { useDialog } from "../hooks/useDialog";

interface GatekeeperModalProps {
  isOpen: boolean;
  /** Closes the gate. The reader stays in the chapter. */
  onClose: () => void;
  /** The chapter the reader leaves. The gate tests its due cards. */
  leavingChapterTitle: string;
  targetChapterTitle: string;
  cards: PracticeCardItem[];
  quota?: number;
  /** Opens the target chapter and closes the gate: after a pass, "Continue anyway", or a skip. */
  onComplete: () => void;
  onReviewSubmitted: (cardId: string, schedule: CardSchedule) => void;
}

export const GatekeeperModal: React.FC<GatekeeperModalProps> = ({
  isOpen,
  onClose,
  leavingChapterTitle,
  targetChapterTitle,
  cards,
  quota = 3,
  onComplete,
  onReviewSubmitted,
}) => {
  const [session, setSession] = useState(() => startSession([]));
  // Scenario cards answered with a wrong option. They never count as right, whatever the rating.
  const [wrongAnswers, setWrongAnswers] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [userAnswer, setUserAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const challengeCards = session.cards;
  const currentCard = currentSessionCard(session);
  const { completed } = session;
  const passed = gatePassed(session, wrongAnswers);

  // Walk a session copy of the first `quota` due cards of the chapter the reader leaves.
  // Closing the window resets the session and the wrong answers.
  useEffect(() => {
    setSession((prev) => (isOpen ? syncSession(prev, cards, quota) : startSession([])));
    if (!isOpen) {
      setWrongAnswers((prev) => (prev.size === 0 ? prev : new Set<string>()));
    }
  }, [isOpen, cards, quota]);

  useEffect(() => {
    setUserAnswer("");
    setRevealed(false);
  }, [currentCard?.card_id]);

  // Escape closes the gate and leaves the reader in the chapter they are in. It is not a way through the gate: the
  // "Skip Gatekeeper for now" button opens the next chapter, and Escape does not (RD-07).
  const { panelProps, titleId } = useDialog({ isOpen, onClose });

  const handleRate = async (rating: number) => {
    if (!currentCard || submitting) return;
    setSubmitting(true);
    try {
      const schedule = await submitReview(currentCard.card_id, rating);
      // Update the session before the deck, so the shrinking due list cannot restart it.
      setSession((prev) => recordSessionReview(prev, currentCard.card_id, rating));
      onReviewSubmitted(currentCard.card_id, schedule);
    } catch (e) {
      reportBackendError("Your rating was not saved. Rate the card again.", e);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        {...panelProps}
        className="w-full max-w-lg rounded-3xl border border-[var(--theme-border)] shadow-2xl p-6 flex flex-col space-y-5 select-none text-[var(--theme-text)]"
        style={{ backgroundColor: "var(--theme-surface)" }}
      >
        {/* Gatekeeper Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--theme-border)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[var(--theme-accent)]/15 flex items-center justify-center text-[var(--theme-accent)] flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-sm font-bold text-[var(--theme-text)]">
                Chapter Gatekeeper Challenge
              </h2>
              <p className="text-xs text-[var(--theme-muted)]">
                Recall {challengeCards.length} items from{" "}
                <span className="font-semibold text-[var(--theme-text)]">{leavingChapterTitle}</span>{" "}
                before you open{" "}
                <span className="font-semibold text-[var(--theme-text)]">
                  {targetChapterTitle}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--theme-muted)] hover:text-[var(--theme-text)] transition-colors"
            title="Close and stay in this chapter"
            aria-label="Close and stay in this chapter"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {completed && passed ? (
          <div className="py-6 text-center space-y-4 animate-in fade-in duration-150">
            <div className="w-12 h-12 rounded-2xl bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] mx-auto flex items-center justify-center">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--theme-text)]">
                Gatekeeper Passed!
              </h3>
              <p className="text-xs text-[var(--theme-muted)] mt-0.5">
                Great job reinforcing your memory. All {challengeCards.length} answers were right.
              </p>
            </div>

            <button
              type="button"
              onClick={onComplete}
              className="w-full py-2.5 rounded-xl bg-[var(--theme-accent)] hover:brightness-110 text-white font-semibold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <span>Advance to {targetChapterTitle}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : completed ? (
          <div className="py-6 text-center space-y-4 animate-in fade-in duration-150">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300 mx-auto flex items-center justify-center">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--theme-text)]">
                Not Passed Yet
              </h3>
              <p className="text-xs text-[var(--theme-muted)] mt-0.5">
                {gateRightAnswers(session, wrongAnswers)} of {challengeCards.length} answers were right. A card
                counts as right when you answer it correctly and rate it Good or Easy.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-[var(--theme-accent)] hover:brightness-110 text-white font-semibold text-xs transition-all shadow-sm"
              >
                Stay in this chapter
              </button>
              <button
                type="button"
                onClick={onComplete}
                className="flex-1 py-2.5 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text)] hover:bg-[var(--theme-border)]/30 font-semibold text-xs transition-colors"
              >
                Continue anyway
              </button>
            </div>
          </div>
        ) : !currentCard ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="text-xs text-neutral-500">
              No due cards found for this chapter. Unlocking immediately!
            </p>
            <button
              type="button"
              onClick={onComplete}
              className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold"
            >
              Continue to {targetChapterTitle}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[11px] text-[var(--theme-muted)] font-mono">
              <span>Card {session.index + 1} of {challengeCards.length}</span>
              <span>{currentCard.anchor}</span>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--theme-bg)] border border-[var(--theme-border)] space-y-3">
              <GatekeeperCardDrill
                card={currentCard}
                userAnswer={userAnswer}
                onUserAnswerChange={setUserAnswer}
                revealed={revealed}
                onReveal={() => setRevealed(true)}
                onScenarioEvaluated={(isCorrect) => {
                  if (!isCorrect) {
                    setWrongAnswers((prev) => new Set(prev).add(currentCard.card_id));
                  }
                }}
              />

              {!revealed && currentCard.card_type !== "scenario" && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-[var(--theme-text)] bg-[var(--theme-surface)] hover:bg-[var(--theme-border)]/30 border border-[var(--theme-border)]"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Show Answer</span>
                  </button>
                </div>
              )}
            </div>

            {revealed && (
              <div className="space-y-2 animate-in fade-in duration-100">
                {currentCard.card_type !== "scenario" && (
                  <div className="p-2.5 rounded-lg bg-[var(--theme-accent)]/10 text-xs text-[var(--theme-accent)] font-semibold flex items-center gap-2 border border-[var(--theme-accent)]/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Answer: <code>{currentCard.answer}</code></span>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleRate(1)}
                    disabled={submitting}
                    className="py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-900 dark:text-red-300 text-xs font-bold transition-colors"
                  >
                    Again
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRate(2)}
                    disabled={submitting}
                    className="py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-300 text-xs font-bold transition-colors"
                  >
                    Hard
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRate(3)}
                    disabled={submitting}
                    className="py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 text-xs font-bold transition-colors"
                  >
                    Good
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRate(4)}
                    disabled={submitting}
                    className="py-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-900 dark:text-sky-300 text-xs font-bold transition-colors"
                  >
                    Easy
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 text-xs">
              <button
                type="button"
                onClick={onComplete}
                className="text-[11px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              >
                Skip Gatekeeper for now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
