import { test, vi } from "vitest";
import assert from "node:assert/strict";
import {
  MAX_BACKEND_ERRORS,
  currentBackendErrors,
  dismissBackendError,
  errorText,
  reportBackendError,
  subscribeBackendErrors,
  withBackendError,
} from "./backendErrors.ts";

test("the same failure again raises its count, and another failure adds a line", () => {
  let errors = withBackendError([], "Your reading time was not saved.", "database is locked", 1);
  errors = withBackendError(errors, "Your reading time was not saved.", "database is locked", 2);
  errors = withBackendError(errors, "Your chapter notes were not saved.", "database is locked", 3);
  assert.deepEqual(errors, [
    { id: 1, action: "Your reading time was not saved.", detail: "database is locked", count: 2 },
    { id: 3, action: "Your chapter notes were not saved.", detail: "database is locked", count: 1 },
  ]);
});

test("the error bar keeps only the newest errors", () => {
  let errors = withBackendError([], "Could not load the chapter.", "error 1", 1);
  for (let id = 2; id <= MAX_BACKEND_ERRORS + 2; id++) {
    errors = withBackendError(errors, "Could not load the chapter.", `error ${id}`, id);
  }
  assert.deepEqual(
    errors.map((error) => error.id),
    Array.from({ length: MAX_BACKEND_ERRORS }, (_, index) => index + 3)
  );
});

test("Tauri rejection values become readable text", () => {
  assert.equal(errorText("Failed to save notes: Access is denied."), "Failed to save notes: Access is denied.");
  assert.equal(errorText({ Io: "Access is denied." }), "Io: Access is denied.");
  assert.equal(errorText(new Error("disk full")), "disk full");
  assert.equal(errorText({ code: 5, reason: "busy" }), '{"code":5,"reason":"busy"}');
  assert.equal(errorText(undefined), "Unknown error");
});

test("a reported error shows in the bar until it is dismissed", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let changes = 0;
  const stop = subscribeBackendErrors(() => {
    changes++;
  });

  reportBackendError("Your chapter notes were not saved.", "save_notes failed");
  reportBackendError("Your chapter notes were not saved.", "save_notes failed");
  const [shown] = currentBackendErrors();
  assert.equal(shown.count, 2);
  assert.equal(shown.detail, "save_notes failed");

  dismissBackendError(shown.id);
  assert.deepEqual(currentBackendErrors(), []);

  stop();
  reportBackendError("Could not load your library.", "get_library_books failed");
  assert.equal(changes, 3);
});
