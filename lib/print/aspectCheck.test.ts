import { describe, expect, it } from "vitest";
import {
  ASPECT_SQUARE_BAND,
  ASPECT_WARN_THRESHOLD,
  classifyAspectMatch,
  orientationOf,
  parseAspect,
  relativeDiff,
} from "./aspectCheck";

describe("parseAspect", () => {
  it("parses W:H strings into a width/height ratio", () => {
    expect(parseAspect("1:1")).toBe(1);
    expect(parseAspect("2:1")).toBe(2);
    expect(parseAspect("3:2")).toBeCloseTo(1.5);
  });

  it("falls back to 1 for a malformed string", () => {
    expect(parseAspect("nonsense")).toBe(1);
  });
});

describe("relativeDiff", () => {
  it("is 0 for an exact match", () => {
    expect(relativeDiff(2, 2)).toBe(0);
  });
  it("is proportional to the difference relative to expected", () => {
    expect(relativeDiff(1.5, 1)).toBeCloseTo(0.5);
    expect(relativeDiff(0.5, 1)).toBeCloseTo(0.5);
  });
});

describe("orientationOf", () => {
  it("reads a ratio well above 1 as landscape", () => {
    expect(orientationOf(1.5)).toBe("landscape");
    expect(orientationOf(2)).toBe("landscape");
  });
  it("reads a ratio well below 1 as portrait", () => {
    expect(orientationOf(0.67)).toBe("portrait");
    expect(orientationOf(0.5)).toBe("portrait");
  });
  it("reads ratios within the square band as square", () => {
    expect(orientationOf(1)).toBe("square");
    expect(orientationOf(1 + ASPECT_SQUARE_BAND - 0.01)).toBe("square");
    expect(orientationOf(1 - ASPECT_SQUARE_BAND + 0.01)).toBe("square");
  });
  it("reads ratios just outside the square band as landscape/portrait", () => {
    expect(orientationOf(1 + ASPECT_SQUARE_BAND + 0.01)).toBe("landscape");
    expect(orientationOf(1 - ASPECT_SQUARE_BAND - 0.01)).toBe("portrait");
  });
});

describe("classifyAspectMatch — the exact scenarios from the Printify bug report", () => {
  it("a 3:2 landscape source for a square (1:1) page is a warning, not an error", () => {
    expect(classifyAspectMatch(3 / 2, parseAspect("1:1"))).toBe("warn");
  });

  it("a landscape source for a square page never hard-errors merely for not being 1:1", () => {
    expect(classifyAspectMatch(16 / 9, parseAspect("1:1"))).toBe("warn");
    expect(classifyAspectMatch(21 / 9, parseAspect("1:1"))).toBe("warn");
  });

  it("a portrait source for a wide (2:1) spread is an error", () => {
    expect(classifyAspectMatch(2 / 3, parseAspect("2:1"))).toBe("error");
  });

  it("16:9 for a 2:1 spread is a warning (close but not within tolerance)", () => {
    const result = classifyAspectMatch(16 / 9, parseAspect("2:1"));
    expect(result).not.toBe("error");
  });

  it("a portrait source for a square (1:1) page is a warning, not an error", () => {
    // Square is compatible with either orientation — only the opposite pair
    // (portrait vs. landscape) is a hard error.
    expect(classifyAspectMatch(2 / 3, parseAspect("1:1"))).toBe("warn");
  });

  it("a near-exact match is ok", () => {
    expect(classifyAspectMatch(1, parseAspect("1:1"))).toBe("ok");
    expect(classifyAspectMatch(2.05, parseAspect("2:1"))).toBe("ok");
  });

  it("stays ok right at the warn threshold boundary, warns just past it", () => {
    const expected = 1;
    const justInside = expected * (1 + ASPECT_WARN_THRESHOLD - 0.001);
    const justOutside = expected * (1 + ASPECT_WARN_THRESHOLD + 0.02);
    expect(classifyAspectMatch(justInside, expected)).toBe("ok");
    expect(classifyAspectMatch(justOutside, expected)).toBe("warn");
  });

  it("a landscape source for a wide spread stays ok/warn depending on closeness, never errors", () => {
    expect(classifyAspectMatch(3 / 2, parseAspect("2:1"))).not.toBe("error");
  });

  it("is symmetric: a landscape-expected page with a portrait source also errors", () => {
    expect(classifyAspectMatch(2 / 3, parseAspect("21:9"))).toBe("error");
  });
});
