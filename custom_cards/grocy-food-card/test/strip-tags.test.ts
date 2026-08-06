import { describe, it, expect } from "vitest";
import { stripTags } from "../src/shared";

describe("stripTags", () => {
  it("THE load-bearing case: <ol><li> keeps step separation", () => {
    // A naive replace(/<[^>]*>/g,"") yields "PreheatMix" — unreadable (spec §5.4).
    expect(stripTags("<ol><li>Preheat</li><li>Mix</li></ol>")).toBe("Preheat\nMix");
  });
  it("paragraphs become newlines", () => {
    expect(stripTags("<p>Mix.</p><p>Fry.</p>")).toBe("Mix.\nFry.");
  });
  it("<br> and <br/> become newlines", () => {
    expect(stripTags("a<br>b<br/>c")).toBe("a\nb\nc");
  });
  it("collapses runs of blank lines to one", () => {
    expect(stripTags("<p>a</p><div></div><p>b</p>")).toBe("a\nb");
  });
  it("strips inline tags without adding separators", () => {
    expect(stripTags("Mix <b>well</b> now")).toBe("Mix well now");
  });
  it("plain text passes through unchanged (the OQ-S2-4 no-op case)", () => {
    expect(stripTags("Plain text, no markup.")).toBe("Plain text, no markup.");
  });
  it("fail-safe for nullish input (never throws)", () => {
    expect(stripTags(undefined)).toBe("");
    expect(stripTags(null)).toBe("");
    expect(stripTags("")).toBe("");
  });
});
