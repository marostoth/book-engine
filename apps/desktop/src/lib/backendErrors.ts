/** One failed backend load or save, as the error bar shows it. */
export interface BackendError {
  id: number;
  /** What failed, in words the reader knows, for example "Your chapter notes were not saved." */
  action: string;
  /** The backend's error text, or why the app did not save. */
  detail: string;
  /** How many times the same action failed with the same detail. */
  count: number;
}

/** The error bar keeps the newest errors, up to this number. */
export const MAX_BACKEND_ERRORS = 5;

/**
 * The readable text of a failed backend call. Tauri commands reject with a string (`Result<_, String>`) or with a
 * serialized `AppError` such as `{ "Io": "Access is denied." }`, not with an `Error`.
 */
export function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  if (typeof error === "string") {
    return error || "Unknown error";
  }
  if (error === null || error === undefined) {
    return "Unknown error";
  }
  if (typeof error === "object") {
    const fields = Object.entries(error);
    if (fields.length === 1 && typeof fields[0][1] === "string") {
      return `${fields[0][0]}: ${fields[0][1]}`;
    }
    try {
      return JSON.stringify(error);
    } catch {
      // A value that JSON cannot write gets its String() text.
    }
  }
  return String(error);
}

/** The error list after one more failure. The same action with the same detail again only raises its count. */
export function withBackendError(
  errors: readonly BackendError[],
  action: string,
  detail: string,
  id: number
): BackendError[] {
  const isSame = (error: BackendError) => error.action === action && error.detail === detail;
  if (errors.some(isSame)) {
    return errors.map((error) => (isSame(error) ? { ...error, count: error.count + 1 } : error));
  }
  return [...errors, { id, action, detail, count: 1 }].slice(-MAX_BACKEND_ERRORS);
}

let shownErrors: readonly BackendError[] = [];
let nextErrorId = 1;
const listeners = new Set<() => void>();

function showErrors(errors: readonly BackendError[]): void {
  shownErrors = errors;
  listeners.forEach((listener) => listener());
}

/**
 * Shows a failed load or save in the error bar (`components/BackendErrorBar.tsx`), and logs it. `error` is the
 * rejection value of the backend call, or a sentence that tells why the app did not save.
 */
export function reportBackendError(action: string, error: unknown): void {
  console.error(action, error);
  showErrors(withBackendError(shownErrors, action, errorText(error), nextErrorId++));
}

/** Removes one error from the error bar. */
export function dismissBackendError(id: number): void {
  showErrors(shownErrors.filter((error) => error.id !== id));
}

/** The errors that the bar shows now. The same list comes back until the errors change. */
export function currentBackendErrors(): readonly BackendError[] {
  return shownErrors;
}

/** Calls `listener` after each change to the errors. Gives the function that stops the calls. */
export function subscribeBackendErrors(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
