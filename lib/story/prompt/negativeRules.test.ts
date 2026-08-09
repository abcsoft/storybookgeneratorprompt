import { describe, expect, it } from "vitest";
import { negativeRules } from "./negativeRules";

describe("negativeRules", () => {
  it("covers the centralized negative-prompt checklist", () => {
    const rules = negativeRules();
    const mustContain = [
      "crop",
      "duplicate the child",
      "extra fingers",
      "distorted hands",
      "outfit at random",
      "typography",
      "watermark",
      "center fold",
      "extreme close-up",
    ];
    for (const phrase of mustContain) {
      expect(rules.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });
});
