import React, { useEffect, useState } from "react";
import { FolderOpen, Library, RotateCcw, TriangleAlert } from "lucide-react";
import { chooseVaultFolder, getVaultStatus, type VaultStatus } from "../lib/api/vaultApi";
import { errorText } from "../lib/backendErrors";

interface VaultGateProps {
  /** Shown once the vault folder is known. */
  children: React.ReactNode;
}

/**
 * Holds the app back until the vault folder is known.
 *
 * An installed copy starts in its own install folder, where the old search found nothing, so the library
 * was empty and every save failed with no way to put it right (LC-01). The reader now picks the folder
 * once and the app remembers it.
 */
export const VaultGate: React.FC<VaultGateProps> = ({ children }) => {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [asking, setAsking] = useState<boolean>(false);
  const [problem, setProblem] = useState<string>("");

  const ask = () => {
    setProblem("");
    getVaultStatus()
      .then(setStatus)
      .catch((err) => {
        setStatus({ path: "", foundBy: "", message: "" });
        setProblem(errorText(err));
      });
  };

  useEffect(ask, []);

  const pick = () => {
    setAsking(true);
    setProblem("");
    chooseVaultFolder()
      .then((picked) => {
        // null means the reader closed the picker without choosing. Nothing changes.
        if (picked) setStatus(picked);
      })
      .catch((err) => setProblem(errorText(err)))
      .finally(() => setAsking(false));
  };

  if (status === null) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--theme-bg)] text-[var(--theme-muted)] text-sm">
        Looking for your vault...
      </div>
    );
  }

  if (status.path) return <>{children}</>;

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[var(--theme-bg)] text-[var(--theme-text)] p-8">
      <div className="max-w-md flex flex-col gap-5 text-center">
        <Library className="w-10 h-10 mx-auto text-[var(--theme-accent)]" />
        <h1 className="text-xl font-semibold">Where is your vault?</h1>
        <p className="text-sm leading-relaxed text-[var(--theme-muted)]">
          {status.message || "Your vault folder was not found."}
        </p>
        <p className="text-xs leading-relaxed text-[var(--theme-muted)]">
          Your vault is the folder that holds a <span className="font-mono">books</span> folder, with one folder per
          book. Your notes, highlights and study progress live there too. The app remembers your choice, so you only
          do this once.
        </p>

        {problem && (
          <div className="flex items-start gap-2 text-left text-xs rounded-md border border-red-500/40 bg-red-500/10 p-3 text-red-700 dark:text-red-300">
            <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{problem}</span>
          </div>
        )}

        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={pick}
            disabled={asking}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--theme-accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <FolderOpen className="w-4 h-4" />
            <span>{asking ? "Choosing..." : "Choose folder"}</span>
          </button>
          <button
            type="button"
            onClick={ask}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--theme-border)] text-sm hover:bg-[var(--theme-accent)]/10 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Look again</span>
          </button>
        </div>
      </div>
    </div>
  );
};
