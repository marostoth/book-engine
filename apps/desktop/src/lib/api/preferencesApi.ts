import type { ReaderPreferences } from "../types.ts";
import { callBackend } from "./clientBase.ts";

/** The reader settings saved in `vault/preferences.json`, or null when none are saved yet (DS-11). */
export async function fetchPreferences(): Promise<Record<string, unknown> | null> {
  return callBackend<Record<string, unknown> | null>("get_preferences", undefined, (dev) => dev.fetchPreferences());
}

/** Saves the reader settings to `vault/preferences.json`. A damaged settings file stops the save. */
export async function persistPreferences(preferences: ReaderPreferences): Promise<void> {
  return callBackend<void>("save_preferences", { preferences }, (dev) => dev.persistPreferences(preferences));
}
