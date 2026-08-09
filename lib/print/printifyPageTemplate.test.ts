import { describe, expect, it } from "vitest";
import { renderPrintifyPageHtml, renderPrintifyProofHtml } from "./printifyPageTemplate";
import { printifyHardcoverSquare8x8Profile } from "./profiles/printifyHardcoverSquare8x8";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("renderPrintifyPageHtml", () => {
  it("sizes the page to the profile's exact interior canvas", () => {
    const html = renderPrintifyPageHtml(printifyHardcoverSquare8x8Profile, {
      imageDataUri: TINY_PNG,
      text: "Once upon a time.",
    });
    expect(html).toContain("width: 2400px");
    expect(html).toContain("height: 2400px");
  });

  it("keeps the verse inset by the safe-area margin, not flush to the trim edge", () => {
    const profile = printifyHardcoverSquare8x8Profile;
    const marginX = Math.round((profile.canvasPx.width - profile.safeAreaPx.width) / 2);
    const marginY = Math.round((profile.canvasPx.height - profile.safeAreaPx.height) / 2);
    const html = renderPrintifyPageHtml(profile, { imageDataUri: TINY_PNG, text: "Hello." });
    expect(html).toContain(`left: ${marginX}px`);
    expect(html).toContain(`bottom: ${marginY}px`);
  });

  it("renders no verse panel at all when text is empty", () => {
    const html = renderPrintifyPageHtml(printifyHardcoverSquare8x8Profile, {
      imageDataUri: TINY_PNG,
      text: "",
    });
    expect(html).not.toContain('class="verse"');
  });

  it("falls back to a soft panel when there is no image", () => {
    const html = renderPrintifyPageHtml(printifyHardcoverSquare8x8Profile, {
      imageDataUri: null,
      text: null,
    });
    expect(html).toContain("fallback");
  });

  it("composes the artwork as a backdrop + full-uncropped-subject frame, not a single cover-cropped image", () => {
    const html = renderPrintifyPageHtml(printifyHardcoverSquare8x8Profile, {
      imageDataUri: TINY_PNG,
      text: null,
    });
    expect(html).toContain('class="art-frame__backdrop"');
    expect(html).toContain('class="art-frame__subject"');
    // The subject layer must contain-fit (never crop) the source.
    expect(html).toContain(".art-frame__subject");
    expect(html).toMatch(/\.art-frame__subject[^}]*object-fit:\s*contain/);
    // Only the backdrop layer is allowed to crop/cover — it's atmosphere,
    // not the judged content.
    expect(html).toMatch(/\.art-frame__backdrop[^}]*object-fit:\s*cover/);
  });
});

describe("renderPrintifyProofHtml", () => {
  it("uses inch-based @page sizing derived from canvasPx / dpi", () => {
    const html = renderPrintifyProofHtml(printifyHardcoverSquare8x8Profile, [TINY_PNG, TINY_PNG]);
    expect(html).toContain("@page { size: 8in 8in; margin: 0; }");
  });

  it("emits one page section per image, with page breaks between them", () => {
    const html = renderPrintifyProofHtml(printifyHardcoverSquare8x8Profile, [
      TINY_PNG,
      TINY_PNG,
      TINY_PNG,
    ]);
    expect(html.match(/<section class="page">/g)?.length).toBe(3);
  });
});
