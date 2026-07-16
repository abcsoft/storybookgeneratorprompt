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
});
