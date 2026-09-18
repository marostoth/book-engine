import { test } from "vitest";
import assert from "node:assert/strict";

import { appShortcut, elementaryCanvasShortcut, type ShortcutKey } from "./readerShortcuts.ts";

const LEVELS = ["inspectional", "elementary", "analytical", "syntopical"];

function press(key: string, options: Partial<ShortcutKey> = {}): ShortcutKey {
  return { key, altKey: false, ctrlKey: false, metaKey: false, inTextEntry: false, ...options };
}

/**
 * The shortcuts that one key press runs at a reading level. App.tsx always listens. The elementary canvas
 * listens while the Reader shows, which is at every level except inspectional.
 */
function actionsAt(level: string, key: ShortcutKey): string[] {
  const actions: (string | null)[] = [appShortcut(key)];
  if (level !== "inspectional") {
    actions.push(elementaryCanvasShortcut(key, level));
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
