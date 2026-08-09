import { describe, expect, it } from "vitest";
import { renderCoverHtml } from "./coverTemplate";
import { printifyHardcoverSquare8x8Profile } from "./profiles/printifyHardcoverSquare8x8";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("renderCoverHtml", () => {
  const html = renderCoverHtml(
    printifyHardcoverSquare8x8Profile,
    { frontDataUri: TINY_PNG, backDataUri: TINY_PNG },
    { title: "Great Adventure", childName: "Aarav" },
  );

  it("sizes the canvas to the profile's exact wrap-cover dimensions", () => {
    expect(html).toContain("width: 5370px");
    expect(html).toContain("height: 2850px");
  });

  it("renders back | spine | front as three distinct zones", () => {
    expect(html).toContain('class="art back"');
    expect(html).toContain('class="spine"');
    expect(html).toContain('class="art front"');
  });

  it("renders the child's name and title as real text, not baked into the art", () => {
    expect(html).toContain("Aarav");
    expect(html).toContain("The Great Adventure");
  });

  it("escapes the child's name", () => {
    const withHtml = renderCoverHtml(
      printifyHardcoverSquare8x8Profile,
      { frontDataUri: TINY_PNG },
      { title: "Great Adventure", childName: "<script>" },
    );
    expect(withHtml).not.toContain("<script>");
    expect(withHtml).toContain("&lt;script&gt;");
  });

  it("falls back to a soft panel when there is no back-cover art", () => {
    const noBack = renderCoverHtml(
      printifyHardcoverSquare8x8Profile,
      { frontDataUri: TINY_PNG, backDataUri: null },
      { title: "Great Adventure", childName: "Aarav" },
    );
    expect(noBack).toContain("linear-gradient");
  });

  it("composes front/back art as a backdrop + full-uncropped-subject frame, not a plain cover-cropped background", () => {
    expect(html).toContain('class="art-frame__backdrop"');
    expect(html).toContain('class="art-frame__subject"');
    expect(html).toMatch(/\.art-frame__subject[^}]*object-fit:\s*contain/);
    expect(html).toMatch(/\.art-frame__backdrop[^}]*object-fit:\s*(cover|contain)/);
  });

  it("throws for a profile with no coverGeometryPx", () => {
    expect(() =>
      renderCoverHtml(
        { ...printifyHardcoverSquare8x8Profile, coverGeometryPx: undefined },
        { frontDataUri: TINY_PNG },
        { title: "x", childName: "y" },
      ),
    ).toThrow();
  });
});
