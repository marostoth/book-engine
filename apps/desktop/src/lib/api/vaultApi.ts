import { callBackend } from "./clientBase.ts";

/** Where the vault folder is, or why it was not found. */
export interface VaultStatus {
  /** The vault folder, or "" when there is none. */
  path: string;
  /** How it was found, or "" when it was not. */
  foundBy: "saved" | "variable" | "nextToTheProgram" | "nearTheWorkingFolder" | "";
  /** What to tell the reader when there is no vault. Empty when there is one. */
  message: string;
}

/**
 * Asks where the vault is. The app asks this before it shows the library, because an installed copy used
 * to find nothing and every read and write failed with no way to fix it (LC-01).
 */
export async function getVaultStatus(): Promise<VaultStatus> {
  return callBackend<VaultStatus>("get_vault_status", undefined, (dev) => dev.getVaultStatus());
}

/**
 * Opens a folder picker and remembers what the reader chose.
 *
 * Returns the new status, or null when the reader closed the picker without choosing. A folder that is
 * not a vault is refused: the call rejects with a message that says what a vault looks like.
 */
export async function chooseVaultFolder(): Promise<VaultStatus | null> {
  return callBackend<VaultStatus | null>("choose_vault_folder", undefined, (dev) => dev.chooseVaultFolder());
}
