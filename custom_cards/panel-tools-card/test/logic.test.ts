import { describe, it, expect } from "vitest";
import { topLevelFilename, hexEncodeUtf8, isSupportedName, isVideoName, isValidPin, checkPin, pageSlice, findSkipped, stepMinutes, toTimeInput, fromTimeInput, parseShellResponse, showSleepHint, ENTITIES } from "../src/logic";

const ROOT = "media-source://media_source/local/photos";

describe("topLevelFilename", () => {
  it("returns the raw name for a top-level file", () => {
    expect(topLevelFilename(`${ROOT}/Rowan's birthday.jpg`, "photos")).toBe("Rowan's birthday.jpg");
  });
  it("does NOT percent-decode — HA ids are raw paths (local_source.py:250)", () => {
    expect(topLevelFilename(`${ROOT}/50%off.jpg`, "photos")).toBe("50%off.jpg");
    expect(topLevelFilename(`${ROOT}/a%20b.jpg`, "photos")).toBe("a%20b.jpg");
  });
  it("returns null for a file in a subfolder (hide is top-level only)", () => {
    expect(topLevelFilename(`${ROOT}/trip/a.jpg`, "photos")).toBeNull();
  });
  it("does not mistake the sibling hidden folder for the photos folder", () => {
    expect(topLevelFilename("media-source://media_source/local/photos-hidden/a.jpg", "photos")).toBeNull();
  });
  it("returns null for the folder itself", () => {
    expect(topLevelFilename(ROOT, "photos")).toBeNull();
    expect(topLevelFilename(`${ROOT}/`, "photos")).toBeNull();
  });
});

describe("hexEncodeUtf8", () => {
  it("encodes ASCII", () => {
    expect(hexEncodeUtf8("a b")).toBe("612062");
  });
  it("encodes UTF-8 bytes, not UTF-16 code units", () => {
    expect(hexEncodeUtf8("é")).toBe("c3a9");
  });
  it("encodes an emoji as its four UTF-8 bytes", () => {
    expect(hexEncodeUtf8("🐟")).toBe("f09f909f");
  });
  it("emits only lowercase hex, whatever the name contains", () => {
    expect(hexEncodeUtf8(`Rowan's "best" day.jpg`)).toMatch(/^[0-9a-f]+$/);
  });
});

describe("isSupportedName / isVideoName", () => {
  it("accepts the screensaver's extensions, case-insensitively", () => {
    expect(isSupportedName("a.JPG")).toBe(true);
    expect(isSupportedName("clip.webm")).toBe(true);
  });
  it("rejects HEIC", () => {
    expect(isSupportedName("IMG_3702.HEIC")).toBe(false);
  });
  it("judges a name containing # or ? by its real extension", () => {
    expect(isSupportedName("Party #2.jpg")).toBe(true);
    expect(isSupportedName("what?.png")).toBe(true);
  });
  it("identifies videos", () => {
    expect(isVideoName("clip.MP4")).toBe(true);
    expect(isVideoName("a.jpg")).toBe(false);
  });
});

describe("PIN", () => {
  it("a valid configured PIN is exactly four digits", () => {
    expect(isValidPin("0412")).toBe(true);
    expect(isValidPin("412")).toBe(false);
    expect(isValidPin("04a2")).toBe(false);
    expect(isValidPin("")).toBe(false);
  });
  it("matches only the configured PIN", () => {
    expect(checkPin("0412", "0412")).toBe(true);
    expect(checkPin("0413", "0412")).toBe(false);
  });
  it("never matches when the configured PIN is invalid (fails closed)", () => {
    expect(checkPin("", "")).toBe(false);
    expect(checkPin("412", "412")).toBe(false);
  });
});

describe("pageSlice", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  it("slices a page and reports the page count", () => {
    expect(pageSlice(items, 1, 12)).toEqual({ items: items.slice(12, 24), page: 1, pages: 3 });
  });
  it("clamps an out-of-range page (list shrank after a hide)", () => {
    expect(pageSlice(items, 9, 12).page).toBe(2);
    expect(pageSlice(items, -1, 12).page).toBe(0);
  });
  it("an empty list is one empty page", () => {
    expect(pageSlice([], 0, 12)).toEqual({ items: [], page: 0, pages: 1 });
  });
});

describe("findSkipped", () => {
  it("lists files on disk that are not in rotation", () => {
    expect(findSkipped(["a.jpg", "b.heic"], ["a.jpg"])).toEqual(["b.heic"]);
  });
  it("lists files HA puts in rotation that the panel cannot show", () => {
    expect(findSkipped(["c.heic"], ["c.heic"])).toEqual(["c.heic"]);
  });
  it("is empty when everything on disk shows", () => {
    expect(findSkipped(["a.jpg", "v.mp4"], ["a.jpg", "v.mp4"])).toEqual([]);
  });
  it("is sorted", () => {
    expect(findSkipped(["z.heic", "a.heic"], [])).toEqual(["a.heic", "z.heic"]);
  });
});

describe("stepMinutes", () => {
  it("steps by the delta", () => {
    expect(stepMinutes("30.0", 5)).toBe(35);
    expect(stepMinutes("30", -5)).toBe(25);
  });
  it("clamps to 5..120", () => {
    expect(stepMinutes("5", -5)).toBe(5);
    expect(stepMinutes("120", 5)).toBe(120);
  });
  it("treats an unknown state as the 30-minute default", () => {
    expect(stepMinutes("unknown", 5)).toBe(35);
    expect(stepMinutes(undefined, 0)).toBe(30);
  });
});

describe("time formats", () => {
  it("HA state -> <input type=time> value", () => {
    expect(toTimeInput("06:30:00")).toBe("06:30");
    expect(toTimeInput("unknown")).toBe("");
    expect(toTimeInput(undefined)).toBe("");
  });
  it("<input type=time> value -> input_datetime.set_datetime time", () => {
    expect(fromTimeInput("06:30")).toBe("06:30:00");
    expect(fromTimeInput("")).toBeNull();
    expect(fromTimeInput("25:00")).toBeNull();
  });
});

describe("parseShellResponse", () => {
  const wrap = (stdout: string) => ({ response: { stdout, stderr: "", returncode: 0 } });
  it("parses a successful listing", () => {
    expect(parseShellResponse(wrap('{"ok": true, "photos": ["a.jpg"], "hidden": []}')))
      .toEqual({ ok: true, photos: ["a.jpg"], hidden: [] });
  });
  it("passes a script rejection through", () => {
    expect(parseShellResponse(wrap('{"ok": false, "error": "no such photo"}')))
      .toEqual({ ok: false, error: "no such photo" });
  });
  it("turns garbage or a missing response into an error, never a throw", () => {
    expect(parseShellResponse(wrap("Traceback ...")).ok).toBe(false);
    expect(parseShellResponse(undefined).ok).toBe(false);
  });
});

describe("showSleepHint", () => {
  it("is shown when the screensaver switch is off — sleep can't work without idle", () => {
    expect(showSleepHint("off")).toBe(true);
  });
  it("is shown when the switch is missing or unavailable", () => {
    expect(showSleepHint(undefined)).toBe(true);
    expect(showSleepHint("unavailable")).toBe(true);
  });
  it("is hidden when the screensaver switch is on", () => {
    expect(showSleepHint("on")).toBe(false);
  });
});

describe("sleep entity ids", () => {
  it("match the HA sleep package and the screensaver safety switch", () => {
    expect(ENTITIES.sleepEnabled).toBe("input_boolean.kitchen_sleep_enabled");
    expect(ENTITIES.sleepStart).toBe("input_datetime.kitchen_sleep_start");
    expect(ENTITIES.sleepEnd).toBe("input_datetime.kitchen_sleep_end");
    expect(ENTITIES.screensaverEnabled).toBe("input_boolean.kitchen_screensaver_enabled");
  });
});
