import { describe, it, expect } from "vitest";
import { stripMediaUrlQuery } from "../src/screensaver-card";

describe("stripMediaUrlQuery", () => {
  it("returns a plain path unchanged", () => {
    expect(stripMediaUrlQuery("photo.jpg")).toBe("photo.jpg");
  });
  it("strips a query string", () => {
    expect(stripMediaUrlQuery("photo.jpg?token=abc")).toBe("photo.jpg");
  });
  it("strips a fragment", () => {
    expect(stripMediaUrlQuery("clip.mp4#t=10")).toBe("clip.mp4");
  });
  it("strips from the first of ? or # (query before fragment)", () => {
    expect(stripMediaUrlQuery("a.png?x=1#y")).toBe("a.png");
  });
  it("handles an empty string", () => {
    expect(stripMediaUrlQuery("")).toBe("");
  });
});
