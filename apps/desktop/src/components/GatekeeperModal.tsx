import React, { useState, useEffect } from "react";
import { ShieldCheck, ArrowRight, Eye, CheckCircle2, Trophy, X } from "lucide-react";
import { PracticeCardItem, CardSchedule } from "../lib/types";
import { submitReview } from "../lib/api";

interface GatekeeperModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetChapterTitle: string;
  cards: PracticeCardItem[];
  onComplete: () => void;
  onReviewSubmitted: (cardId: string, schedule: CardSchedule) => void;
}

export const GatekeeperModal: React.FC<GatekeeperModalProps> = ({
  isOpen,
  onClose,
  targetChapterTitle,
  cards,
  onComplete,
  onReviewSubmitted,
}) => {
  // Take up to 3 cards for the gatekeeper mini-challenge
  const challengeCards = cards.slice(0, 3);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const currentCard = challengeCards[currentIndex];

  useEffect(() => {
    setUserAnswer("");
    setRevealed(false);
  }, [currentIndex]);

  useEffect(() => {
    if (!isOpen) {
      setCurrentIndex(0);
      setUserAnswer("");
      setRevealed(false);
      setCompleted(false);
    }
  }, [isOpen]);

  const handleRate = async (rating: number) => {
    if (!currentCard || submitting) return;
    setSubmitting(true);
    try {
      const schedule = await submitReview(currentCard.card_id, rating);
      onReviewSubmitted(currentCard.card_id, schedule);

      if (currentIndex + 1 < challengeCards.length) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setCompleted(true);
      }
    } catch (e) {
      console.error("Failed to submit gatekeeper review:", e);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Render cloze inline
  const renderCloze = () => {
    if (!currentCard) return null;
    let before = currentCard.prompt;
    let target = currentCard.answer;
    let after = "";

    if (currentCard.prompt.includes("{{c1::")) {
      const parts = currentCard.prompt.split(/\{\{c1::.*?\}\}/);
      before = parts[0] || "";
      after = parts[1] || "";
    } else if (currentCard.prompt.includes("==")) {
      const parts = currentCard.prompt.split(/==.*?==/);
      before = parts[0] || "";
      after = parts[1] || "";
    }

    const isMatch = userAnswer.trim().toLowerCase() === target.trim().toLowerCase();

    return (
      <div className="text-sm sm:text-base leading-relaxed text-neutral-800 dark:text-neutral-100 font-serif">
        <span>{before}</span>
        <span className="inline-block mx-1.5 align-baseline">
          {revealed ? (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 dark:bg-nord-accent/30 text-amber-950 dark:text-nord-accent font-mono font-bold text-xs">
              {target}
            </span>
          ) : (
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="type answer..."
              autoFocus
              className={`px-2 py-0.5 rounded-md border text-xs font-mono font-medium outline-none transition-all ${
                isMatch
                  ? "bg-emerald-500/15 border-emerald-500 text-emerald-900 dark:text-emerald-300"
                  : "bg-black/[0.04] dark:bg-white/[0.06] border-black/20 dark:border-white/20 focus:border-amber-600 dark:focus:border-nord-accent"
              }`}
              style={{ minWidth: `${Math.max(100, target.length * 9)}px` }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && userAnswer.trim()) {
                  setRevealed(true);
                }
              }}
            />
          )}
        </span>
        <span>{after}</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl p-6 flex flex-col space-y-5 select-none"
        style={{ backgroundColor: "var(--theme-surface)" }}
      >
        {/* Gatekeeper Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-600/15 dark:bg-nord-accent/20 flex items-center justify-center text-amber-700 dark:text-nord-accent flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                Chapter Gatekeeper Challenge
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Solve {challengeCards.length} recall items before unlocking{" "}
                <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                  {targetChapterTitle}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            title="Skip for now"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {completed ? (
          <div className="py-6 text-center space-y-4 animate-in fade-in duration-150">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-600 mx-auto flex items-center justify-center">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Gatekeeper Passed!
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Great job reinforcing your memory. The next chapter is now unlocked.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onComplete();
              }}
              className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 dark:bg-nord-accent dark:hover:bg-nord-accent/90 text-white font-semibold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <span>Advance to {targetChapterTitle}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : !currentCard ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="text-xs text-neutral-500">
              No due cards found for this chapter. Unlocking immediately!
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onComplete();
              }}
              className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold"
            >
              Continue to {targetChapterTitle}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
              <span>Card {currentIndex + 1} of {challengeCards.length}</span>
              <span>{currentCard.anchor}</span>
            </div>

            <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 space-y-3">
              {renderCloze()}

              {!revealed && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-neutral-600 dark:text-neutral-300 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Show Answer</span>
                  </button>
                </div>
              )}
            </div>

            {revealed && (
              <div className="space-y-2 animate-in fade-in duration-100">
                <div className="p-2.5 rounded-lg bg-amber-500/10 dark:bg-nord-accent/10 text-xs text-amber-900 dark:text-nord-accent font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Answer: <code>{currentCard.answer}</code></span>
                </div>

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
                onClick={() => {
                  onClose();
                  onComplete();
                }}
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
