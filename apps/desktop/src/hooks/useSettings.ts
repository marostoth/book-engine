import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReaderPreferences } from "../lib/types.ts";

/**
 * The saved reader settings, in one place (RD-09).
 *
 * The settings used to travel as two props, `preferences` and `onPreferencesChange`, from `App.tsx` down through
 * `TopNav`, `SettingsPopover` and four settings tabs, and down again through `Reader` and `ElementaryCanvas`. Every
 * component on the way had to declare both and pass both on, whether it read them or not, so a new setting meant
 * touching files that do not care about settings at all.
 */
export interface Settings {
  /** The settings as `vault/preferences.json` holds them. */
  readonly settings: ReaderPreferences;
  /**
   * Saves a whole new set of settings. The write happens a moment after the last change, so holding a key down
   * makes one save (`createPreferencesSaver`).
   */
  readonly change: (next: ReaderPreferences) => void;
}

/** Holds the settings for everything inside it. `App.tsx` builds the only provider. */
export const SettingsContext = createContext<Settings | null>(null);

/**
 * The saved settings and the one way to change them.
 *
 * This throws when it is called outside the provider, on purpose. A default set of settings here would let a
 * component read 250 words a minute and a light theme while the reader has chosen something else, and show nothing
 * wrong on screen.
 */
export function useSettings(): Settings {
  const found = useContext(SettingsContext);
  if (!found) {
    throw new Error("useSettings was called outside SettingsContext.Provider. App.tsx holds the only one.");
  }
  return found;
}

/**
 * Packs the settings and the saver into one value for the provider.
 *
 * The value keeps the same identity until the settings themselves change. That is the whole point of this function.
 * `Reader` is wrapped in `React.memo` so that a scroll moves the progress bar and leaves the chapter on screen alone
 * (RD-06), and a component that reads a context is drawn again every time the value of that context is a new object,
 * memo or not. A value built fresh on each render would therefore undo RD-06 without changing one prop, and nothing
 * on screen would look wrong. The test "state of the page that is not a setting does not draw the reader again"
 * in `useSettings.test.tsx` holds this, and it does fail when this `useMemo` is taken away.
 */
export function useSettingsValue(
  settings: ReaderPreferences,
  change: (next: ReaderPreferences) => void
): Settings {
  return useMemo(() => ({ settings, change }), [settings, change]);
}

/** Whether the reader has turned Bionic Reading on. One saved setting, read everywhere (RD-09). */
export function bionicOn(settings: ReaderPreferences): boolean {
  return settings.elementary?.bionicFixationEnabled ?? false;
}

/** The same settings with Bionic Reading the other way round. */
export function withBionic(settings: ReaderPreferences, on: boolean): ReaderPreferences {
  return { ...settings, elementary: { ...settings.elementary, bionicFixationEnabled: on } };
}

/**
 * Bionic Reading: whether it is on, and how to switch it.
 *
 * There used to be two flags. `App.tsx` held one in memory that the button in the top navigation switched, and the
 * saved setting `bionicFixationEnabled` was written by the switch in Settings and read by nobody. So the button
 * worked but forgot on restart, and the switch in Settings changed nothing the reader could see (RD-09).
 */
export function useBionic(): { on: boolean; toggle: () => void } {
  const { settings, change } = useSettings();
  const on = bionicOn(settings);
  const toggle = useCallback(() => change(withBionic(settings, !bionicOn(settings))), [settings, change]);
  return { on, toggle };
}
