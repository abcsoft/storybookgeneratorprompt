/**
 * Regression coverage for the Custom Spreads truthfulness/geometry bugs
 * found in a live "Dream Big + Classic Landscape 11x8 + Pages 22-23" run:
 *
 * - The backcover prompt leaked front-cover composition text (wrong "kind"
 *   branch in buildTargetFormatBlock).
 * - Career-scene prompts simultaneously said "outfit changes to match the
 *   career uniform" AND "keep this exact [everyday sweater] outfit
 *   unchanged" (wardrobeRules always ran regardless of the scene's own
 *   costume note).
 * - The single-page aspect heading said "3:2" while the prompt body's own
 *   "closest provider preset" said "4:3" (ASPECT_SINGLE had drifted from
 *   PROVIDER_PRESET_ASPECT_SINGLE).
 * - Selecting a spread silently grows total physical pages (22 -> 23, then
 *   closing/backcover shift to 24/25) with nothing in the Markdown header
 *   explaining why filenames jump past the stated image count.
 *
 * These tests assert the invariants a correct Custom Spreads resolution
 * must hold for the Dream Big template, independent of the live browser.
 */

import { describe, expect, it } from "vitest";
import { buildManifest, renderPromptsMarkdown } from "../manual/manifest";
import { resolveLayoutPlan } from "./layoutPlan";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Shihab", age: 4, gender: "boy" };
const bookId = "dream-big";
const profileId = "classic-landscape-11x8";

/** Every scene's stable identity, independent of which physical page or
 *  asset kind (single vs spread half) it ends up resolved to. */
function sceneIdentities(manifest: ReturnType<typeof buildManifest>): string[] {
  return manifest.map((m) => m.role ?? m.kind).sort();
}

describe("Dream Big custom-spreads physical-page integrity", () => {
  it("standard-single: 24 assets, physical pages 1..24 unique and consecutive", () => {
    const manifest = buildManifest(child, bookId, profileId, "standard-single", []);
    expect(manifest.length).toBe(24);
    const allPages = manifest.flatMap((m) => m.physicalPages ?? []).sort((a, b) => a - b);
    expect(allPages).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    const backcover = manifest.find((m) => m.kind === "backcover")!;
    expect(backcover.physicalPages).toEqual([24]);
    expect(backcover.filename).toBe("24-backcover.png");
  });

  it("one spread (Pages 22-23): physical pages 1..25 unique and consecutive, no collision", () => {
    const manifest = buildManifest(child, bookId, profileId, "custom-spreads", [
      { startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" },
    ]);
    const allPages = manifest.flatMap((m) => m.physicalPages ?? []).sort((a, b) => a - b);
    expect(allPages).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    // No physical page claimed by more than one asset.
    expect(new Set(allPages).size).toBe(allPages.length);
  });

  it("a spread never drops or duplicates a story scene — same 22 interior scenes present either way", () => {
    const single = buildManifest(child, bookId, profileId, "standard-single", []);
    const spread = buildManifest(child, bookId, profileId, "custom-spreads", [
      { startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" },
    ]);
    // Interior scenes only (exclude cover/backcover, which don't change).
    const singleInterior = sceneIdentities(single.filter((m) => m.kind !== "cover" && m.kind !== "backcover"));
    const spreadInterior = sceneIdentities(spread.filter((m) => m.kind !== "cover" && m.kind !== "backcover"));
    expect(spreadInterior).toEqual(singleInterior);
  });

  it("a slot's filename always encodes its own actual physical page(s), never a stale number", () => {
    const manifest = buildManifest(child, bookId, profileId, "custom-spreads", [
      { startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" },
    ]);
    for (const m of manifest) {
      if (m.kind === "cover" || (m.physicalPages?.length ?? 0) === 0) continue;
      const firstPage = m.physicalPages![0];
      const leadingNumber = m.filename.match(/(\d+)/)?.[1];
      expect(leadingNumber, `${m.filename} should start with its physical page ${firstPage}`).toBe(
        String(firstPage).padStart(2, "0"),
      );
    }
  });

  it("multiple non-overlapping spreads all resolve — none silently dropped", () => {
    const manifest = buildManifest(child, bookId, profileId, "custom-spreads", [
      { startPage: 2, endPage: 3, textSide: "left", subjectSide: "right" },
      { startPage: 6, endPage: 7, textSide: "left", subjectSide: "right" },
      { startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" },
    ]);
    const spreadPagePairs = manifest
      .filter((m) => m.spread)
      .map((m) => (m.physicalPages ?? []).join("-"))
      .sort();
    expect(spreadPagePairs).toEqual(["2-3", "22-23", "6-7"].sort());
  });
});

describe("Dream Big prompt-content truthfulness", () => {
  const manifest = buildManifest(child, bookId, profileId, "custom-spreads", [
    { startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" },
  ]);

  it("the backcover prompt never contains front-cover composition text", () => {
    const backcover = manifest.find((m) => m.kind === "backcover")!;
    expect(backcover.prompt).not.toMatch(/front cover/i);
    expect(backcover.prompt).not.toContain("so the title can be overlaid cleanly");
  });

  it("the backcover prompt correctly identifies itself as the back cover", () => {
    const backcover = manifest.find((m) => m.kind === "backcover")!;
    expect(backcover.prompt).toMatch(/TARGET ARTWORK FORMAT — back cover/);
  });

  it("career-scene prompts state a costume change and do NOT also claim the outfit is unchanged", () => {
    const careers = manifest.filter((m) => m.kind === "scene");
    expect(careers.length).toBeGreaterThan(0);
    for (const m of careers) {
      expect(m.prompt, `${m.role} prompt should describe a career costume change`).toMatch(
        /outfit changes to match the .* career uniform/,
      );
      expect(
        m.prompt,
        `${m.role} prompt should not also claim the outfit is unchanged, contradicting the costume change above`,
      ).not.toMatch(/Keep this exact outfit, unchanged/);
    }
  });

  it("non-career pages (cover/intro/closing/backcover) keep their wardrobe continuity block", () => {
    const nonCareer = manifest.filter((m) => m.kind !== "scene");
    expect(nonCareer.length).toBeGreaterThan(0);
    for (const m of nonCareer) {
      expect(m.prompt, `${m.kind} prompt should keep WARDROBE CONTINUITY`).toMatch(
        /WARDROBE CONTINUITY/,
      );
    }
  });

  it("every single-page's aspect heading matches the 'closest provider preset' inside its own prompt body", () => {
    for (const m of manifest.filter((mm) => !mm.spread)) {
      const presetInPrompt = m.prompt.match(/closest provider preset: (\S+)\)/)?.[1];
      expect(presetInPrompt, `${m.filename} prompt should state a provider preset`).toBeTruthy();
      expect(
        m.aspect,
        `${m.filename}: heading aspect "${m.aspect}" must match the prompt body's own preset "${presetInPrompt}"`,
      ).toBe(presetInPrompt);
    }
  });

  it("single-page aspect is 4:3, not the stale 3:2 legacy value", () => {
    const single = manifest.find((m) => !m.spread && m.kind === "scene")!;
    expect(single.aspect).toBe("4:3");
  });
});

describe("Dream Big Markdown truthfulness", () => {
  it("standard-single: header image count matches physical page count (no spreads, nothing to explain)", () => {
    const md = renderPromptsMarkdown(child, bookId, profileId, "standard-single", []);
    expect(md).toMatch(/Generate these \*\*24 image files\*\*/);
  });

  it("with a spread: header states both the image-asset count and the larger physical-page count truthfully", () => {
    const md = renderPromptsMarkdown(child, bookId, profileId, "custom-spreads", [
      { startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" },
    ]);
    expect(md).toMatch(/Generate \*\*24 image assets\*\*/);
    expect(md).toMatch(/- 1 panoramic spread\b/);
    expect(md).toMatch(/- 23 single-page assets/);
    expect(md).toMatch(/produce \*\*25 physical PDF pages\*\*/);
    expect(md).toMatch(/Expanded Hybrid/);
    expect(md).toMatch(/25-backcover\.png/);
  });

  it("with 11 spreads (all eligible pairs): header truthfully states 35 physical pages, not 24", () => {
    const elevenPairs = Array.from({ length: 11 }, (_, i) => ({
      startPage: 2 + i * 2,
      endPage: 3 + i * 2,
      textSide: "left" as const,
      subjectSide: "right" as const,
    }));
    const md = renderPromptsMarkdown(child, bookId, profileId, "custom-spreads", elevenPairs);
    expect(md).toMatch(/Generate \*\*24 image assets\*\*/);
    expect(md).toMatch(/- 11 panoramic spreads/);
    expect(md).toMatch(/- 13 single-page assets/);
    expect(md).toMatch(/produce \*\*35 physical PDF pages\*\*/);
    expect(md).toMatch(/35-backcover\.png/);
    expect(md).toMatch(/34-closing\.png/);
    expect(md).not.toMatch(/produce \*\*24 physical PDF pages\*\*/);
  });

  it("each illustration section states its own slot, physical page(s), and legacy aliases separately from the canonical filename", () => {
    const md = renderPromptsMarkdown(child, bookId, profileId, "custom-spreads", [
      { startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" },
    ]);
    expect(md).toMatch(/\*\*Slot:\*\* `spread-22-23-inventor`/);
    expect(md).toMatch(/\*\*Physical pages:\*\* 22–23/);
    expect(md).toMatch(/\*\*Legacy aliases/);
  });
});

describe("Dream Big resolveLayoutPlan interior-page-count truthfulness", () => {
  it("a single spread grows interiorPageCount by exactly 1 beyond standard-single's 22", () => {
    const single = resolveLayoutPlan({ child, bookId, profileId, mode: "standard-single", customSpreads: [] });
    const spread = resolveLayoutPlan({
      child,
      bookId,
      profileId,
      mode: "custom-spreads",
      customSpreads: [{ startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" }],
    });
    expect(single.interiorPageCount).toBe(22);
    expect(spread.interiorPageCount).toBe(23);
  });

  it("three spreads grow interiorPageCount by exactly 3 beyond standard-single's 22", () => {
    const spread = resolveLayoutPlan({
      child,
      bookId,
      profileId,
      mode: "custom-spreads",
      customSpreads: [
        { startPage: 2, endPage: 3, textSide: "left", subjectSide: "right" },
        { startPage: 6, endPage: 7, textSide: "left", subjectSide: "right" },
        { startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" },
      ],
    });
    expect(spread.interiorPageCount).toBe(25);
  });
});
