import { describe, expect, it } from "vitest";
import {
  buildFramingBlock,
  singlePageCompositionRules,
  spreadCompositionRules,
} from "./compositionRules";

describe("singlePageCompositionRules", () => {
  it("requires edge safety margins and forbids partial body parts", () => {
    const rules = singlePageCompositionRules();
    expect(rules).toContain(
      "NO PARTIAL HUMAN OR ANIMAL BODY PART MAY ENTER FROM ANY EDGE",
    );
    expect(rules.toLowerCase()).toContain("lower portion calm");
    expect(rules).toContain("TRANSFORMATION CROP SAFETY");
  });

  it("buildFramingBlock supports sleeping/bed-covered without demanding feet or legs", () => {
    const block = buildFramingBlock("sleeping/bed-covered");
    expect(block).toContain("FRAMING (sleeping/bed-covered)");
    expect(block).toContain("tucked comfortably under soft blankets or bedcovers");
    expect(block).toContain("Require natural visible anatomy only for body parts actually outside the bedding");
    expect(block).not.toContain("two visible legs");
    expect(block).not.toContain("visible feet");
    expect(block).not.toContain("visible legs");
    expect(block).not.toContain("active arms");
  });
});

describe("spreadCompositionRules", () => {
  it("enforces continuous panoramic scene contract with dynamic text-left subject-right instructions", () => {
    const rules = spreadCompositionRules("text-left-subject-right");
    expect(rules).toContain("Create one uninterrupted panoramic scene across one wide canvas");
    expect(rules).toContain("This is not a diptych, split-screen, collage, book mockup, or two separate panels");
    expect(rules).toContain("Do not draw a fold, line, border, seam, page edge, or lighting transition at the midpoint");
    expect(rules).toContain("Reserve the LEFT-HAND region as calm, low-detail environmental space");
    expect(rules).toContain("Place the complete child safely within the RIGHT-HAND subject-side region");
    expect(rules).toContain("central gutter-safe zone");
    expect(rules).toContain(
      "NO PARTIAL HUMAN OR ANIMAL BODY PART MAY ENTER FROM ANY EDGE",
    );
    expect(rules).toContain("10–12%");
  });

  it("dynamically generates subject-left text-right instructions when requested", () => {
    const rules = spreadCompositionRules("subject-left-text-right");
    expect(rules).toContain("Reserve the RIGHT-HAND region as calm, low-detail environmental space");
    expect(rules).toContain("Place the complete child safely within the LEFT-HAND subject-side region");
  });

  it("handles full-art-no-text spreads with balanced composition", () => {
    const rules = spreadCompositionRules("full-art-no-text");
    expect(rules).toContain("full-art spread with no story text");
    expect(rules).toContain("balanced composition");
    expect(rules).toContain("central gutter-safe zone");
  });
});
