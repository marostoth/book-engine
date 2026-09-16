import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { VaultGate } from "./components/VaultGate";
import { PreferencesGate } from "./components/PreferencesGate";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* The app starts only once the vault folder is known (LC-01), with the settings saved in it (DS-11). */}
    <VaultGate>
      <PreferencesGate>{(loaded) => <App startingPreferences={loaded} />}</PreferencesGate>
    </VaultGate>
  </React.StrictMode>
);
