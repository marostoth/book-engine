// @vitest-environment jsdom

import React, { useState } from "react";
import { afterEach, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { DEFAULT_PREFERENCES } from "../lib/preferences.ts";
import type { ReaderPreferences } from "../lib/types.ts";
import {
  SettingsContext,
  bionicOn,
  useBionic,
  useSettings,
  useSettingsValue,
  withBionic,
} from "./useSettings.ts";

afterEach(cleanup);

/** How many times each named part has been drawn. A count, never an element (see `useDialog.test.tsx`). */
const draws: Record<string, number> = {};

function count(name: string): void {
  draws[name] = (draws[name] ?? 0) + 1;
}

/**
 * A part of the app that reads the settings and is wrapped in `React.memo`, like `Reader` is (RD-06).
 *
 * `React.memo` stops a redraw when the props do not change. It does NOT stop one when the value of a context changes,
 * so the provider's value must keep its identity while the settings stay the same.
 */
const MemoReader = React.memo(function MemoReader() {
  count("reader");
  const { settings } = useSettings();
  return <span data-testid="wpm">{settings.elementary.pacerWpm}</span>;
});

/** A page that holds the settings and some state of its own, the way `App.tsx` does. */
function Page({ start = DEFAULT_PREFERENCES }: { start?: ReaderPreferences }) {
  const [settings, setSettings] = useState<ReaderPreferences>(start);
  const [scrolled, setScrolled] = useState(0);
  // `App.tsx` makes this once with `useCallback`. `useState` holds it still here for the same reason.
  const [change] = useState(() => (next: ReaderPreferences) => setSettings(next));
  const value = useSettingsValue(settings, change);
  return (
    <SettingsContext.Provider value={value}>
      <span data-testid="scrolled">{scrolled}</span>
      <button onClick={() => setScrolled((n) => n + 1)}>Scroll the chapter</button>
      <button onClick={() => change({ ...settings, elementary: { ...settings.elementary, pacerWpm: 400 } })}>
        Read faster
      </button>
      <BionicButton />
      <BionicWitness />
      <MemoReader />
    </SettingsContext.Provider>
  );
}

/** Shows the SAVED setting, not a flag. That is the whole point: the saved one used to be written and never read. */
function BionicWitness() {
  const { settings } = useSettings();
  return <span data-testid="saved-bionic">{String(settings.elementary?.bionicFixationEnabled)}</span>;
}

function BionicButton() {
  const bionic = useBionic();
  return (
    <button onClick={bionic.toggle} aria-pressed={bionic.on}>
      Bionic {bionic.on ? "on" : "off"}
    </button>
  );
}

// ---------------------------------------------------------------- the memo guard (RD-06)

test("state of the page that is not a setting does not draw the reader again", () => {
  draws.reader = 0;
  render(<Page />);
  const first = draws.reader;
  fireEvent.click(screen.getByText("Scroll the chapter"));
  assert.equal(screen.getByTestId("scrolled").textContent, "1", "the page did not render, so nothing is proved");
  assert.equal(
    draws.reader,
    first,
    "the reader was drawn again for a scroll. The value of the settings context must keep its identity, or the " +
      "context undoes RD-06 without one prop changing"
  );
});

test("a changed setting does draw the reader again", () => {
  draws.reader = 0;
  render(<Page />);
  const first = draws.reader;
  fireEvent.click(screen.getByText("Read faster"));
  assert.equal(screen.getByTestId("wpm").textContent, "400");
  assert.equal(draws.reader > first, true, "the reader must follow a setting the reader changed");
});

// ---------------------------------------------------------------- no provider

test("the settings cannot be read outside the provider", () => {
  function Bare() {
    useSettings();
    return null;
  }
  // React prints the thrown error and asks for an error boundary. The throw is what this test wants, so the
  // printing is turned off for the one call and put back after it.
  const printed = console.error;
  console.error = () => {};
  try {
  assert.throws(
    () => render(<Bare />),
    /outside SettingsContext\.Provider/,
    "a default set of settings here would show the reader somebody else's choices and look right"
  );
  } finally {
    console.error = printed;
  }
});

// ---------------------------------------------------------------- one Bionic flag

test("Bionic Reading starts from the saved setting, so a restart remembers it", () => {
  render(<Page start={withBionic(DEFAULT_PREFERENCES, true)} />);
  assert.equal(
    screen.getByText("Bionic on").getAttribute("aria-pressed"),
    "true",
    "the saved setting used to be written and never read, so the app always started with Bionic off"
  );
});

test("the Bionic button writes the saved setting", () => {
  render(<Page />);
  const saved = () => screen.getByTestId("saved-bionic").textContent;
  assert.equal(saved(), "false");
  fireEvent.click(screen.getByText("Bionic off"));
  assert.equal(saved(), "true", "the button must write the one saved setting, not a flag held in memory");
  fireEvent.click(screen.getByText("Bionic on"));
  assert.equal(saved(), "false", "and it must switch back");
});

test("withBionic changes only that one setting", () => {
  const on = withBionic(DEFAULT_PREFERENCES, true);
  assert.equal(on.elementary.bionicFixationEnabled, true);
  assert.equal(on.elementary.pacerWpm, DEFAULT_PREFERENCES.elementary.pacerWpm);
  assert.equal(on.general?.fontSize, DEFAULT_PREFERENCES.general?.fontSize);
  assert.equal(DEFAULT_PREFERENCES.elementary.bionicFixationEnabled, false, "the settings given in must not change");
});

test("bionicOn says false for settings with no elementary group", () => {
  assert.equal(bionicOn({} as ReaderPreferences), false);
});
