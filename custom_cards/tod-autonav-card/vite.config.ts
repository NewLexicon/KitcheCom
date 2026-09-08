import { defineConfig } from "vite";
import { resolve } from "node:path";

// WHY A BUNDLER AND NOT PLAIN `tsc`:
// `tsc` emits import specifiers verbatim, so `import { LitElement } from "lit"`
// survives into dist/. A browser cannot resolve a BARE specifier — it throws
// "Failed to resolve module specifier \"lit\"", the module never evaluates, the
// custom element never registers, and Home Assistant reports only a generic
// "Configuration error". Two cards in this repo shipped that defect.
// Guarded by test/dist-browser-loadable.test.ts.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    target: "es2021",
    rollupOptions: {
      external: [],
    },
    lib: {
      entry: resolve(import.meta.dirname, "src/tod-autonav-card.ts"),
      formats: ["es"],
      fileName: () => "tod-autonav-card.js",
    },
  },
});
