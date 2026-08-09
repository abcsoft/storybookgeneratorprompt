import { describe, expect, it } from "vitest";
import { kindnessGardenBook } from "./kindnessGardenTemplate";
import { buildPages, listBooks } from "./registry";
import { assertSpreadsAligned, spreadStartPages } from "../pdf/imposition";
import type { ChildProfile } from "./types";

const BOOK_ID = "kindness-garden";
const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

describe("kindnessGardenTemplate", () => {
  it("registers automatically in the story registry", () => {
    expect(listBooks().some((b) => b.id === BOOK_ID)).toBe(true);
  });

  it("produces a 14-page connected book", () => {
    expect(kindnessGardenBook.pages.length).toBe(14);
  });

  it("starts with a cover and ends with a back cover", () => {
    const pages = buildPages(child, BOOK_ID);
    expect(pages[0].kind).toBe("cover");
    expect(pages.at(-1)?.kind).toBe("backcover");
  });

  it("personalizes the story copy with the child's name", () => {
    const pages = buildPages(child, BOOK_ID);
    const mentions = pages.filter((p) => p.text.includes("Alex")).length;
    expect(mentions).toBeGreaterThan(5);
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

  it("links the garden with the recurring companion Pip", () => {
    const blob = buildPages(child, BOOK_ID)
      .map((p) => `${p.prompt}\n${p.text}`)
      .join("\n");
    expect(blob).toContain("Pip");
  });

  it("gives every page non-empty prompt and text", () => {
    for (const page of buildPages(child, BOOK_ID)) {
      expect(page.prompt.trim().length).toBeGreaterThan(0);
      expect(page.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("places every spread on a facing pair (even start page)", () => {
    const pages = buildPages(child, BOOK_ID);
    expect(() => assertSpreadsAligned(pages)).not.toThrow();
    expect(spreadStartPages(pages)).toEqual([2, 6, 14, 16]);
  });

  it("inherits identity, style, and negative rules from the shared prompt engine", () => {
    for (const page of buildPages(child, BOOK_ID)) {
      expect(page.prompt).toContain("IDENTITY FIRST");
      expect(page.prompt).toContain("DO NOT:");
    }
  });

  it("pins the default garden outfit on an ordinary scene", () => {
    const pages = buildPages(child, BOOK_ID);
    const birdhouse = pages.find((p) => p.prompt.includes("wooden birdhouse"));
    expect(birdhouse?.prompt).toContain("green cotton overalls");
  });

  it("swaps to the rain outfit on the rain scene only", () => {
    const pages = buildPages(child, BOOK_ID);
    const rain = pages.find((p) => p.prompt.includes("giant leaf"));
    expect(rain?.prompt).toContain("yellow raincoat");
    expect(rain?.prompt).not.toContain("green cotton overalls");
  });

  it("swaps to pajamas on the closing bedroom scene", () => {
    const pages = buildPages(child, BOOK_ID);
    expect(pages.at(-2)?.prompt).toContain("pajamas");
  });

  it("keeps Pip consistent via companionRules, except the solo reflection scene", () => {
    const pages = buildPages(child, BOOK_ID);
    const solo = pages.find((p) => p.prompt.includes("small notebook"));
    expect(solo?.prompt).not.toContain("COMPANION CONTINUITY");

    const brambles = pages.find((p) => p.prompt.includes("tangle of brambles"));
    expect(brambles?.prompt).toContain("COMPANION CONTINUITY");
  });

  it("gives spread scenes the strong gutter/edge-safety composition rules instead of the legacy note", () => {
    const pages = buildPages(child, BOOK_ID);
    const meadow = pages.find((p) => p.prompt.includes("wildflower meadow"));
    expect(meadow?.prompt).toContain("CENTER GUTTER");
    expect(meadow?.prompt).toContain(
      "NO PARTIAL HUMAN OR ANIMAL BODY PART MAY ENTER FROM ANY EDGE",
    );
    expect(meadow?.prompt).not.toContain("IMPORTANT COMPOSITION");
  });

  it("adds scene-specific composition notes for the balance-beam and celebration scenes", () => {
    const pages = buildPages(child, BOOK_ID);
    const log = pages.find((p) => p.prompt.includes("mossy fallen log"));
    expect(log?.prompt.toLowerCase()).toContain("both of the child's hands");

    const celebration = pages.find((p) => p.prompt.includes("arms raised in joy"));
    expect(celebration?.prompt).toContain("10-12%");
  });
});
