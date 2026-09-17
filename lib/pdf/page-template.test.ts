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
    // The style attribute now leads with the per-scene position rule (see
    // versePositionStyle) before the ink/panel rule from verseStyle() —
    // check the panel is present anywhere in each verse's style, not
    // anchored at the very start of the attribute.
    const panelCount = out.match(/<div class="verse" style="[^"]*color:#231d2b;background:rgba\(255,255,255/g)?.length ?? 0;
    expect(verseCount).toBe(4); // 2 scenes + intro + closing (cover/backcover have no .verse)
    // Every verse carries the panel — including the verseInk:"light" page.
    expect(panelCount).toBe(verseCount);
  });

  it("renders the dedicated rustic wooden sign overlay for Detective backcover", () => {
    const detectivePages: GeneratedPage[] = [
      page({ index: 0, kind: "cover", text: "Alex's Detective Story" }),
      page({ index: 1, kind: "scene", text: "Investigating" }),
      page({
        index: 2,
        kind: "backcover",
        text: "CASE CLOSED!\nALEX'S DETECTIVE AGENCY",
      }),
    ];
    const out = renderBookHtml(detectivePages, child);
    expect(out).toContain('class="detective-sign-overlay"');
    expect(out).toContain('class="detective-sign-headline"');
    expect(out).toContain("CASE CLOSED!");
    expect(out).toContain('class="detective-sign-agency"');
    expect(out).toContain("ALEX'S DETECTIVE AGENCY");
    expect(out).not.toContain('class="back-title"');

    // Test auto-scaled font size for a long child name
    const longNamePages: GeneratedPage[] = [
      page({ index: 0, kind: "cover", text: "Long Name Story" }),
      page({
        index: 1,
        kind: "backcover",
        text: "CASE CLOSED!\nALEXANDER BARTHOLOMEW'S DETECTIVE AGENCY",
      }),
    ];
    const longOut = renderBookHtml(longNamePages, { name: "Alexander Bartholomew", age: 5, gender: "boy" });
    expect(longOut).toContain('class="detective-sign-overlay"');
    expect(longOut).toContain("font-size: 13pt;");
  });
});

describe("video-qr page — application-rendered QR/CTA, never the blank verse capsule", () => {
  const withoutQr = page({ index: 0, kind: "video-qr", text: "" });
  const outNoQr = renderBookHtml([withoutQr], child);

  it("never renders the generic empty verse panel for a video-qr page", () => {
    // Regression test for the confirmed "blank white capsule" bug: the
    // generic `.verse` div used to render unconditionally even for this
    // page's deliberately-empty text, producing an empty rounded-rect panel.
    expect(outNoQr).not.toMatch(/<div class="verse"[^>]*><\/div>/);
  });

  it("renders a clearly-labelled placeholder badge when no QR is configured", () => {
    expect(outNoQr).toContain('class="video-qr-overlay"');
    expect(outNoQr).toContain("VIDEO LINK NOT SET");
    expect(outNoQr).toContain("Watch Alex's Great Adventure");
    expect(outNoQr).toContain("Scan to watch the 1-minute personalized video.");
  });

  it("renders the real QR image and fallback URL when a production QR is set (PNG fallback, no SVG markup)", () => {
    const withQr = page({
      index: 0,
      kind: "video-qr",
      text: "",
      videoQr: { dataUri: "data:image/png;base64,AAA=", url: "https://storybook.example/v/abc123", isPlaceholder: false },
    });
    const out = renderBookHtml([withQr], child);
    expect(out).not.toContain("VIDEO LINK NOT SET");
    expect(out).toContain('src="data:image/png;base64,AAA="');
    expect(out).toContain("https://storybook.example/v/abc123");
  });

  it("prefers the inline vector <svg> markup over the PNG when both are available — no extra embedded raster", () => {
    const withQr = page({
      index: 0,
      kind: "video-qr",
      text: "",
      videoQr: {
        dataUri: "data:image/png;base64,AAA=",
        svgMarkup: '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
        url: "https://storybook.example/v/abc123",
        isPlaceholder: false,
      },
    });
    const out = renderBookHtml([withQr], child);
    expect(out).toContain('<svg viewBox="0 0 10 10">');
    expect(out).not.toContain('src="data:image/png;base64,AAA="');
  });
});

describe("dynamic story-text panel position", () => {
  it("defaults to bottom-left when a scene declares no textPanelPosition", () => {
    const p = page({ index: 0, kind: "scene", text: "Hello" });
    const out = renderBookHtml([p], child);
    expect(out).toMatch(/class="verse" style="[^"]*left:\s*1\.25in;[^"]*bottom:\s*0\.95in/);
  });

  it("moves the panel to top-right when the scene declares it", () => {
    const p = page({ index: 0, kind: "scene", text: "Hello", textPanelPosition: "top-right" });
    const out = renderBookHtml([p], child);
    expect(out).toMatch(/class="verse" style="[^"]*right:\s*1\.25in;[^"]*top:\s*0\.85in/);
    expect(out).not.toMatch(/class="verse" style="[^"]*left:\s*1\.25in;[^"]*bottom:\s*0\.95in/);
  });
});

