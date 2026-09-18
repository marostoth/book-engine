import { test } from "vitest";
import assert from "node:assert/strict";

import { MIN_SEARCH_CHARACTERS, isSearchable } from "./searchQuery.ts";

test("a search needs at least 2 characters, and spaces at the start and the end do not count", () => {
  assert.equal(MIN_SEARCH_CHARACTERS, 2);
  for (const query of ["", "   ", "w", " w ", "\tC\n"]) {
    assert.equal(isSearchable(query), false, JSON.stringify(query));
  }
  for (const query of ["wa", "AI", " UK ", "C++", "U.S.", "a b"]) {
    assert.equal(isSearchable(query), true, JSON.stringify(query));
  }
});

test("a character outside the Basic Multilingual Plane counts once, as in the backend", () => {
  assert.equal(isSearchable("\u{1D538}"), false);
  assert.equal(isSearchable("\u{1D538}\u{1D539}"), true);
});
