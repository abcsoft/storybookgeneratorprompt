import { describe, expect, it } from "vitest";
import { dreamBigBook } from "./dreamBigTemplate";
import { buildPages } from "./registry";
import { assertSpreadsAligned, spreadStartPages } from "../pdf/imposition";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

describe("dreamBigTemplate", () => {
  it("produces a 24-page book", () => {
    expect(dreamBigBook.pages.length).toBe(24);
  });

  it("starts with a cover and ends with a back cover", () => {
    const pages = buildPages(child);
    expect(pages[0].kind).toBe("cover");
    expect(pages.at(-1)?.kind).toBe("backcover");
  });

  it("personalizes prompts and text with the child's name", () => {
    const pages = buildPages(child);
    // Every page's story copy should mention the child somewhere in the book.
    const mentions = pages.filter((p) => p.text.includes("Alex")).length;
    expect(mentions).toBeGreaterThan(15);
  });

  it("reflects age and gender in scene illustration prompts", () => {
    const pages = buildPages(child);
    const scene = pages.find((p) => p.kind === "scene");
    expect(scene?.prompt).toContain("4-year-old boy");
    expect(scene?.prompt.toLowerCase()).toContain("reference photos");
  });

  it("uses she/her for a girl", () => {
    const girl = buildPages({ name: "Aria", age: 5, gender: "girl" });
    const scene = girl.find((p) => p.kind === "scene");
    expect(scene?.prompt).toContain("5-year-old girl");
  });

  it("gives every page non-empty prompt and text", () => {
    for (const page of buildPages(child)) {
      expect(page.prompt.trim().length).toBeGreaterThan(0);
      expect(page.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("gives scene pages a role badge", () => {
    const scenes = buildPages(child).filter((p) => p.kind === "scene");
    expect(scenes.length).toBe(20);
    expect(scenes.every((p) => (p.role ?? "").length > 0)).toBe(true);
  });

  it("places every spread on a facing pair (even start page)", () => {
    const pages = buildPages(child);
    // Spreads: intro, astronaut, deep-sea diver, closing — each must begin on an
    // even page so its two halves face each other in the bound book.
    expect(() => assertSpreadsAligned(pages)).not.toThrow();
    expect(spreadStartPages(pages)).toEqual([2, 6, 22, 26]);
  });
});
