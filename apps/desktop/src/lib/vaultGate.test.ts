import { test, onTestFinished } from "vitest";
import assert from "node:assert/strict";

/**
 * LC-01: the vault API talks to the backend, and the browser dev build never pretends to pick a folder.
 *
 * The screen itself (`components/VaultGate.tsx`) needs a DOM, which this repo has no test library for, so
 * these tests cover what the screen is built on: the two calls and the stand-in behind them.
 */

/** A fake Tauri window that records every command and answers with `answers`. */
function fakeTauri(answers: Record<string, unknown>) {
  const calls: { cmd: string; args: unknown }[] = [];
  (globalThis as Record<string, unknown>).window = {
    __TAURI_INTERNALS__: {
      invoke: (cmd: string, args: unknown) => {
        calls.push({ cmd, args });
        if (cmd in answers) {
          const answer = answers[cmd];
          return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
        }
        return Promise.reject(new Error(`no answer set for ${cmd}`));
      },
    },
  };
  return calls;
}

test("the app asks the backend where the vault is", async () => {
  const calls = fakeTauri({
    get_vault_status: { path: "D:\\Books\\vault", foundBy: "saved", message: "" },
  });
  onTestFinished(() => {
    delete (globalThis as Record<string, unknown>).window;
  });
  const { getVaultStatus } = await import("./api/vaultApi.ts");

  const status = await getVaultStatus();

  assert.deepEqual(calls, [{ cmd: "get_vault_status", args: {} }], "one call, no arguments");
  assert.equal(status.path, "D:\\Books\\vault");
  assert.equal(status.foundBy, "saved", "the app can tell the reader where the folder came from");
});

test("no vault comes back as an empty path and a message to show", async () => {
  fakeTauri({
    get_vault_status: {
      path: "",
      foundBy: "",
      message: 'Your vault folder was not found. Choose it in the app: it is the folder that has a "books" folder inside it.',
    },
  });
  onTestFinished(() => {
    delete (globalThis as Record<string, unknown>).window;
  });
  const { getVaultStatus } = await import("./api/vaultApi.ts");

  const status = await getVaultStatus();

  assert.equal(status.path, "", "an empty path is what holds the app back");
  assert.match(status.message, /books/, "and the message says what to look for");
});

test("choosing a folder asks the backend to open the picker", async () => {
  const calls = fakeTauri({
    choose_vault_folder: { path: "D:\\Books\\vault", foundBy: "saved", message: "" },
  });
  onTestFinished(() => {
    delete (globalThis as Record<string, unknown>).window;
  });
  const { chooseVaultFolder } = await import("./api/vaultApi.ts");

  const picked = await chooseVaultFolder();

  assert.deepEqual(calls, [{ cmd: "choose_vault_folder", args: {} }], "one call, no arguments");
  assert.equal(picked?.path, "D:\\Books\\vault");
});

test("closing the picker without choosing changes nothing", async () => {
  fakeTauri({ choose_vault_folder: null });
  onTestFinished(() => {
    delete (globalThis as Record<string, unknown>).window;
  });
  const { chooseVaultFolder } = await import("./api/vaultApi.ts");

  assert.equal(await chooseVaultFolder(), null, "null means the reader closed the picker");
});

test("a folder that is not a vault is refused, and the message reaches the reader", async () => {
  fakeTauri({
    choose_vault_folder: new Error(
      'D:\\Downloads is not a vault folder. A vault has a "books" folder inside it, with one folder per book.'
    ),
  });
  onTestFinished(() => {
    delete (globalThis as Record<string, unknown>).window;
  });
  const { chooseVaultFolder } = await import("./api/vaultApi.ts");
  const { errorText } = await import("./backendErrors.ts");

  const failure = await chooseVaultFolder().then(
    () => null,
    (err: unknown) => errorText(err)
  );

  assert.match(failure ?? "", /not a vault folder/, "the reader must be told why");
  assert.match(failure ?? "", /books/, "and what a vault looks like");
});

test("the browser dev build never pretends to pick a folder", async () => {
  const { getVaultStatus, chooseVaultFolder } = await import("./api/dev/fallbackVault.ts");

  assert.equal(chooseVaultFolder(), null, "a browser cannot open a folder picker");
  assert.notEqual(getVaultStatus().path, "", "but the dev build still starts, on its sample data");
});
