import React, { useSyncExternalStore } from "react";
import { TriangleAlert, X } from "lucide-react";
import { currentBackendErrors, dismissBackendError, subscribeBackendErrors } from "../lib/backendErrors";

/**
 * The error bar at the bottom of the app window. It shows every failed backend load or save that
 * `reportBackendError` receives, because the app never hides a failure behind sample data. A failure that happens
 * again raises its count instead of adding a line.
 */
export const BackendErrorBar: React.FC = () => {
  const errors = useSyncExternalStore(subscribeBackendErrors, currentBackendErrors);
  if (errors.length === 0) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-0 z-[60] max-h-[40vh] overflow-y-auto border-t-2 border-red-500/60 shadow-2xl select-text"
      style={{ backgroundColor: "var(--theme-surface)", color: "var(--theme-text)" }}
    >
      {errors.map((error) => (
        <div
          key={error.id}
          className="flex items-start gap-3 px-4 py-2.5 text-xs border-b border-red-500/15 last:border-b-0"
        >
          <TriangleAlert className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-red-700 dark:text-red-300">
              {error.action}
              {error.count > 1 && <span className="ml-1.5 font-mono font-normal">({error.count} times)</span>}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-[var(--theme-muted)] break-words">{error.detail}</p>
          </div>
          <button
            type="button"
            onClick={() => dismissBackendError(error.id)}
            className="flex flex-shrink-0 items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-red-500/10 transition-colors"
            title="Dismiss this error"
          >
            <X className="w-3 h-3" />
            <span>Dismiss</span>
          </button>
        </div>
      ))}
    </div>
  );
};
