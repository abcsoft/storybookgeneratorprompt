import { describe, expect, it } from "vitest";
import { greatAdventureBook, greatAdventurePrintify24Edition } from "./greatAdventureTemplate";
import { resolveLayoutPlan } from "./layoutPlan";
import { buildPages } from "./registry";
import { assertSpreadsAligned, spreadStartPages } from "../pdf/imposition";
import type { ChildProfile } from "./types";

const BOOK_ID = "great-adventure";
const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

describe("greatAdventureTemplate", () => {
  it("produces a 21-page connected book", () => {
    expect(greatAdventureBook.pages.length).toBe(21);
  });

  it("starts with a cover and ends with a back cover", () => {
    const pages = buildPages(child, BOOK_ID);
    expect(pages[0].kind).toBe("cover");
    expect(pages.at(-1)?.kind).toBe("backcover");
  });

  it("personalizes the story copy with the child's name", () => {
    const pages = buildPages(child, BOOK_ID);
    const mentions = pages.filter((p) => p.text.includes("Alex")).length;
    expect(mentions).toBeGreaterThan(12);
  });

  it("reflects age and gender in scene illustration prompts", () => {
    const pages = buildPages(child, BOOK_ID);
    const scene = pages.find((p) => p.kind === "scene");
    expect(scene?.prompt).toContain("4-year-old boy");
    expect(scene?.prompt.toLowerCase()).toContain("reference photos");
  });

  it("uses she/her wording for a girl", () => {
    const girl = buildPages({ name: "Aria", age: 5, gender: "girl" }, BOOK_ID);
    const scene = girl.find((p) => p.kind === "scene");
    expect(scene?.prompt).toContain("5-year-old girl");
  });

  it("links the journey with the recurring map and companion", () => {
    const blob = buildPages(child, BOOK_ID)
      .map((p) => `${p.prompt}\n${p.text}`)
      .join("\n");
    expect(blob).toContain("Scout");
    expect(blob.toLowerCase()).toContain("map");
  });

  it("gives every page non-empty prompt and text", () => {
    for (const page of buildPages(child, BOOK_ID)) {
      expect(page.prompt.trim().length).toBeGreaterThan(0);
      expect(page.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses two-page spreads for several scenes", () => {
    const spreads = buildPages(child, BOOK_ID).filter((p) => p.spread);
    expect(spreads.length).toBeGreaterThanOrEqual(3);
  });

  it("places every spread on a facing pair (even start page)", () => {
    const pages = buildPages(child, BOOK_ID);
    expect(() => assertSpreadsAligned(pages)).not.toThrow();
    expect(spreadStartPages(pages)).toEqual([2, 6, 8, 14, 16, 24, 26]);
  });

  it("forces dark verse ink (black text on a panel) on the light scenes", () => {
    const pages = buildPages(child, BOOK_ID);
    // 0-based indices for manifest pages 5 (waterfall), 15 (crystal cave),
    // 17 (treasure-burst), 18 (forest star), 20 (closing) — all light backgrounds
    // where white verse text is hard to read.
    for (const idx of [4, 14, 16, 17, 19]) {
      expect(pages[idx].ink).toBe("dark");
    }
  });

  it("routes every page through the shared prompt engine (identity + negative rules present)", () => {
    for (const page of buildPages(child, BOOK_ID)) {
      expect(page.prompt).toContain("IDENTITY FIRST");
      expect(page.prompt).toContain("DO NOT:");
    }
  });

  it("pins the default explorer outfit on an ordinary scene", () => {
    const pages = buildPages(child, BOOK_ID);
    const jungle = pages.find((p) => p.prompt.includes("cheeky monkeys"));
    expect(jungle?.prompt).toContain("khaki explorer vest");
  });

  it("swaps to a special outfit on scenes that call for one (winter, underwater, pajamas)", () => {
    const pages = buildPages(child, BOOK_ID);
    const mountain = pages.find((p) => p.prompt.includes("snowy, rocky mountain path"));
    expect(mountain?.prompt).toContain("winter coat");
    expect(mountain?.prompt).not.toContain("khaki explorer vest");

    const snorkel = pages.find((p) => p.prompt.includes("Snorkelling happily"));
    expect(snorkel?.prompt).toContain("snorkel mask");

    const closing = pages.at(-2); // closing page, before the back cover
    expect(closing?.prompt).toContain("pajamas");
  });

  it("keeps Scout consistent via companionRules throughout the journey including the whale ride", () => {
    const pages = buildPages(child, BOOK_ID);
    const whale = pages.find((p) => p.prompt.includes("huge friendly blue whale"));
    expect(whale?.prompt).toContain("COMPANION CONTINUITY");
    expect(whale?.prompt).toContain("Scout");

    const jungle = pages.find((p) => p.prompt.includes("cheeky monkeys"));
    expect(jungle?.prompt).toContain("COMPANION CONTINUITY");
  });

  it("gives spread scenes the strong gutter/edge-safety composition rules instead of the legacy note", () => {
    const pages = buildPages(child, BOOK_ID);
    const bridge = pages.find((p) => p.prompt.includes("wobbly rope bridge"));
    expect(bridge?.prompt).toContain("central gutter-safe zone");
    expect(bridge?.prompt).toContain(
      "NO PARTIAL HUMAN OR ANIMAL BODY PART MAY ENTER FROM ANY EDGE",
    );
    expect(bridge?.prompt).not.toContain("IMPORTANT COMPOSITION");
  });

  it("adds scene-specific composition notes for the previously flagged problem scenes", () => {
    const pages = buildPages(child, BOOK_ID);
    const whale = pages.find((p) => p.prompt.includes("huge friendly blue whale"));
    expect(whale?.prompt.toLowerCase()).toContain("never enlarge the child");

    const flyingHome = pages.at(-3); // last journey scene, before closing + back cover
    expect(flyingHome?.prompt.toLowerCase()).toContain("safe art page");
  });

  it("strictly maps all 19 interior scene IDs across 24 physical pages in edition mode, and 19 pages in single mode", () => {
    // 1. Template-level interior scene count: 1 intro + 17 journey + 1 closing = 19 scenes
    const interiorPages = greatAdventureBook.pages.filter(
      (p) => p.kind !== "cover" && p.kind !== "backcover",
    );
    expect(interiorPages.length).toBe(19);

    // 2. Exact scene IDs in chronological narrative order
    const expectedSceneIds = [
      "intro",
      "scene-02", "scene-03", "scene-04", "scene-05", "scene-06",
      "scene-07", "scene-08", "scene-09", "scene-10", "scene-11",
      "scene-12", "scene-13", "scene-14", "scene-15", "scene-16",
      "scene-17", "scene-18",
      "closing",
    ];
    expect(expectedSceneIds.length).toBe(19);

    // 3. Supported Edition Mode (great-adventure-printify-24)
    const editionPlan = resolveLayoutPlan({
      child,
      bookId: BOOK_ID,
      profileId: "printify-hardcover-square-8x8",
    });
    expect(editionPlan.isValidForProfile).toBe(true);
    expect(editionPlan.interiorPageCount).toBe(24);
    expect(editionPlan.interiorAssets.length).toBe(19);

    const editionSceneIds = editionPlan.interiorAssets.map((a) => a.sceneId);
    expect(editionSceneIds).toEqual(expectedSceneIds);

    const spreads = editionPlan.interiorAssets.filter((a) => a.layout !== "single-page");
    const singles = editionPlan.interiorAssets.filter((a) => a.layout === "single-page");
    expect(spreads.length).toBe(5);
    expect(singles.length).toBe(14);
    expect(spreads.length * 2 + singles.length).toBe(24);

    // 4. Standard Single Mode (all 19 scenes forced to single-page, rejecting 24-page fixed profile)
    const singlePlan = resolveLayoutPlan({
      child,
      bookId: BOOK_ID,
      profileId: "printify-hardcover-square-8x8",
      mode: "standard-single",
    });
    expect(singlePlan.interiorPageCount).toBe(19);
    expect(singlePlan.interiorAssets.length).toBe(19);
    expect(singlePlan.interiorAssets.every((a) => a.layout === "single-page")).toBe(true);
    expect(singlePlan.interiorAssets.map((a) => a.sceneId)).toEqual(expectedSceneIds);
    expect(singlePlan.isValidForProfile).toBe(false);
    expect(singlePlan.limitations?.[0]).toContain("resolves to 19 interior pages, but Printify Hardcover Square 8×8 requires exactly 24 interior pages");
  });

  it("verifies authentic narrative fingerprints for all 19 interior beats (not hallucinated titles)", () => {
    const pages = buildPages(child, BOOK_ID);
    const interior = pages.filter((p) => p.kind !== "cover" && p.kind !== "backcover");
    expect(interior.length).toBe(19);

    const fingerprints: Array<{ name: string; requiredPromptWords: string[]; requiredCopyWords: string[] }> = [
      { name: "intro", requiredPromptWords: ["treasure map", "bedroom", "scout"], requiredCopyWords: ["glowing", "backpack", "scout"] },
      { name: "scene-02 (sailboat)", requiredPromptWords: ["sailboat", "harbour"], requiredCopyWords: ["map", "bay"] },
      { name: "scene-03 (jungle)", requiredPromptWords: ["jungle", "trail", "monkeys", "toucans"], requiredCopyWords: ["jungle", "vines", "toucans"] },
      { name: "scene-04 (waterfall)", requiredPromptWords: ["rope bridge", "waterfall"], requiredCopyWords: ["bridge", "water"] },
      { name: "scene-05 (desert camel)", requiredPromptWords: ["camel", "desert", "dunes"], requiredCopyWords: ["desert", "camel", "dunes"] },
      { name: "scene-06 (ancient ruins)", requiredPromptWords: ["ruins", "pillars"], requiredCopyWords: ["ruins", "carving"] },
      { name: "scene-07 (savanna)", requiredPromptWords: ["savanna", "giraffes", "elephants"], requiredCopyWords: ["giraffes", "elephants"] },
      { name: "scene-08 (snowy mountain)", requiredPromptWords: ["mountain", "eagle"], requiredCopyWords: ["mountain", "eagle"] },
      { name: "scene-09 (Arctic shore)", requiredPromptWords: ["arctic", "polar bears", "northern lights"], requiredCopyWords: ["polar bears", "lights"] },
      { name: "scene-10 (coral reef)", requiredPromptWords: ["coral", "dolphin"], requiredCopyWords: ["waves", "dolphins"] },
      { name: "scene-11 (blue whale)", requiredPromptWords: ["whale", "jellyfish"], requiredCopyWords: ["whale", "jellyfish"] },
      { name: "scene-12 (ocean storm)", requiredPromptWords: ["storm", "mast"], requiredCopyWords: ["storm", "waves"] },
      { name: "scene-13 (treasure island)", requiredPromptWords: ["island", "cove"], requiredCopyWords: ["island", "spot"] },
      { name: "scene-14 (crystal cave)", requiredPromptWords: ["crystal cave", "gems"], requiredCopyWords: ["crystal cave", "gems"] },
      { name: "scene-15 (treasure chamber)", requiredPromptWords: ["chamber", "chest"], requiredCopyWords: ["chest", "lid"] },
      { name: "scene-16 (chest opens)", requiredPromptWords: ["chest", "starlight"], requiredCopyWords: ["golden light", "stars"] },
      { name: "scene-17 (star friend)", requiredPromptWords: ["star", "smiling"], requiredCopyWords: ["star", "friend"] },
      { name: "scene-18 (flying home)", requiredPromptWords: ["starry night sky", "trail of stars"], requiredCopyWords: ["flew", "night sky"] },
      { name: "closing (bedtime)", requiredPromptWords: ["bed", "bedroom"], requiredCopyWords: ["home", "star", "sleep"] },
    ];

    expect(interior.length).toBe(fingerprints.length);

    for (let i = 0; i < fingerprints.length; i++) {
      const page = interior[i];
      const fp = fingerprints[i];
      const pText = page.prompt.toLowerCase();
      const cText = page.text.toLowerCase();

      for (const word of fp.requiredPromptWords) {
        expect(pText, `Page ${i + 1} (${fp.name}) prompt must contain '${word}'`).toContain(word.toLowerCase());
      }
      for (const word of fp.requiredCopyWords) {
        expect(cText, `Page ${i + 1} (${fp.name}) text copy must contain '${word}'`).toContain(word.toLowerCase());
      }
    }
  });
});
