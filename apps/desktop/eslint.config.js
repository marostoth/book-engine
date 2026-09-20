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

      // An `any` switches the type check off for everything it touches. There were 14 `as any` casts, and two of
      // them read backend fields that the backend never sends. The count is zero today, so the rule costs nothing
      // now and stops the next one (RD-09). A value from outside the window is typed `unknown` and checked in
      // `lib/backendShapes.ts` instead.
      "@typescript-eslint/no-explicit-any": "error",

      // State is never set inside an effect. An effect runs AFTER the drawing it belongs to reaches the screen, so
      // a form filled there is drawn empty first, and an answer cleared there is drawn under the next question
      // first. What a component starts with is worked out before it is built (`lib/formStart.ts`), a new thing to
      // show is a new `key`, and state that must go back to its start beside other state uses
      // `hooks/useStartAgainWhen.ts`. This was 30 warnings in 26 components; TL-11 closed all 30, so it is an
      // error now and cannot come back (TL-05).
      "react-hooks/set-state-in-effect": "error",

      // An effect, and a handler made once, names everything it reads. A name that is missing is a promise that the
      // value never changes, and nothing checked that promise: four windows listed the two values a helper of theirs
      // read instead of the helper, five listed half an object, and the reader reached down its own file for a
      // handler made later on. This was 12 `exhaustive-deps` warnings and 1 `immutability` warning; TL-11 closed all
      // 13, so both are errors now and cannot come back (TL-05).
      //
      // Adding a name can make an effect run more often, so each one was read with the component it belongs to, and
      // `nothingStaleIsShown.test.tsx` holds what each fix promises.
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/immutability": "error",

      // These two belong to React's newest rules, the ones written for its compiler. They are right, and each asks
      // for a component to be built a different way: the rest read or write a ref while the component is drawing.
      // They are warnings, so every run prints them and the number can only go down. TL-11 owns the work and turns
      // each one into an error as its last warning goes.
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
);
