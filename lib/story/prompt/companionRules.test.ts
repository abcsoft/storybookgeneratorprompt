import { describe, expect, it } from "vitest";
import { companionRules } from "./companionRules";

describe("companionRules", () => {
  it("returns an empty string when there is no companion", () => {
    expect(companionRules(undefined)).toBe("");
    expect(companionRules(null)).toBe("");
  });

  it("states the companion's name and consistency rules exactly once", () => {
    const rules = companionRules({
      name: "Scout",
      description: "a small fluffy light-brown puppy",
      consistencyRules: "same floppy ears on every page",
    });
    expect(rules).toContain("Scout");
    expect(rules).toContain("same floppy ears on every page");
    expect(rules.match(/Scout/g)?.length).toBeGreaterThanOrEqual(1);
  });
});
