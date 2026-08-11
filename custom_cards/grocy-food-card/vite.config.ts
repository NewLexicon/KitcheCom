import { defineConfig } from "vite";
import { resolve } from "node:path";

// WHY A BUNDLER AND NOT PLAIN `tsc` (2026-08-11):
// `tsc` emits import specifiers verbatim, so `import { LitElement } from "lit"`
// survived into dist/. A browser cannot resolve a BARE specifier — it throws
// "Failed to resolve module specifier \"lit\"", the module never evaluates, the
// custom element never registers, and Home Assistant reports only a generic
// "Configuration error" with no hint at the cause.
//
// This went unnoticed because both existing checks supplied a resolution that
// HA does not: Vitest resolves through node_modules, and demo/index.html
// declares an <script type="importmap"> mapping "lit" to a CDN. The card was
// verified in a browser and still could not load in HA.
//
// Bundling inlines lit (and shared.ts) into each card, so each built file is
// self-contained and needs nothing from the page. Guarded by
// test/dist-browser-loadable.test.ts.
//
// NOTE: each card is a SEPARATE entry, and shared.ts is deliberately inlined
// into each rather than emitted as a chunk. A shared chunk would reintroduce a
// second file that every card's resource entry depends on, and a relative
// import between resources is exactly the kind of thing that breaks when HA
// serves them from /local/. Self-contained files cost ~10 KB of duplication and
// remove a whole class of deployment failure.
// Which card this pass builds. `npm run build` invokes vite once per card.
const CARD = process.env.CARD;
if (!CARD) {
  throw new Error(
    'CARD env var is required (e.g. CARD=recipe-card vite build). Use `npm run build`.',
  );
}

export default defineConfig({
  build: {
    outDir: "dist",
    // Readable output: these are kitchen-appliance cards, not bandwidth-bound
    // web pages, and legible dist/ makes on-Pi debugging far easier.
    minify: false,
    target: "es2021",
    rollupOptions: {
      // Nothing is external — that is the entire point.
      external: [],
      output: {
        // Rollup's default is to hoist code shared between entries into its own
        // hashed chunk (`shared-DNWEGC0a.js`). That would leave each card
        // importing a sibling file whose NAME CHANGES EVERY BUILD — a second
        // resource to copy, and a stale-filename failure waiting to happen on
        // the Pi. Building ONE ENTRY PER PASS (below) avoids the shared chunk
        // entirely, so each card is a single self-contained file.
      },
    },
    // One card per invocation (see CARD below) so rollup never has two entries
    // to hoist a shared chunk out of. `npm run build` runs all three.
    lib: {
      entry: resolve(__dirname, `src/${CARD}.ts`),
      formats: ["es"],
      fileName: () => `${CARD}.js`,
    },
    // Each pass must not wipe the previous card's output.
    emptyOutDir: false,
  },
});
