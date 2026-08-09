import { describe, expect, it } from "vitest";
import {
  buildCorrectionPrompt,
  CORRECTION_ISSUES,
  issueInstruction,
} from "./buildCorrectionPrompt";

const ORIGINAL = "IDENTITY FIRST — match the real child... SCENE: riding a whale.";

describe("CORRECTION_ISSUES", () => {
  it("has all 11 catalog flags plus custom", () => {
    const ids = CORRECTION_ISSUES.map((i) => i.id);
    expect(ids).toEqual([
      "subject-cropped",
      "wrong-face",
      "wrong-outfit",
      "wrong-companion",
      "extra-character",
      "stray-body-part",
      "too-close-to-edge",
      "crossed-gutter",
      "wrong-spread-side",
      "bad-composition",
      "too-close-up",
    ]);
  });

  it("has no catalog entry for 'custom' — it's handled via customNote", () => {
    expect(issueInstruction("custom")).toBeUndefined();
  });
});

describe("buildCorrectionPrompt", () => {
  it("carries the original prompt through verbatim", () => {
    const result = buildCorrectionPrompt({ originalPrompt: ORIGINAL, issues: [] });
    expect(result).toContain(ORIGINAL);
  });

  it("never rewrites or duplicates the scene — the original prompt appears exactly once", () => {
    const result = buildCorrectionPrompt({
      originalPrompt: ORIGINAL,
      issues: ["subject-cropped", "wrong-outfit"],
    });
    expect(result.split(ORIGINAL).length - 1).toBe(1);
  });

  it("includes the instruction text for every selected issue", () => {
    const result = buildCorrectionPrompt({
      originalPrompt: ORIGINAL,
      issues: ["wrong-face", "stray-body-part"],
    });
    expect(result).toContain(issueInstruction("wrong-face"));
    expect(result).toContain(issueInstruction("stray-body-part"));
    expect(result).not.toContain(issueInstruction("wrong-outfit"));
  });

  it("subject-cropped explicitly asks for a wider camera, full subject, and 10-12% margin", () => {
    const result = buildCorrectionPrompt({
      originalPrompt: ORIGINAL,
      issues: ["subject-cropped"],
    });
    expect(result).toContain("WIDER camera");
    expect(result).toContain("fully inside the frame");
    expect(result).toContain("10-12%");
    expect(result.toLowerCase()).toContain("do not introduce any new characters");
  });

  it("crossed-gutter and wrong-spread-side both explicitly restore the spread layout", () => {
    const gutter = buildCorrectionPrompt({ originalPrompt: ORIGINAL, issues: ["crossed-gutter"] });
    const side = buildCorrectionPrompt({ originalPrompt: ORIGINAL, issues: ["wrong-spread-side"] });
    expect(gutter).toContain("text-left / subject-right layout");
    expect(side).toContain("text-left / subject-right layout");
  });

  it("includes a free-text custom note when given", () => {
    const result = buildCorrectionPrompt({
      originalPrompt: ORIGINAL,
      issues: ["custom"],
      customNote: "The puppy has three ears.",
    });
    expect(result).toContain("The puppy has three ears.");
  });

  it("omits the ISSUES section entirely when no issues are selected", () => {
    const result = buildCorrectionPrompt({ originalPrompt: ORIGINAL, issues: [] });
    expect(result).not.toContain("ISSUES TO FIX");
  });

  it("always keeps the preamble insisting on identity/outfit/companion/scene preservation", () => {
    const result = buildCorrectionPrompt({ originalPrompt: ORIGINAL, issues: ["bad-composition"] });
    expect(result.toLowerCase()).toContain("keep the exact same identity");
  });
});
