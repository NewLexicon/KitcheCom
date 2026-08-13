import { defineConfig } from "vite";
import { resolve } from "node:path";

// WHY A BUNDLER AND NOT PLAIN `tsc` (2026-08-11):
// `tsc` emits import specifiers verbatim, so `import { LitElement } from "lit"`
// survived into dist/. A browser cannot resolve a BARE specifier — it throws
// "Failed to resolve module specifier \"lit\"", the module never evaluates, the
// custom element never registers, and Home Assistant reports only a generic
// "Configuration error".
//
// Found in the Grocy recipe card, which failed exactly this way in a real HA.
// This card had the identical `tsc`-only build and the same bare lit import,
// so it carried the same defect. See custom_cards/grocy-food-card/vite.config.ts
// and docs/session-state/2026-08-11-ha-gate-verification.md.
//
// Bundling inlines lit into the card, so the built file is self-contained and
// needs nothing from the page. Guarded by test/dist-browser-loadable.test.ts.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Readable output: this is a kiosk card, not a bandwidth-bound web page,
    // and legible dist/ makes on-Pi debugging far easier.
    minify: false,
    target: "es2021",
    rollupOptions: {
      // Nothing is external — that is the entire point.
      external: [],
    },
    lib: {
      // import.meta.dirname, not __dirname: vite warns that its future default
      // config loader cannot supply the CJS global.
      entry: resolve(import.meta.dirname, "src/screensaver-card.ts"),
      formats: ["es"],
      fileName: () => "screensaver-card.js",
    },
  },
});
