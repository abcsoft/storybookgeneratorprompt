/**
 * Regression coverage for Dream Big's prompt/page-count truthfulness.
 *
 * Originally this file covered the Custom Spreads truthfulness/geometry bugs
 * found in a live "Dream Big + Classic Landscape 11x8 + Pages 22-23" run
 * (backcover leaking front-cover text, career-scene wardrobe contradictions,
 * a drifted aspect heading, and Custom Spreads silently growing the physical
 * page count past what the Markdown header claimed).
 *
 * Dream Big now resolves through a registered "standard-24" StoryEdition
 * (lib/story/dreamBigTemplate.ts) with no approvedSpreadPairs, so Custom
 * Spreads is disabled for it outright — the old spread-growth scenarios this
 * file exercised no longer exist as a valid resolution path. These tests
 * cover the same defect classes against the new fixed-24 model instead:
 * exactly 24 interior pages (1-24) plus a cover delivered separately, never
 * assigned an interior page number.
 */

import { describe, expect, it } from "vitest";
import { buildManifest, renderPromptsMarkdown } from "../manual/manifest";
import { resolveLayoutPlan } from "./layoutPlan";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Shihab", age: 4, gender: "boy" };
const bookId = "dream-big";
const profileId = "classic-landscape-11x8";

describe("Dream Big standard-24 physical-page integrity", () => {
  it("standard-single: 26 assets (24 interior + 2 cover), interior physical pages 1..24 unique and consecutive", () => {
    const manifest = buildManifest(child, bookId, profileId, "standard-single", []);
    expect(manifest.length).toBe(26);
    const interior = manifest.filter((m) => (m.physicalPages ?? []).length > 0);
    expect(interior.length).toBe(24);
    const allPages = interior.flatMap((m) => m.physicalPages ?? []).sort((a, b) => a - b);
    expect(allPages).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));

    const frontCover = manifest.find((m) => m.kind === "cover")!;
    const backcover = manifest.find((m) => m.kind === "backcover")!;
    expect(frontCover.physicalPages ?? []).toEqual([]);
    expect(backcover.physicalPages ?? []).toEqual([]);
    expect(frontCover.filename).toBe("cover-front.png");
    expect(backcover.filename).toBe("cover-back.png");
  });

  it("Custom Spreads is rejected outright — Dream Big has no approved spread pairs for its standard-24 edition", () => {
    expect(() =>
      buildManifest(child, bookId, profileId, "custom-spreads", [
        { startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" },
      ]),
    ).toThrow("Custom spreads require an approved fixed-24 editorial mapping.");
  });

  it("a slot's filename always encodes its own actual physical page, never a stale number", () => {
    const manifest = buildManifest(child, bookId, profileId, "standard-single", []);
    for (const m of manifest) {
      if ((m.physicalPages?.length ?? 0) === 0) continue; // cover/back-cover carry no interior page number
      const firstPage = m.physicalPages![0];
      const leadingNumber = m.filename.match(/^(\d+)/)?.[1];
      expect(leadingNumber, `${m.filename} should start with its physical page ${firstPage}`).toBe(
        String(firstPage).padStart(2, "0"),
      );
    }
  });
});

describe("Dream Big prompt-content truthfulness", () => {
  const manifest = buildManifest(child, bookId, profileId, "standard-single", []);

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
    expect(careers.length).toBe(20);
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

  it("non-career pages with the child on-page keep their wardrobe continuity block", () => {
    // The app-rendered video-QR page is deliberately character-free (no
    // child in the scene at all), so it has no wardrobe block to keep.
    const nonCareer = manifest.filter((m) => m.kind !== "scene" && m.kind !== "video-qr");
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
  it("standard-single: header states the true 26-asset / 24-physical-page split, no spreads to explain", () => {
    const md = renderPromptsMarkdown(child, bookId, profileId, "standard-single", []);
    expect(md).toMatch(/Generate \*\*26 image assets\*\* \(all single-page — no spreads\), producing \*\*24 physical PDF pages\*\*/);
    expect(md).toMatch(/Generate these \*\*26 image files\*\*/);
    expect(md).toMatch(/cover-front\.png/);
    expect(md).toMatch(/cover-back\.png/);
    expect(md).toMatch(/24-video-qr-background\.png/);
  });
});

describe("Dream Big resolveLayoutPlan interior-page-count truthfulness", () => {
  it("standard-single always resolves to exactly 24 interior pages, regardless of any requested customSpreads", () => {
    const plan = resolveLayoutPlan({ child, bookId, profileId, mode: "standard-single", customSpreads: [] });
    expect(plan.interiorPageCount).toBe(24);
    expect(plan.interiorAssets.length).toBe(24);
    expect(plan.coverAssetCount).toBe(2);
  });
});
