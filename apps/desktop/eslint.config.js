// What the JavaScript and TypeScript of the app is checked for (TL-05). There was no linter at all: `tsc` reads the
// types, and nothing read the rest, so a name nobody uses, a React hook called in the wrong place and a `let` that
// is never written to all went unseen.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "src-tauri"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // A name that starts with an underscore is one the code says it does not read.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],

      // These five belong to React's newest rules, the ones written for its compiler. They are right, and every
      // one of them asks for a component to be built a different way: 30 places set state inside an effect, and
      // the rest read or write a ref while the component is drawing. Changing 26 components at once, in the same
      // commit as a linter that was not there before, would change how the reader runs with nothing to catch it:
      // the 241 frontend tests read the functions of `src/lib`, not the components. They are warnings, so every
      // run prints them and the number can only go down. TL-11 in the review register owns that work (TL-05).
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      // A dependency that is missing changes how often an effect runs when it is added, so each one is read on its
      // own, with the component it belongs to. TL-11 owns these too.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
