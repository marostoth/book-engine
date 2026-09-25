import { test } from "vitest";
import assert from "node:assert/strict";

import { appShortcut, dipStreamShortcut, elementaryCanvasShortcut, type ShortcutKey } from "./readerShortcuts.ts";

const LEVELS = ["inspectional", "elementary", "analytical", "syntopical"];

function press(key: string, options: Partial<ShortcutKey> = {}): ShortcutKey {
  return { key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, inTextEntry: false, ...options };
}

/**
 * The shortcuts that one key press runs at a reading level, with the focus on the page. App.tsx always
 * listens. The elementary canvas listens while the Reader shows, which is at every level except inspectional.
 * The dip stream listens at the inspectional level, while the Dip Sampler shows.
 */
function actionsAt(level: string, key: ShortcutKey): string[] {
  const actions: (string | null)[] = [appShortcut(key)];
  if (level !== "inspectional") {
    actions.push(elementaryCanvasShortcut(key, level));
  } else {
    actions.push(dipStreamShortcut(key, !key.inTextEntry));
  }
  return actions.filter((action): action is string => action !== null);
}

test("one Alt+P press toggles the pacer once at every reading level", () => {
  for (const level of LEVELS) {
    assert.deepEqual(actionsAt(level, press("p", { altKey: true })), ["togglePacer"], level);
    assert.deepEqual(actionsAt(level, press("P", { altKey: true })), ["togglePacer"], `${level} with Caps Lock`);
  }
});

test("Alt+P in a text field or an editable element does nothing", () => {
  for (const level of LEVELS) {
    assert.deepEqual(actionsAt(level, press("p", { altKey: true, inTextEntry: true })), [], level);
  }
});

test("[ and ] change the pacer speed once, only in the elementary level and outside text entry", () => {
  assert.deepEqual(actionsAt("elementary", press("[")), ["slowerPacer"]);
  assert.deepEqual(actionsAt("elementary", press("]")), ["fasterPacer"]);
  assert.deepEqual(actionsAt("elementary", press("[", { inTextEntry: true })), []);
  for (const level of ["inspectional", "analytical", "syntopical"]) {
    assert.deepEqual(actionsAt(level, press("]")), [], level);
  }
});

test("Ctrl+K or Cmd+K opens search everywhere, and ? or F1 open the guide outside text entry", () => {
  for (const level of LEVELS) {
    assert.deepEqual(actionsAt(level, press("k", { ctrlKey: true })), ["search"], level);
    assert.deepEqual(actionsAt(level, press("K", { metaKey: true, inTextEntry: true })), ["search"], level);
    assert.deepEqual(actionsAt(level, press("?")), ["guide"], level);
    assert.deepEqual(actionsAt(level, press("F1")), ["guide"], level);
    assert.deepEqual(actionsAt(level, press("?", { inTextEntry: true })), [], level);
    assert.deepEqual(actionsAt(level, press("p")), [], `${level}: a plain p types text`);
  }
});

test("Space, Shift+Space, J and K page the dip stream only while the focus is on the stream or on nothing", () => {
  assert.deepEqual(actionsAt("inspectional", press(" ")), ["pageDown"]);
  assert.deepEqual(actionsAt("inspectional", press(" ", { shiftKey: true })), ["pageUp"]);
  assert.deepEqual(actionsAt("inspectional", press("j")), ["stepDown"]);
  assert.deepEqual(actionsAt("inspectional", press("K")), ["stepUp"], "Caps Lock");
  for (const key of [" ", "j", "k"]) {
    assert.equal(dipStreamShortcut(press(key), false), null, `${JSON.stringify(key)} on a focused control is its own`);
    assert.equal(dipStreamShortcut(press(key, { ctrlKey: true }), true), null, `Ctrl+${JSON.stringify(key)}`);
    assert.equal(dipStreamShortcut(press(key, { metaKey: true }), true), null, `Cmd+${JSON.stringify(key)}`);
    assert.equal(dipStreamShortcut(press(key, { altKey: true }), true), null, `Alt+${JSON.stringify(key)}`);
  }
  for (const level of ["elementary", "analytical", "syntopical"]) {
    assert.deepEqual(actionsAt(level, press(" ")), [], `${level}: the dip stream is not open`);
  }
});
