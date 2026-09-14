import { ReaderPreferences } from "./types";

export const PREFERENCES_STORAGE_KEY = "book_engine_preferences";

export const DEFAULT_PREFERENCES: ReaderPreferences = {
  elementary: {
    pacerWpm: 250,
    pacerMode: "underline",
    pacerChunkSize: 2,
    pacerLockFocus: true,
    pacerShowGripHandle: true,
    pacerClickToScrub: true,
    pacerKeyboardScrubbing: false,
    focusRulerEnabled: false,
    focusDimmingPercent: 70,
    focusActiveHighlight: true,
    measureCharsPerLine: 65,
    bionicFixationEnabled: false,
    instantDictionaryEnabled: true,
  },
  inspectional: {
    defaultTimerMinutes: 15,
    autoPromptExitCard: true,
    samplingDepthParagraphs: 2,
    autoHideDrawerOnSkim: false,
    singleKeyPagingEnabled: true,
  },
  study: {
    gatekeeperMode: false,
    gatekeeperQuota: 3,
    dailyTargetCards: 20,
    practiceMode: "verbatim",
    hybridRatio: 0.5,
  },
  general: {
    theme: "paper",
    fontSize: 16,
    lineHeightRatio: 1.85,
    fontFamily: "serif",
  },
  gatekeeperMode: false,
  dailyTarget: 20,
};

export function migratePreferences(raw: unknown): ReaderPreferences {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_PREFERENCES };
  }

  const stored = raw as Record<string, any>;

  // Fallback for v1 legacy preferences
  const legacyGatekeeper =
    typeof stored.gatekeeperMode === "boolean"
      ? stored.gatekeeperMode
      : DEFAULT_PREFERENCES.study.gatekeeperMode;
  const legacyTarget =
    typeof stored.dailyTarget === "number"
      ? stored.dailyTarget
      : DEFAULT_PREFERENCES.study.dailyTargetCards;

  const study = {
    ...DEFAULT_PREFERENCES.study,
    gatekeeperMode: legacyGatekeeper,
    dailyTargetCards: legacyTarget,
    ...(typeof stored.study === "object" && stored.study !== null ? stored.study : {}),
  };

  const elementary = {
    ...DEFAULT_PREFERENCES.elementary,
    ...(typeof stored.elementary === "object" && stored.elementary !== null ? stored.elementary : {}),
  };

  const inspectional = {
    ...DEFAULT_PREFERENCES.inspectional,
    ...(typeof stored.inspectional === "object" && stored.inspectional !== null ? stored.inspectional : {}),
  };

  const general = {
    ...DEFAULT_PREFERENCES.general,
    ...(typeof stored.general === "object" && stored.general !== null ? stored.general : {}),
  };

  return {
    elementary,
    inspectional,
    study,
    general,
    gatekeeperMode: study.gatekeeperMode,
    dailyTarget: study.dailyTargetCards,
  };
}

export function loadPreferences(): ReaderPreferences {
  try {
    const saved = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return migratePreferences(parsed);
    }
  } catch (err) {
    console.warn("Failed to load preferences from localStorage:", err);
  }
  return { ...DEFAULT_PREFERENCES };
}

export function savePreferences(preferences: ReaderPreferences): void {
  try {
    const toSave: ReaderPreferences = {
      ...preferences,
      gatekeeperMode: preferences.study?.gatekeeperMode ?? preferences.gatekeeperMode ?? false,
      dailyTarget: preferences.study?.dailyTargetCards ?? preferences.dailyTarget ?? 20,
    };
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(toSave));
  } catch (err) {
    console.warn("Failed to persist preferences to localStorage:", err);
  }
}
