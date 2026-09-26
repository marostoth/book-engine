// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LevelGuideModal } from "./LevelGuideModal.tsx";

/**
 * The open tab of the reading guide is marked in the markup, not in colour alone, so a screen reader can say which
 * level is showing. The four tabs used to be four plain buttons that differed only in their classes.
 */

afterEach(cleanup);

function openTabs(): string[] {
  return screen.getAllByRole("tab", { selected: true }).map((tab) => tab.textContent ?? "");
}

test("exactly one tab is marked open, the level the reader is at, and it names the panel", () => {
  render(<LevelGuideModal isOpen onClose={() => {}} activeLevel="analytical" />);

  assert.equal(screen.getAllByRole("tab").length, 4, "the guide has four levels, so it has four tabs");
  assert.deepEqual(openTabs(), ["Level III(Analytical)"], "the open tab is not the one the markup marks");
  const panel = screen.getByRole("tabpanel");
  assert.equal(panel.getAttribute("aria-labelledby"), screen.getByRole("tab", { selected: true }).id);
  assert.ok(panel.textContent?.includes("Level III: Analytical Reading"), "the panel shows another level");
});

test("a click moves the mark, and only one tab holds it", () => {
  render(<LevelGuideModal isOpen onClose={() => {}} activeLevel="analytical" />);

  fireEvent.click(screen.getByRole("tab", { name: /Level I\(/ }));

  assert.deepEqual(openTabs(), ["Level I(Elementary)"], "the click did not move the mark");
  assert.ok(screen.getByRole("tabpanel").textContent?.includes("Level I: Elementary Reading"));
});

test("only the open tab is in the Tab order, and the arrows, Home and End move between tabs", () => {
  render(<LevelGuideModal isOpen onClose={() => {}} activeLevel="elementary" />);
  const inTheTabOrder = () => screen.getAllByRole("tab").filter((tab) => tab.tabIndex === 0);
  assert.deepEqual(inTheTabOrder(), [screen.getByRole("tab", { selected: true })]);

  const steps: [string, string][] = [
    ["ArrowRight", "Level II(Inspectional)"],
    ["End", "Level IV(Syntopical)"],
    ["ArrowRight", "Level I(Elementary)"],
    ["ArrowLeft", "Level IV(Syntopical)"],
    ["Home", "Level I(Elementary)"],
  ];
  for (const [key, open] of steps) {
    fireEvent.keyDown(screen.getByRole("tab", { selected: true }), { key });
    assert.deepEqual(openTabs(), [open], `${key} did not open ${open}`);
    assert.equal(document.activeElement?.textContent, open, `${key} left the focus behind`);
    assert.equal(inTheTabOrder().length, 1, `${key} left more than one tab in the Tab order`);
  }

  const other = fireEvent.keyDown(screen.getByRole("tab", { selected: true }), { key: "a" });
  assert.equal(other, true, "a key that is not a tab key was taken from the page");
  assert.deepEqual(openTabs(), ["Level I(Elementary)"]);
});
