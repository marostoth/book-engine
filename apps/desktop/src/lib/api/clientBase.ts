// Detect if running inside a Tauri v2 Webview
export const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

export async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** The browser stand-in for the backend in `dev/`: sample books, sample notes, and browser storage. */
export type DevBackend = typeof import("./dev/devBackend.ts");

/**
 * Runs a backend command. Every API function calls the backend through here.
 *
 * Inside the app (Tauri), a failed command rejects with the backend's error. Nothing falls back to sample data or
 * browser storage, so the caller can show the error and keep the user's text.
 *
 * Outside Tauri, only a dev build (`npm run dev` in a browser) answers, with `inBrowserDev` and the stand-in. This
 * dynamic import is the only way the stand-in loads. A production build removes the `import.meta.env.DEV` branch,
 * so the built app contains no sample data.
 */
export async function callBackend<T>(
  cmd: string,
  args: Record<string, unknown> | undefined,
  inBrowserDev: (dev: DevBackend) => T | Promise<T>
): Promise<T> {
  if (isTauri) {
    return tauriInvoke<T>(cmd, args);
  }
  if (import.meta.env.DEV) {
    return inBrowserDev(await import("./dev/devBackend.ts"));
  }
  throw new Error(`The app backend is not available, so "${cmd}" did not run.`);
}
