import test from "node:test";
import assert from "node:assert/strict";
import type { ExitAssessmentPayload } from "./types.ts";
import {
  UNREADABLE_ASSESSMENT,
  createExitAssessmentKeeper,
  type ExitAssessmentState,
  type ExitAssessmentStore,
} from "./exitAssessment.ts";

/**
 * DS-09: the exit assessment comes from the reader's notes when a book opens, a saved assessment shows at once, and an
 * assessment that could not be read is never saved over.
 */

const assessment: ExitAssessmentPayload = {
  classification: "Theoretical - Social Science",
  unityStatement: "Specialization raises output, and the size of the market limits it.",
  partsStructure: ["The division of labour", "Money and prices", "Capital"],
  completedAt: "2026-09-16T10:00:00.000Z",
};

/** A promise that the test settles by hand. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A vault with the saved assessment of each book. It records every save. */
function vaultWith(saved: Record<string, ExitAssessmentPayload | null> = {}) {
  const saves: string[] = [];
  const store: ExitAssessmentStore = {
    getInspectionalExitAssessment: async (bookId) => saved[bookId] ?? null,
    saveInspectionalExitAssessment: async (bookId, next) => {
      saves.push(`${bookId}: ${next.unityStatement}`);
      saved[bookId] = next;
    },
  };
  return { store, saves };
}

/** What the screen shows, and every error the reader is told about. */
function screen() {
  const shown: (ExitAssessmentState | null)[] = [];
  const errors: string[] = [];
  return {
    shown,
    errors,
    show: (state: ExitAssessmentState | null) => shown.push(state),
    report: (action: string) => errors.push(action),
    now: () => shown[shown.length - 1],
  };
}

test("a book opens with the exit assessment the reader saved for it", async () => {
  const { store } = vaultWith({ smith: assessment });
  const view = screen();
  const keeper = createExitAssessmentKeeper(store, view.show, view.report);

  await keeper.bookOpened("smith");

  assert.deepEqual(view.now(), { bookId: "smith", status: "loaded", assessment });
});

test("a saved exit assessment shows at once, with no reload", async () => {
  const { store, saves } = vaultWith();
  const view = screen();
  const keeper = createExitAssessmentKeeper(store, view.show, view.report);
  await keeper.bookOpened("smith");
  assert.deepEqual(view.now(), { bookId: "smith", status: "loaded", assessment: null });

  await keeper.save("smith", assessment);

  assert.equal(saves.length, 1);
  assert.deepEqual(view.now(), { bookId: "smith", status: "loaded", assessment }, "the banner shows now, not after a reload");
});

test("an exit assessment that could not be read is never saved over, and the reader is told", async () => {
  const { store, saves } = vaultWith();
  store.getInspectionalExitAssessment = async () => {
    throw new Error("notes/smith/inspectional.json is damaged and was left as it is");
  };
  const view = screen();
  const keeper = createExitAssessmentKeeper(store, view.show, view.report);

  await keeper.bookOpened("smith");
  await assert.rejects(keeper.save("smith", assessment), { message: UNREADABLE_ASSESSMENT });

  assert.equal(saves.length, 0, "the unreadable assessment must stay as it is");
  assert.deepEqual(view.now(), { bookId: "smith", status: "unreadable" });
  assert.deepEqual(view.errors, ["Your exit assessment of this book could not be read, so a new one is not saved over it."]);
});

test("a slow answer for the book the reader left does not show under the book the reader opened", async () => {
  const { store } = vaultWith({ hume: null });
  const slowAdler = later<ExitAssessmentPayload | null>();
  const read = store.getInspectionalExitAssessment;
  store.getInspectionalExitAssessment = (bookId) => (bookId === "adler" ? slowAdler.promise : read(bookId));
  const view = screen();
  const keeper = createExitAssessmentKeeper(store, view.show, view.report);

  const adler = keeper.bookOpened("adler");
  await keeper.bookOpened("hume");
  slowAdler.resolve(assessment);
  await adler;

  assert.deepEqual(view.now(), { bookId: "hume", status: "loaded", assessment: null });
});

test("a save while the assessment is still being read waits for it", async () => {
  const { store, saves } = vaultWith();
  const slowRead = later<ExitAssessmentPayload | null>();
  store.getInspectionalExitAssessment = () => slowRead.promise;
  const view = screen();
  const keeper = createExitAssessmentKeeper(store, view.show, view.report);

  void keeper.bookOpened("smith");
  const saving = keeper.save("smith", assessment);
  slowRead.resolve(null);
  await saving;

  assert.equal(saves.length, 1);
  assert.deepEqual(view.now(), { bookId: "smith", status: "loaded", assessment });
});

test("a save that ends after the reader opened another book does not show under that book", async () => {
  const { store, saves } = vaultWith();
  const slowSave = later<void>();
  store.saveInspectionalExitAssessment = async (bookId, next) => {
    saves.push(`${bookId}: ${next.unityStatement}`);
    await slowSave.promise;
  };
  const view = screen();
  const keeper = createExitAssessmentKeeper(store, view.show, view.report);
  await keeper.bookOpened("smith");

  const saving = keeper.save("smith", assessment);
  await keeper.bookOpened("hume");
  slowSave.resolve();
  await saving;

  assert.equal(saves.length, 1, "the assessment is still saved for its own book");
  assert.deepEqual(view.now(), { bookId: "hume", status: "loaded", assessment: null });
});

test("a save that fails rejects, so the form keeps the answers, and the screen stays as it was", async () => {
  const { store } = vaultWith();
  store.saveInspectionalExitAssessment = async () => {
    throw new Error("the vault is not reachable");
  };
  const view = screen();
  const keeper = createExitAssessmentKeeper(store, view.show, view.report);
  await keeper.bookOpened("smith");

  await assert.rejects(keeper.save("smith", assessment), /the vault is not reachable/);

  assert.deepEqual(view.now(), { bookId: "smith", status: "loaded", assessment: null });
});
