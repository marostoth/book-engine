import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PracticeCardItem } from "./practiceTypes.ts";
import { fallbackCardsMemory } from "./api/dev/mockData.ts";

// practiceContract.json is the exact JSON that `get_due_cards` returns for a scenario card.
// The Rust test `test_due_card_json_matches_frontend_contract` (src-tauri/src/db/mod.rs)
// fails when serde output drifts from this file, and these tests fail when the frontend does.
const contractCard = JSON.parse(
  readFileSync(new URL("./practiceContract.json", import.meta.url), "utf8"),
) as PracticeCardItem;

const sortedKeys = (value: object): string[] => Object.keys(value).sort();

test("scenario grading finds exactly one correct option in backend JSON", () => {
  const options = contractCard.scenario_payload?.options ?? [];
  const correctKeys = options.filter((option) => option.is_correct === true).map((option) => option.key);
  assert.deepStrictEqual(correctKeys, ["A"]);
});

test("browser mock scenario cards use the backend field names", () => {
  const mockCard = fallbackCardsMemory.find((card) => card.scenario_payload !== undefined);
  const mockPayload = mockCard?.scenario_payload;
  const contractPayload = contractCard.scenario_payload;
  assert.ok(mockCard && mockPayload && contractPayload, "expected a scenario card in both sources");
  assert.deepStrictEqual(sortedKeys(mockCard), sortedKeys(contractCard));
  assert.deepStrictEqual(sortedKeys(mockPayload), sortedKeys(contractPayload));
  assert.deepStrictEqual(sortedKeys(mockPayload.options[0]), sortedKeys(contractPayload.options[0]));
  assert.deepStrictEqual(sortedKeys(mockPayload.citation), sortedKeys(contractPayload.citation));
});
