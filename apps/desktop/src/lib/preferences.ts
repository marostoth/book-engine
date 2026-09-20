import type { GeneralPreferences, ReaderPreferences, Theme } from "./types.ts";

/** The browser storage key where the app kept the settings before DS-11. It is read, never written. */
export const PREFERENCES_STORAGE_KEY = "book_engine_preferences";

const DEFAULT_GENERAL: GeneralPreferences = {
  theme: "paper",
  fontSize: 16,
  lineHeightRatio: 1.85,
  fontFamily: "serif",
};

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
  general: DEFAULT_GENERAL,
  gatekeeperMode: false,
  dailyTarget: 20,
};

/** What a stored file holds under one name. A file an older app wrote holds whatever it held. */
function group(stored: Record<string, unknown>, name: string): Record<string, unknown> {
  const value = stored[name];
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export function migratePreferences(raw: unknown): ReaderPreferences {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_PREFERENCES };
  }

  const stored = raw as Record<string, unknown>;

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
    ...group(stored, "study"),
  } as typeof DEFAULT_PREFERENCES.study;

  const elementary = {
    ...DEFAULT_PREFERENCES.elementary,
    ...group(stored, "elementary"),
  } as typeof DEFAULT_PREFERENCES.elementary;

  const inspectional = {
    ...DEFAULT_PREFERENCES.inspectional,
    ...group(stored, "inspectional"),
  } as typeof DEFAULT_PREFERENCES.inspectional;

  const general = {
    ...DEFAULT_PREFERENCES.general,
    ...group(stored, "general"),
  } as typeof DEFAULT_PREFERENCES.general;

  return {
    elementary,
    inspectional,
    study,
    general,
    gatekeeperMode: study.gatekeeperMode,
    dailyTarget: study.dailyTargetCards,
  };
}

/** The reading theme in the settings. The app used to start on "paper" whatever the reader chose (DS-11). */
export function themeOf(preferences: ReaderPreferences): Theme {
  return preferences.general?.theme ?? "paper";
}

/** The settings with another reading theme, so the theme is saved like every other setting. */
export function withTheme(preferences: ReaderPreferences, theme: Theme): ReaderPreferences {
  return { ...preferences, general: { ...DEFAULT_GENERAL, ...preferences.general, theme } };
}

/** Reads and writes the settings in the vault: `fetchPreferences` and `persistPreferences` in `api/preferencesApi.ts`. */
export interface PreferencesStore {
  fetchPreferences(): Promise<unknown>;
  persistPreferences(preferences: ReaderPreferences): Promise<void>;
}

/** The settings the app starts with. */
export interface LoadedPreferences {
  preferences: ReaderPreferences;
  /** False when the saved settings could not be read. Then no change is saved, because a save would write over them. */
  canSave: boolean;
}

/** Tells the reader that something did not load or save. */
type ReportError = (action: string, cause: unknown) => void;

/** The settings that browser storage still holds from before DS-11, or null. */
export function readBrowserPreferences(storage: () => Pick<Storage, "getItem">): unknown {
  try {
    const saved = storage().getItem(PREFERENCES_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

/**
 * Loads the settings from the vault, `vault/preferences.json`.
 *
 * The settings used to live only in the browser storage of the app window, so a release build, a new PC or a
 * reinstall started from the default settings (DS-11). When the vault holds no settings yet, the settings that
 * browser storage still holds are copied into the vault once, so nobody loses what they chose. Settings that cannot be
 * read give the default settings, and no change is saved over them.
 */
export async function loadPreferences(
  store: PreferencesStore,
  fromBrowser: () => unknown,
  reportError: ReportError
): Promise<LoadedPreferences> {
  let saved: unknown;
  try {
    saved = await store.fetchPreferences();
  } catch (err) {
    reportError("Your settings could not be read, so the app uses the default settings and does not save changes.", err);
    return { preferences: migratePreferences(null), canSave: false };
  }
  if (saved) {
    return { preferences: migratePreferences(saved), canSave: true };
  }

  const older = fromBrowser();
  if (!older) {
    return { preferences: migratePreferences(null), canSave: true };
  }
  const preferences = migratePreferences(older);
  try {
    await store.persistPreferences(forSaving(preferences));
  } catch (err) {
    reportError("Your settings were not copied into the vault. The next setting you change saves them.", err);
  }
  return { preferences, canSave: true };
}

/** The settings as they are saved: the old top-level Gatekeeper fields follow the study settings. */
function forSaving(preferences: ReaderPreferences): ReaderPreferences {
  return {
    ...preferences,
    gatekeeperMode: preferences.study?.gatekeeperMode ?? preferences.gatekeeperMode ?? false,
    dailyTarget: preferences.study?.dailyTargetCards ?? preferences.dailyTarget ?? 20,
  };
}

/** Saves the settings a moment after they change. */
export interface PreferencesSaver {
  /** Holds the new settings and saves them when `delayMs` pass without another change. */
  change(preferences: ReaderPreferences): void;
  /**
   * Saves the settings that are waiting, now, and gives back that save.
   *
   * The window waits for what comes back before it closes: a save that was only started is lost with the
   * webview (DS-17).
   */
  flush(): Promise<void>;
}

/**
 * Saves the settings `delayMs` after the last change, so holding `]` for the pacer speed makes one save, not thirty.
 *
 * One save runs at a time, and the newest settings are always saved last, so a save that finishes late can never put
 * back a setting the reader has just changed. When the settings could not be read at startup (`canSave` is false),
 * nothing is saved and the reader is told why.
 */
export function createPreferencesSaver(
  delayMs: number,
  persist: (preferences: ReaderPreferences) => Promise<void>,
  reportError: ReportError,
  canSave: boolean
): PreferencesSaver {
  let waiting: ReaderPreferences | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving = false;

  const saveWaiting = (): Promise<void> => {
    timer = null;
    if (saving || !waiting) return Promise.resolve();
    const next = forSaving(waiting);
    waiting = null;
    saving = true;
    return persist(next)
      .catch((err) => reportError("Your settings were not saved.", err))
      .finally(() => {
        saving = false;
        // Settings that changed during the save and whose pause is over go now. A pause still running saves them later.
        if (timer === null) void saveWaiting();
      });
  };

  return {
    change(preferences) {
      if (!canSave) {
        reportError(
          "Your settings were not saved.",
          "The saved settings could not be read when the app started, and a save would write over them."
        );
        return;
      }
      waiting = preferences;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(saveWaiting, delayMs);
    },
    async flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      await saveWaiting();
      // A save was already running, so the newest settings waited behind it. They go now, and the window waits
      // for them too (DS-17).
      if (waiting) await saveWaiting();
    },
  };
}
