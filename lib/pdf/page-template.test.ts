import { describe, expect, it } from "vitest";
import { PAGE_H_IN, PAGE_W_IN, renderBookHtml } from "./page-template";
import type { ChildProfile, GeneratedPage } from "../story/types";

const child: ChildProfile = { name: "Alex", age: 1, gender: "boy" };

function page(partial: Partial<GeneratedPage>): GeneratedPage {
  return {
    index: 0,
    kind: "scene",
    text: "Some copy",
    image: Buffer.from("img"),
    imageMimeType: "image/png",
    failed: false,
    ...partial,
  };
}

const pages: GeneratedPage[] = [
  page({ index: 0, kind: "cover", text: "Alex's Dream Big Adventure" }),
  page({ index: 1, kind: "scene", role: "PILOT", text: "Up and away, Alex!" }),
  page({ index: 2, kind: "scene", role: "ASTRONAUT", text: "Among the stars.", spread: true }),
  page({ index: 3, kind: "scene", role: "DETECTIVE", text: "Clue by clue.", image: null, failed: true }),
  page({ index: 4, kind: "backcover", text: "Dream big." }),
];

describe("renderBookHtml (landscape)", () => {
  const html = renderBookHtml(pages, child);

  it("uses a landscape page size including bleed", () => {
    expect(PAGE_W_IN).toBeCloseTo(11.25);
    expect(PAGE_H_IN).toBeCloseTo(8.25);
    expect(html).toContain(`size: ${PAGE_W_IN}in ${PAGE_H_IN}in`);
  });

  it("expands a spread into two leaves", () => {
    // 5 entries, one of which is a spread → 6 page sections.
    const count = html.match(/<section class="page/g)?.length ?? 0;
    expect(count).toBe(6);
    expect(html).toContain("spread-left");
    expect(html).toContain("spread-right");
  });

  it("includes the cover title", () => {
    expect(html).toContain("Alex's Dream Big Adventure");
  });

  it("weaves the verse into the art, with no pill badges", () => {
    expect(html).toContain("Up and away, Alex!");
    expect(html).not.toContain('class="badge"');
  });

  it("embeds illustrations as data URIs", () => {
    expect(html).toContain("data:image/png;base64,");
  });

  it("uses a fallback background when an illustration failed", () => {
    expect(html).toContain("bg fallback");
  });

  it("renders the white panel behind EVERY verse, regardless of scene ink", () => {
    const mixed: GeneratedPage[] = [
      page({ index: 0, kind: "cover", text: "Title" }),
      page({ index: 1, kind: "scene", role: "A", text: "light scene", verseInk: "light" }),
      page({ index: 2, kind: "scene", role: "B", text: "dark scene", verseInk: "dark" }),
      page({ index: 3, kind: "intro", text: "intro verse" }), // no verseInk set
      page({ index: 4, kind: "closing", text: "closing verse" }),
      page({ index: 5, kind: "backcover", text: "the end" }),
    ];
    const out = renderBookHtml(mixed, child);
    const verseCount = out.match(/<div class="verse"/g)?.length ?? 0;
    const panelCount =
      out.match(/<div class="verse" style="color:#231d2b;background:rgba\(255,255,255/g)?.length ?? 0;
    expect(verseCount).toBe(4); // 2 scenes + intro + closing (cover/backcover have no .verse)
    // Every verse carries the panel — including the verseInk:"light" page.
    expect(panelCount).toBe(verseCount);
  });
});
