import { test, vi, onTestFinished } from "vitest";
import assert from "node:assert/strict";
import type { ReaderPreferences } from "./types.ts";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  createPreferencesSaver,
  loadPreferences,
  readBrowserPreferences,
  themeOf,
  withTheme,
  type PreferencesStore,
} from "./preferences.ts";

/**
 * DS-11: the reader settings live in the vault (`vault/preferences.json`), not in the browser storage of the app window,
 * and the reading theme is one of them.
 */

/** Settings a reader chose: a dark theme, a faster pacer, the Gatekeeper on and a bigger daily target. */
function chosenSettings(): ReaderPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    general: { ...DEFAULT_PREFERENCES.general!, theme: "nord", fontSize: 18 },
    elementary: { ...DEFAULT_PREFERENCES.elementary, pacerWpm: 325 },
    study: { ...DEFAULT_PREFERENCES.study, gatekeeperMode: true, dailyTargetCards: 35 },
  };
}

/** A vault that holds `saved` and records every save. */
function vault(saved: unknown) {
  const saves: ReaderPreferences[] = [];
  const store: PreferencesStore = {
    fetchPreferences: async () => saved,
    persistPreferences: async (preferences) => {
      saves.push(preferences);
      saved = preferences;
    },
  };
  return { store, saves };
}

function errorLog() {
  const reported: string[] = [];
  return { reported, report: (action: string) => void reported.push(action) };
}

const noBrowserStorage = () => null;

/** Lets every promise that is ready run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("the settings saved in the vault come back when the app starts, with no browser storage at all", async () => {
  const { store, saves } = vault(chosenSettings());
  const errors = errorLog();

  const loaded = await loadPreferences(store, noBrowserStorage, errors.report);

  assert.equal(loaded.preferences.elementary.pacerWpm, 325, "a release build or a new PC must keep the pacer speed");
  assert.equal(loaded.preferences.study.gatekeeperMode, true, "and the Gatekeeper");
  assert.equal(loaded.preferences.study.dailyTargetCards, 35, "and the daily target");
  assert.equal(loaded.canSave, true);
  assert.deepEqual(saves, [], "starting the app writes nothing");
  assert.deepEqual(errors.reported, []);
});

test("the app starts with the reading theme the reader chose", async () => {
  const { store } = vault(chosenSettings());

  const loaded = await loadPreferences(store, noBrowserStorage, errorLog().report);

  assert.equal(themeOf(loaded.preferences), "nord", "the app used to start on paper whatever was chosen");
});

test("choosing a theme saves it with the other settings", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const { store, saves } = vault(chosenSettings());
  const saver = createPreferencesSaver(400, store.persistPreferences, errorLog().report, true);

  saver.change(withTheme(chosenSettings(), "sepia"));
  vi.advanceTimersByTime(400);

  assert.equal(saves.length, 1, "a theme change must reach the vault");
  assert.equal(themeOf(saves[0]), "sepia");
  assert.equal(saves[0].elementary.pacerWpm, 325, "and it keeps every other setting");
});

test("a theme is saved even for settings from before the theme was a setting", () => {
  const older = { ...DEFAULT_PREFERENCES, general: undefined };

  const themed = withTheme(older, "nord");

  assert.equal(themeOf(themed), "nord");
  assert.equal(themed.general?.fontSize, 16, "the other general settings get their defaults");
  assert.equal(themeOf(older), "paper", "settings with no theme show the paper theme");
});

test("settings kept in browser storage by an older version are copied into the vault once", async () => {
  const older = { elementary: { pacerWpm: 400 }, general: { theme: "sepia" }, study: { dailyTargetCards: 50 } };
  const { store, saves } = vault(null);

  const first = await loadPreferences(store, () => older, errorLog().report);

  assert.equal(first.preferences.elementary.pacerWpm, 400, "nobody loses what they chose");
  assert.equal(themeOf(first.preferences), "sepia");
  assert.equal(saves.length, 1, "the settings must be copied into the vault");
  assert.equal(saves[0].study.dailyTargetCards, 50);

  const second = await loadPreferences(store, () => ({ elementary: { pacerWpm: 100 } }), errorLog().report);

  assert.equal(second.preferences.elementary.pacerWpm, 400, "after the copy, the vault decides");
  assert.equal(saves.length, 1, "the copy is made once");
});

test("a copy into the vault that fails keeps the settings for now and says so", async () => {
  const errors = errorLog();
  const store: PreferencesStore = {
    fetchPreferences: async () => null,
    persistPreferences: async () => {
      throw new Error("the vault is not reachable");
    },
  };

  const loaded = await loadPreferences(store, () => ({ elementary: { pacerWpm: 400 } }), errors.report);

  assert.equal(loaded.preferences.elementary.pacerWpm, 400);
  assert.equal(loaded.canSave, true, "no file was read, so no file can be written over");
  assert.deepEqual(errors.reported, [
    "Your settings were not copied into the vault. The next setting you change saves them.",
  ]);
});

test("a reader with no settings anywhere starts with the default settings, and nothing is written", async () => {
  const { store, saves } = vault(null);

  const loaded = await loadPreferences(store, noBrowserStorage, errorLog().report);

  assert.deepEqual(loaded.preferences, DEFAULT_PREFERENCES);
  assert.equal(loaded.canSave, true);
  assert.deepEqual(saves, []);
});

test("settings that cannot be read give the default settings, and nothing is ever saved over them", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const errors = errorLog();
  const saves: ReaderPreferences[] = [];
  const store: PreferencesStore = {
    fetchPreferences: async () => {
      throw new Error("vault/preferences.json is damaged and was left as it is");
    },
    persistPreferences: async (preferences) => void saves.push(preferences),
  };

  const loaded = await loadPreferences(store, () => ({ general: { theme: "nord" } }), errors.report);
  const saver = createPreferencesSaver(400, store.persistPreferences, errors.report, loaded.canSave);
  saver.change(withTheme(loaded.preferences, "sepia"));
  vi.advanceTimersByTime(400);
  saver.flush();

  assert.deepEqual(loaded.preferences, DEFAULT_PREFERENCES);
  assert.equal(loaded.canSave, false);
  assert.deepEqual(saves, [], "a save would write the default settings over the reader's own");
  assert.deepEqual(errors.reported, [
    "Your settings could not be read, so the app uses the default settings and does not save changes.",
    "Your settings were not saved.",
  ]);
});

test("holding a key down makes one save, with the last value", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const saves: ReaderPreferences[] = [];
  const saver = createPreferencesSaver(400, async (preferences) => void saves.push(preferences), errorLog().report, true);

  let settings = chosenSettings();
  for (let press = 0; press < 30; press += 1) {
    settings = { ...settings, elementary: { ...settings.elementary, pacerWpm: settings.elementary.pacerWpm + 25 } };
    saver.change(settings);
    vi.advanceTimersByTime(33);
  }
  assert.equal(saves.length, 0, "nothing is saved while the key is held");

  vi.advanceTimersByTime(400);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].elementary.pacerWpm, 325 + 30 * 25);
});

test("a save that finishes late never puts back an older setting", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const started: number[] = [];
  const finish: (() => void)[] = [];
  let vaultSpeed = 0;
  const saver = createPreferencesSaver(
    400,
    (preferences) =>
      new Promise<void>((resolve) => {
        started.push(preferences.elementary.pacerWpm);
        finish.push(() => {
          vaultSpeed = preferences.elementary.pacerWpm;
          resolve();
        });
      }),
    errorLog().report,
    true
  );
  const withSpeed = (pacerWpm: number) => ({ ...chosenSettings(), elementary: { ...chosenSettings().elementary, pacerWpm } });

  saver.change(withSpeed(300));
  vi.advanceTimersByTime(400);
  saver.change(withSpeed(500));
  vi.advanceTimersByTime(400);
  assert.deepEqual(started, [300], "a second save must wait while the first one runs");

  finish[0]();
  await settle();
  assert.deepEqual(started, [300, 500], "the newest settings are saved next");

  finish[1]();
  await settle();
  assert.equal(vaultSpeed, 500, "the vault must end with the newest settings");
});

test("a failed save is reported, and the next change still saves", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const errors = errorLog();
  const saves: number[] = [];
  let failNext = true;
  const saver = createPreferencesSaver(
    400,
    async (preferences) => {
      if (failNext) {
        failNext = false;
        throw new Error("the file is in use");
      }
      saves.push(preferences.elementary.pacerWpm);
    },
    errors.report,
    true
  );

  saver.change(chosenSettings());
  vi.advanceTimersByTime(400);
  await settle();
  saver.change({ ...chosenSettings(), elementary: { ...chosenSettings().elementary, pacerWpm: 450 } });
  vi.advanceTimersByTime(400);
  await settle();

  assert.deepEqual(errors.reported, ["Your settings were not saved."]);
  assert.deepEqual(saves, [450]);
});

test("closing the app saves a change that is still waiting", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const saves: string[] = [];
  const saver = createPreferencesSaver(400, async (preferences) => void saves.push(themeOf(preferences)), errorLog().report, true);

  saver.change(withTheme(chosenSettings(), "paper"));
  saver.flush();

  assert.deepEqual(saves, ["paper"], "the change must not wait for a timer that never fires");
});

test("the old Gatekeeper fields are saved to match the study settings", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const saves: ReaderPreferences[] = [];
  const saver = createPreferencesSaver(400, async (preferences) => void saves.push(preferences), errorLog().report, true);

  saver.change({ ...chosenSettings(), gatekeeperMode: false, dailyTarget: 20 });
  saver.flush();

  assert.equal(saves[0].gatekeeperMode, true);
  assert.equal(saves[0].dailyTarget, 35);
});

test("the settings an older version kept in browser storage are read, and storage that fails reads as none", () => {
  const storage = (value: string | null) => () => ({
    getItem: (key: string) => (key === PREFERENCES_STORAGE_KEY ? value : null),
  });

  assert.deepEqual(readBrowserPreferences(storage('{"general":{"theme":"nord"}}')), { general: { theme: "nord" } });
  assert.equal(readBrowserPreferences(storage(null)), null);
  assert.equal(readBrowserPreferences(storage("{not json")), null);
  assert.equal(
    readBrowserPreferences(() => {
      throw new Error("storage is blocked");
    }),
    null
  );
});
