import { describe, expect, it } from "vitest";
import {
  singlePageCompositionRules,
  spreadCompositionRules,
} from "./compositionRules";

describe("singlePageCompositionRules", () => {
  it("requires edge safety margins and forbids partial body parts", () => {
    const rules = singlePageCompositionRules();
    expect(rules).toContain(
      "NO PARTIAL HUMAN OR ANIMAL BODY PART MAY ENTER FROM ANY EDGE",
    );
    expect(rules.toLowerCase()).toContain("lower-left");
  });
});

describe("spreadCompositionRules", () => {
  it("defines LEFT PAGE / CENTER GUTTER / RIGHT PAGE zones for text-left-subject-right", () => {
    const rules = spreadCompositionRules("text-left-subject-right");
    expect(rules).toContain("LEFT PAGE");
    expect(rules).toContain("CENTER GUTTER");
    expect(rules).toContain("RIGHT PAGE");
    expect(rules).toContain(
      "NO PARTIAL HUMAN OR ANIMAL BODY PART MAY ENTER FROM ANY EDGE",
    );
    expect(rules).toContain("10-12%");
  });

  it("forbids any subject/companion body part on the left (text) page", () => {
    const rules = spreadCompositionRules("text-left-subject-right");
    expect(rules.toLowerCase()).toContain("no stray");
  });

  it("falls back to the same safe zones for not-yet-rendered layout variants, with a note", () => {
    const rules = spreadCompositionRules("subject-left-text-right");
    expect(rules).toContain("LEFT PAGE");
    expect(rules).toContain("currently only renders");
  });
});
