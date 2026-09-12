import { describe, expect, it } from "vitest";
import { negativeRules } from "./negativeRules";

describe("negativeRules", () => {
  it("covers the centralized negative-prompt checklist for single pages without spread fold mentions", () => {
    const rules = negativeRules(false);
    const mustContain = [
      "crop",
      "duplicate the child",
      "extra fingers",
      "distorted hands",
      "outfit at random",
      "typography",
      "watermark",
      "extreme close-up",
    ];
    for (const phrase of mustContain) {
      expect(rules.toLowerCase()).toContain(phrase.toLowerCase());
    }
    expect(rules.toLowerCase()).not.toContain("center fold");
  });

  it("includes center fold / gutter safety rule when isSpread is true", () => {
    const rules = negativeRules(true);
    expect(rules.toLowerCase()).toContain("center fold");
  });
});
