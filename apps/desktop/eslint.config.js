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

      // A ref is not read while a component is drawing. React does not draw again when a ref changes, so what
      // reaches the screen can be older than the ref. This was 5 warnings. Two were one fault: the pacer's drag
      // was handed the line the pacer was on, read out of a ref mid-drawing, and the copy it kept moved the
      // reader on a tap. The other three are things the app builds ONCE, whose handlers read a ref on a timer, a
      // promise or a click - long after the drawing that built them. The rule stops at the edge of the function
      // it is handed and says the ref "may" be read while drawing; it is not, so those three carry an
      // `eslint-disable-next-line` naming the reason, and `lib/nothingIsReadWhileDrawing.test.ts` is what checks
      // each reason is still true. TL-11 closed the rule, so it is an error now (TL-05).
      "react-hooks/refs": "error",

      // Drawing a component reads nothing outside it and changes nothing outside it. This one has had 0 warnings
      // since the linter was turned on, so nothing had to be fixed for it. It is an error so it stays at 0.
      "react-hooks/purity": "error",
    },
  },
);
