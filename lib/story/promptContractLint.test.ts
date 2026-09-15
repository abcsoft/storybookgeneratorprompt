import { describe, expect, it } from "vitest";
import { buildManifest } from "../manual/manifest";
import { lintPromptContract, lintSubmittedSpreadsMatchResolved } from "./promptContractLint";
import type { ChildProfile } from "./types";
import type { ManualPage } from "../manual/manifest";

const child: ChildProfile = { name: "Shihab", age: 4, gender: "boy" };

function basePage(overrides: Partial<ManualPage>): ManualPage {
  return {
    page: 1,
    index: 0,
    kind: "scene",
    filename: "01-x.png",
    prompt: "IDENTITY FIRST — ... TARGET ARTWORK FORMAT — Single page: ... closest provider preset: 4:3). ... COMPOSITION (single page) — ...",
    text: "story text",
    spread: false,
    aspect: "4:3",
    physicalPages: [1],
    ...overrides,
  };
}

describe("lintPromptContract — real Dream Big output passes clean", () => {
  it("standard-single manifest has no lint issues", () => {
    const manifest = buildManifest(child, "dream-big", "classic-landscape-11x8", "standard-single", []);
    const result = lintPromptContract(manifest);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("a spread manifest (Pages 22-23) has no lint issues", () => {
    const manifest = buildManifest(child, "dream-big", "classic-landscape-11x8", "custom-spreads", [
      { startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" },
    ]);
    const result = lintPromptContract(manifest);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("lintPromptContract — catches each reproduced defect class", () => {
  it("flags front-cover text leaking into a non-cover prompt", () => {
    const manifest = [
      basePage({ slotId: "25-backcover", kind: "backcover", filename: "25-backcover.png", physicalPages: [25], prompt: "TARGET ARTWORK FORMAT — front cover: ..." }),
    ];
    const result = lintPromptContract(manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /front-cover composition text/.test(i))).toBe(true);
  });

  it("flags a spread whose prompt has single-page composition rules", () => {
    const manifest = [
      basePage({
        slotId: "spread-02-03",
        spread: true,
        filename: "spread-02-03.png",
        physicalPages: [2, 3],
        prompt: "... closest provider preset: 21:9). ... COMPOSITION (single page) — ...",
        aspect: "21:9",
      }),
    ];
    const result = lintPromptContract(manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /lacks two-page spread composition/.test(i) || /single-page composition rules/.test(i))).toBe(true);
  });

  it("flags an aspect heading that contradicts the prompt body's own preset", () => {
    const manifest = [
      basePage({ aspect: "3:2", prompt: "... closest provider preset: 4:3). ... COMPOSITION (single page) — ..." }),
    ];
    const result = lintPromptContract(manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /contradicts the prompt body/.test(i))).toBe(true);
  });

  it("flags a career costume change coexisting with an unchanged-outfit claim", () => {
    const manifest = [
      basePage({
        prompt:
          "... The child's outfit changes to match the pilot career uniform, but ... WARDROBE CONTINUITY — the child wears the SAME outfit as every other page unless this scene calls for a different one: sweater. Keep this exact outfit, unchanged, in this picture. ... closest provider preset: 4:3). ... COMPOSITION (single page) — ...",
      }),
    ];
    const result = lintPromptContract(manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /contradictory wardrobe instructions/.test(i))).toBe(true);
  });

  it("flags a filename whose leading number doesn't match its own physical page", () => {
    const manifest = [basePage({ filename: "07-mismatch.png", physicalPages: [9] })];
    const result = lintPromptContract(manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /does not start with its own physical page/.test(i))).toBe(true);
  });

  it("flags two slots claiming the same physical page", () => {
    const manifest = [
      basePage({ slotId: "a", filename: "05-a.png", physicalPages: [5] }),
      basePage({ slotId: "b", filename: "05-b.png", physicalPages: [5] }),
    ];
    const result = lintPromptContract(manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /claimed by both/.test(i))).toBe(true);
  });

  it("flags a non-gapless physical page sequence", () => {
    const manifest = [
      basePage({ slotId: "a", filename: "01-a.png", physicalPages: [1] }),
      basePage({ slotId: "b", filename: "03-b.png", physicalPages: [3] }),
    ];
    const result = lintPromptContract(manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /gapless/.test(i))).toBe(true);
  });
});

describe("lintSubmittedSpreadsMatchResolved", () => {
  it("passes when the submitted spread is present in the resolved output", () => {
    const manifest = buildManifest(child, "dream-big", "classic-landscape-11x8", "custom-spreads", [
      { startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" },
    ]);
    const result = lintSubmittedSpreadsMatchResolved([{ startPage: 22, endPage: 23 }], manifest);
    expect(result.ok).toBe(true);
  });

  it("flags a submitted spread missing from the resolved output", () => {
    const manifest = buildManifest(child, "dream-big", "classic-landscape-11x8", "standard-single", []);
    const result = lintSubmittedSpreadsMatchResolved([{ startPage: 22, endPage: 23 }], manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /missing from the resolved output/.test(i))).toBe(true);
  });

  it("flags a resolved spread that was never submitted", () => {
    const manifest = buildManifest(child, "dream-big", "classic-landscape-11x8", "custom-spreads", [
      { startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" },
    ]);
    const result = lintSubmittedSpreadsMatchResolved([], manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /never submitted/.test(i))).toBe(true);
  });
});
