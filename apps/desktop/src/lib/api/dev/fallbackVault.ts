import type { VaultStatus } from "../vaultApi.ts";

/**
 * Browser stand-in for `get_vault_status`. A dev build in a browser has no vault folder and no folder
 * picker, so it says it found one. The sample data behind it comes from the other stand-ins.
 */
export function getVaultStatus(): VaultStatus {
  return { path: "(a browser dev build has no vault folder)", foundBy: "nearTheWorkingFolder", message: "" };
}

/** Browser stand-in for `choose_vault_folder`. A browser cannot open a folder picker, so nothing is chosen. */
export function chooseVaultFolder(): null {
  return null;
}
