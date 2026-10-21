import { defineConfig } from "vite";
import { resolve } from "node:path";

// Bundled, not tsc'd: a bare `lit` import in dist/ makes the card unloadable and HA
// shows only "Configuration error" (memory: cards-must-be-bundled). Guarded by
// test/dist-browser-loadable.test.ts.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    target: "es2021",
    rollupOptions: { external: [] },
    lib: {
      entry: resolve(import.meta.dirname, "src/panel-tools-card.ts"),
      formats: ["es"],
      fileName: () => "panel-tools-card.js",
    },
  },
});
