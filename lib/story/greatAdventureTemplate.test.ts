import { describe, expect, it } from "vitest";
import { greatAdventureBook } from "./greatAdventureTemplate";
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

  it("keeps Scout consistent via companionRules, except the solo whale-ride rest scene", () => {
    const pages = buildPages(child, BOOK_ID);
    const whale = pages.find((p) => p.prompt.includes("huge friendly blue whale"));
    expect(whale?.prompt).not.toContain("COMPANION CONTINUITY");

    const jungle = pages.find((p) => p.prompt.includes("cheeky monkeys"));
    expect(jungle?.prompt).toContain("COMPANION CONTINUITY");
  });

  it("gives spread scenes the strong gutter/edge-safety composition rules instead of the legacy note", () => {
    const pages = buildPages(child, BOOK_ID);
    const bridge = pages.find((p) => p.prompt.includes("wobbly rope bridge"));
    expect(bridge?.prompt).toContain("CENTER GUTTER");
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
});
