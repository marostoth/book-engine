import { useState, useEffect, useCallback, useRef } from "react";
import { InspectionalSubView, ReaderPreferences } from "../lib/types";

export interface InspectionalSessionState {
  activeSubView: InspectionalSubView;
  secondsRemaining: number;
  totalDurationSeconds: number;
  isRunning: boolean;
  isExitModalOpen: boolean;
  timeFormatted: string;
  setActiveSubView: (subView: InspectionalSubView) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  toggleTimer: () => void;
  resetTimer: () => void;
  openExitModal: () => void;
  closeExitModal: () => void;
}

export function useInspectionalSession(
  activeBookId: string,
  preferences: ReaderPreferences
): InspectionalSessionState {
  const defaultMinutes = preferences.inspectional?.defaultTimerMinutes ?? 15;
  const initialDuration = Math.max(60, defaultMinutes * 60);

  const [activeSubView, setActiveSubView] = useState<InspectionalSubView>("blueprint");
  const [totalDurationSeconds, setTotalDurationSeconds] = useState<number>(initialDuration);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(initialDuration);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState<boolean>(false);

  // Keep a reference to latest preferences for interval callback
  const prefsRef = useRef(preferences);
  useEffect(() => {
    prefsRef.current = preferences;
  }, [preferences]);

  // Clean reset when switching books
  const prevBookIdRef = useRef(activeBookId);
  useEffect(() => {
    if (prevBookIdRef.current !== activeBookId) {
      prevBookIdRef.current = activeBookId;
      const newDuration = Math.max(60, (prefsRef.current.inspectional?.defaultTimerMinutes ?? 15) * 60);
      setTotalDurationSeconds(newDuration);
      setSecondsRemaining(newDuration);
      setIsRunning(false);
      setIsExitModalOpen(false);
      setActiveSubView("blueprint");
    }
  }, [activeBookId]);

  // Countdown timer effect
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          // Auto-prompt exit card if enabled
          if (prefsRef.current.inspectional?.autoPromptExitCard) {
            setIsExitModalOpen(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning]);

  const startTimer = useCallback(() => {
    setSecondsRemaining((prev) => (prev <= 0 ? totalDurationSeconds : prev));
    setIsRunning(true);
  }, [totalDurationSeconds]);

  const pauseTimer = useCallback(() => {
    setIsRunning(false);
  }, []);

  const toggleTimer = useCallback(() => {
    setIsRunning((prev) => {
      if (!prev && secondsRemaining <= 0) {
        setSecondsRemaining(totalDurationSeconds);
      }
      return !prev;
    });
  }, [secondsRemaining, totalDurationSeconds]);

  const resetTimer = useCallback(() => {
    setIsRunning(false);
    const configuredMinutes = prefsRef.current.inspectional?.defaultTimerMinutes ?? 15;
    const duration = Math.max(60, configuredMinutes * 60);
    setTotalDurationSeconds(duration);
    setSecondsRemaining(duration);
  }, []);

  const openExitModal = useCallback(() => {
    setIsExitModalOpen(true);
  }, []);

  const closeExitModal = useCallback(() => {
    setIsExitModalOpen(false);
  }, []);

  // Format MM:SS
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const timeFormatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return {
    activeSubView,
    secondsRemaining,
    totalDurationSeconds,
    isRunning,
    isExitModalOpen,
    timeFormatted,
    setActiveSubView,
    startTimer,
    pauseTimer,
    toggleTimer,
    resetTimer,
    openExitModal,
    closeExitModal,
  };
}
