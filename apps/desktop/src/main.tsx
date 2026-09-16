import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { VaultGate } from "./components/VaultGate";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* The app starts only once the vault folder is known (LC-01). */}
    <VaultGate>
      <App />
    </VaultGate>
  </React.StrictMode>
);
