import { test } from "vitest";
import assert from "node:assert/strict";

/**
 * How the app turns a picture named in a chapter into a URL the window can show.
 *
 * The app used to reach into `window.__TAURI_INTERNALS__` for this, Tauri's own private object. It now calls the
 * public `convertFileSrc` of `@tauri-apps/api/core` (RD-09). The public function reads the same private object, so
 * this test hands the app shell's own `convertFileSrc` in, and asks what comes out.
 */

/** Every path the shell was asked about, so the test can check it was given the whole path. */
const asked: { path: string; protocol: string }[] = [];

/** A stand-in for the app shell. The test keeps this reference, so it never has to cast `globalThis`. */
const shell = {
  invoke: async () => "C:/vault",
  convertFileSrc: (path: string, protocol: string): string => {
    asked.push({ path, protocol });
    return `${protocol}://localhost/${encodeURIComponent(path)}`;
  },
};

// The API modules look for Tauri when they load, so this window exists before they load.
Object.assign(globalThis, { window: { __TAURI_INTERNALS__: shell } });
const { resolveAssetUrl, getVaultPath } = await import("./api.ts");

test("a picture of a book becomes a URL the window can show", async () => {
  await getVaultPath();
  const url = resolveAssetUrl("a-book", "figure-3.png");
  assert.equal(url.startsWith("asset://localhost/"), true, `the URL was ${url}`);
  assert.equal(asked.length, 1, "the app must ask the shell exactly once");
  assert.equal(asked[0].protocol, "asset");
  assert.equal(
    asked[0].path,
    "C:/vault/books/a-book/assets/figure-3.png",
    "the shell needs the whole path, under the book's own assets folder"
  );
});

test("a picture already on the web is left alone", () => {
  const before = asked.length;
  for (const src of ["https://example.org/a.png", "asset://localhost/a.png", "data:image/png;base64,AA=="]) {
    assert.equal(resolveAssetUrl("a-book", src), src);
  }
  assert.equal(asked.length, before, "the shell must not be asked about a URL that is already one");
});

test("a picture with no name gives nothing back, not a URL of the vault root", () => {
  assert.equal(resolveAssetUrl("a-book", ""), "");
});

test("a path with backslashes and folders keeps only the file name", () => {
  const before = asked.length;
  resolveAssetUrl("a-book", "images\\chapter 3\\figure-3.png");
  assert.equal(
    asked[before].path,
    "C:/vault/books/a-book/assets/figure-3.png",
    "the assets folder is flat, so only the file name of the picture counts"
  );
});

test("the picture is given back unchanged when the shell cannot make a URL", () => {
  const working = shell.convertFileSrc;
  shell.convertFileSrc = () => {
    throw new Error("this shell has no asset protocol");
  };
  const printed = console.warn;
  console.warn = () => {};
  try {
    assert.equal(
      resolveAssetUrl("a-book", "figure-3.png"),
      "figure-3.png",
      "a shell that cannot make the URL must leave the chapter readable, not stop it"
    );
  } finally {
    console.warn = printed;
    shell.convertFileSrc = working;
  }
});
