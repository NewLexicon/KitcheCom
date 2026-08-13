import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");

/** Every module a Lovelace resource can point at. */
const CARDS = ["recipe-card.js", "mealplan-card.js", "shopping-card.js"];

/** Matches a static `import ... from "spec"` / `import "spec"` and captures the specifier. */
const IMPORT_RE = /^\s*import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gm;

/** Browsers resolve only these. Anything else is a bare specifier and throws
 *  "Failed to resolve module specifier" at load, which HA surfaces as the
 *  generic "Configuration error" with no clue as to the cause. */
const isBrowserResolvable = (s: string) =>
  s.startsWith("./") || s.startsWith("../") || s.startsWith("/") ||
  s.startsWith("http://") || s.startsWith("https://");

describe("dist is loadable by a browser as a Lovelace resource", () => {
  // WHY THIS EXISTS: `tsc` emits import specifiers verbatim, so `import {...}
  // from "lit"` survived into dist/ and every card failed to load in Home
  // Assistant — while unit tests and the demo harness both passed, because
  // Vitest resolves through node_modules and the demo declares an importmap.
  // The defect was only visible in HA itself (2026-08-11). This test encodes
  // the browser's rule so a bundler regression cannot ship silently again.
  for (const card of CARDS) {
    it(`${card} has no bare import specifiers`, () => {
      const path = resolve(DIST, card);
      expect(existsSync(path), `${card} missing — run \`npm run build\` first`).toBe(true);

      const src = readFileSync(path, "utf8");
      const bare: string[] = [];
      for (const m of src.matchAll(IMPORT_RE)) {
        if (!isBrowserResolvable(m[1])) bare.push(m[1]);
      }

      expect(
        bare,
        `${card} imports ${JSON.stringify(bare)} which a browser cannot resolve. ` +
        `The build must bundle dependencies rather than emit bare specifiers.`,
      ).toEqual([]);
    });
  }

  // A relative import is browser-RESOLVABLE but still not DEPLOYABLE: rollup's
  // default is to hoist code shared between entries into a hashed sibling chunk
  // (`shared-DNWEGC0a.js`), whose name changes on every build. That would be a
  // second file to copy to /config/www/ and a stale-filename break waiting to
  // happen. Each card must be ONE self-contained file.
  for (const card of CARDS) {
    it(`${card} is self-contained (no sibling chunk imports)`, () => {
      const src = readFileSync(resolve(DIST, card), "utf8");
      const specs = [...src.matchAll(IMPORT_RE)].map((m) => m[1]);
      expect(
        specs,
        `${card} imports ${JSON.stringify(specs)}. Each card must inline its ` +
        `dependencies so a single file can be dropped into /config/www/.`,
      ).toEqual([]);
    });
  }

  it("recipe-card.js defines its custom element", () => {
    const src = readFileSync(resolve(DIST, "recipe-card.js"), "utf8");
    // Survives bundling/minification of the surrounding code.
    expect(src).toContain("grocy-recipe-card");
  });

  it("lit is actually inlined, not merely absent", () => {
    // Guards the failure mode where lit vanished because the import was
    // dropped rather than bundled — the element would silently never render.
    const src = readFileSync(resolve(DIST, "recipe-card.js"), "utf8");
    expect(src).toContain("customElements.define");
    expect(src.length).toBeGreaterThan(20_000);
  });
});
