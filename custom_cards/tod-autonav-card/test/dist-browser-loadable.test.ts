import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const CARD = "tod-autonav-card.js";

/** Matches a static `import ... from "spec"` / `import "spec"` and captures the specifier. */
const IMPORT_RE = /^\s*import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gm;

describe("dist is loadable by a browser as a Lovelace resource", () => {
  // WHY THIS EXISTS: `tsc` emits import specifiers verbatim, so `import {...}
  // from "lit"` survives into dist/ and the card cannot load in Home Assistant —
  // while unit tests still pass, because Vitest resolves through node_modules.
  // Two sibling cards in this repo failed exactly this way.
  it(`${CARD} has no imports at all — it must be self-contained`, () => {
    const path = resolve(DIST, CARD);
    expect(existsSync(path), `${CARD} missing — run \`npm run build\` first`).toBe(true);

    const specs = [...readFileSync(path, "utf8").matchAll(IMPORT_RE)].map((m) => m[1]);
    expect(
      specs,
      `${CARD} imports ${JSON.stringify(specs)}. A browser cannot resolve bare ` +
      `specifiers, and a relative sibling chunk is a second file to deploy. ` +
      `The build must inline dependencies.`,
    ).toEqual([]);
  });

  it("lit is actually inlined, not merely absent", () => {
    const src = readFileSync(resolve(DIST, CARD), "utf8");
    expect(src).toContain("customElements.define");
  });
});
