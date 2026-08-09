import { describe, expect, it } from "vitest";
import { wardrobeRules } from "./wardrobeRules";

describe("wardrobeRules", () => {
  it("returns an empty string when no outfit is configured", () => {
    expect(wardrobeRules(undefined)).toBe("");
  });

  it("instructs the same outfit every page, unless the scene calls for a different one", () => {
    const rules = wardrobeRules("a red cape and yellow boots");
    expect(rules).toContain("a red cape and yellow boots");
    expect(rules.toUpperCase()).toContain("SAME OUTFIT");
  });
});
