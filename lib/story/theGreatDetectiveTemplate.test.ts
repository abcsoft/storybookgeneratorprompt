import { describe, expect, it } from "vitest";
import { assertSpreadsAligned, spreadStartPages } from "../pdf/imposition";
import { buildPages } from "./registry";
import { theGreatDetectiveBook } from "./theGreatDetectiveTemplate";
import type { ChildProfile } from "./types";

const BOOK_ID = "the-great-detective";
const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

describe("theGreatDetectiveTemplate", () => {
  it("produces a 26-page-spec connected book", () => {
    expect(theGreatDetectiveBook.pages.length).toBe(26);
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

  it("links the case with the recurring magnifying glass and side characters", () => {
    const blob = buildPages(child, BOOK_ID)
      .map((p) => `${p.prompt}\n${p.text}`)
      .join("\n");
    expect(blob).toContain("Rohan");
    expect(blob).toContain("Meera");
    expect(blob.toLowerCase()).toContain("magnifying glass");
  });

  it("pins the hero into one consistent outfit on every page", () => {
    for (const page of buildPages(child, BOOK_ID)) {
      expect(page.prompt).toContain("denim jacket");
      expect(page.prompt).toContain("floral skirt");
    }
  });

  it("gives every page a non-empty prompt, and text on all but the image-only back cover", () => {
    for (const page of buildPages(child, BOOK_ID)) {
      expect(page.prompt.trim().length).toBeGreaterThan(0);
      if (page.kind !== "backcover") {
        expect(page.text.trim().length).toBeGreaterThan(0);
      }
    }
    // The final page is image-only (the closing text is painted into the art).
    expect(buildPages(child, BOOK_ID).at(-1)?.text).toBe("");
  });

  it("bakes a personalized 'case closed' sign into the back-cover art, no overlay", () => {
    const pages = buildPages(child, BOOK_ID);
    const last = pages.at(-1);
    expect(last?.kind).toBe("backcover");
    expect(last?.text).toBe("");
    expect(last?.prompt).toContain("CASE CLOSED!");
    expect(last?.prompt).toContain("ALEX'S DETECTIVE AGENCY");
    // Only this page opts out of the global no-text ban so the sign can render…
    expect(last?.prompt).not.toContain("ABSOLUTELY NO TEXT IN THE IMAGE");
    expect(last?.prompt).toContain("TEXT POLICY FOR THIS PAGE ONLY");
    // …every other page keeps the ban.
    const scene = pages.find((p) => p.kind === "scene");
    expect(scene?.prompt).toContain("ABSOLUTELY NO TEXT IN THE IMAGE");
  });

  it("uses two-page spreads for several scenes", () => {
    const spreads = buildPages(child, BOOK_ID).filter((p) => p.spread);
    expect(spreads.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps every spread aligned on an even print page with an even total", () => {
    const pages = buildPages(child, BOOK_ID);
    // Spreads must not split across a page-turn (cover = print page 1).
    expect(() => assertSpreadsAligned(pages)).not.toThrow();
    for (const start of spreadStartPages(pages)) {
      expect(start % 2).toBe(0);
    }
    // Even total print leaves so the back cover lands on the back of the book.
    const totalLeaves = pages.reduce((n, p) => n + (p.spread ? 2 : 1), 0);
    expect(totalLeaves % 2).toBe(0);
  });
});
