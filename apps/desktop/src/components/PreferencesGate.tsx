import React, { useEffect, useState } from "react";
import { fetchPreferences, persistPreferences } from "../lib/api";
import { reportBackendError } from "../lib/backendErrors";
import { loadPreferences, readBrowserPreferences, type LoadedPreferences } from "../lib/preferences";

interface PreferencesGateProps {
  /** The app, given the settings read from the vault. */
  children: (loaded: LoadedPreferences) => React.ReactNode;
}

/**
 * Holds the app back until the reader's settings are read from the vault (`vault/preferences.json`).
 *
 * The settings used to come from browser storage, which a release build, a new PC or a reinstall does not share, and
 * the theme was never kept (DS-11). An app that started before its settings arrived would show the default theme first,
 * and a change made in that moment could be saved over the reader's own settings.
 */
export const PreferencesGate: React.FC<PreferencesGateProps> = ({ children }) => {
  const [loaded, setLoaded] = useState<LoadedPreferences | null>(null);

  useEffect(() => {
    let current = true;
    void loadPreferences(
      { fetchPreferences, persistPreferences },
      () => readBrowserPreferences(() => window.localStorage),
      reportBackendError
    ).then((result) => {
      if (current) setLoaded(result);
    });
    return () => {
      current = false;
    };
  }, []);

  if (loaded === null) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--theme-bg)] text-[var(--theme-muted)] text-sm">
        Loading your settings...
      </div>
    );
  }

  return <>{children(loaded)}</>;
};
