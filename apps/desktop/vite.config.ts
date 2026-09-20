import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tests (TL-03). `include` is a pattern, not a list of files, so a new test file runs the day it is written.
  // Before this, `npm test` named all 30 test files by hand, and a file left off that line never ran and said
  // nothing. A test that is not run is worse than no test, because it reads as cover that is not there.
  //
  // The default place is `node`, because 30 of these files test plain functions and a DOM would only slow them
  // down. A file that needs a DOM says so on its first line with `// @vitest-environment jsdom`, which is also
  // how a reader of that file learns it draws components.
  //
  // No `testTimeout` is named here, and that is a decision, not an omission (TL-12). Vitest's default is 5000 ms.
  // One test once went past it on a cold CI runner and read as broken; the fault was 360 date formatters inside the
  // test, and the same test now takes 2 ms. A longer timeout would have hidden that. A test slow enough to reach
  // 5000 ms is worth seeing.
  //
  // ONE test names a timeout of its own: "the date shown for a day is that day in every time zone" in
  // `lib/reviewDays.test.ts`. It went past 5000 ms on the CI runner of PR #85. It is the first test of that file to
  // touch `Intl`, so it pays the locale start-up the 360 formatters used to pay, and nothing can remove that cost.
  // Its own docstring carries the measurement. A timeout belongs on the one test that needs it, never here: a number
  // here would cover every test of the app and hide the next 360-formatter fault.
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    restoreMocks: true,
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@tiptap") || id.includes("prosemirror")) {
            return "vendor-editor";
          }
          // `@floating-ui` was named here as well. No file of the app ever imported it, so the name matched
          // nothing and the package was carried as a dependency for nothing (RD-09).
          if (id.includes("lucide-react")) {
            return "vendor-ui";
          }
        },
      },
    },
  },
});
