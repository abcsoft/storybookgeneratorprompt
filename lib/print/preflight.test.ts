import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { runPreflight } from "./preflight";
import { buildManifest } from "../manual/manifest";
import type { ChildProfile } from "../story/types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

/** A solid-color PNG at a given width:height ratio. `seed` varies the pixel
 *  content (real artwork is never byte-identical across slots, and the
 *  duplicate-artwork-across-slots gate now correctly flags it if it is). */
async function makeImage(ratio: number, height: number = 200, seed = 0): Promise<Buffer> {
  const width = Math.round(height * ratio);
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: (150 + seed * 7) % 255, b: (120 + seed * 11) % 255 } },
  })
    .png()
    .toBuffer();
}

describe("runPreflight", () => {
  it("passes ok on a complete, correctly-shaped set of images", async () => {
    const manifest = buildManifest(child, "dream-big");
    const files = await Promise.all(
      manifest.map(async (m, idx) => ({
        filename: m.filename,
        buffer: await makeImage(m.spread ? 21 / 9 : 3 / 2, 200, idx),
      })),
    );

    const result = await runPreflight({
      child,
      bookId: "dream-big",
      files,
      allowLowResolutionForTesting: true,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails and lists filenames when required images are missing", async () => {
    const manifest = buildManifest(child, "dream-big");
    const files = await Promise.all(
      manifest.slice(0, 5).map(async (m) => ({
        filename: m.filename,
        buffer: await makeImage(3 / 2),
      })),
    );

    const result = await runPreflight({
      child,
      bookId: "dream-big",
      files,
      allowLowResolutionForTesting: true,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("missing"))).toBe(true);
    expect(result.errors.some((e) => e.includes(manifest[23].filename))).toBe(true);
  });

  it("flags two files that resolve to the same page as duplicates", async () => {
    const img = await makeImage(3 / 2);
    const result = await runPreflight({
      child,
      bookId: "dream-big",
      files: [
        { filename: "01.png", buffer: img },
        { filename: "front-cover.png", buffer: img }, // both resolve to cover-front
      ],
      allowLowResolutionForTesting: true,
    });

    expect(result.errors.some((e) => e.includes("both resolve"))).toBe(true);
  });

  it("errors when a source's ORIENTATION is incompatible with the page, warns on a mild ratio mismatch", async () => {
    const manifest = buildManifest(child, "dream-big");
    const files = await Promise.all(
      manifest.map(async (m, i) => ({
        filename: m.filename,
        // First page: portrait instead of the expected 3:2 landscape
        buffer: await makeImage(i === 0 ? 2 / 3 : m.spread ? 21 / 9 : 3 / 2),
      })),
    );

    const result = await runPreflight({
      child,
      bookId: "dream-big",
      files,
      allowLowResolutionForTesting: true,
    });

    expect(result.errors.some((e) => e.includes("portrait") && e.includes("landscape"))).toBe(
      true,
    );
  });

  it("does NOT hard-fail Printify pages whose source is a usable-but-non-ideal ratio", async () => {
    const manifest = buildManifest(child, "great-adventure", "printify-hardcover-square-8x8");
    const files = await Promise.all(
      manifest.map(async (m, idx) => ({
        filename: m.filename,
        buffer: await makeImage(m.spread ? 16 / 9 : 3 / 2, 200, idx),
      })),
    );

    const result = await runPreflight({
      child,
      bookId: "great-adventure",
      profileId: "printify-hardcover-square-8x8",
      files,
      allowLowResolutionForTesting: true,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes("aspect ratio"))).toBe(true);
  });

  it("Printify square target is never orientation-incompatible — every registered story now resolves entirely single-page 1:1 there, and square accepts any source orientation", async () => {
    // Originally this fed a portrait source to what used to be a wide
    // spread slot (via the legacy great-adventure-printify-24 PrintEdition)
    // to prove a genuinely incompatible orientation still blocks export.
    // Great Adventure (like every registered story) now resolves through
    // its standard-24 StoryEdition on every profile, which has no
    // approvedSpreadPairs — every Printify interior slot is single-page
    // 1:1 (square), and square is deliberately compatible with BOTH
    // portrait and landscape sources (see lib/print/aspectCheck.ts's
    // orientationsAreOpposite — only portrait-vs-landscape is ever
    // "error"), so there is no longer any source orientation that can
    // trigger INCOMPATIBLE_ORIENTATION on this profile. This asserts that
    // new invariant directly: a strongly portrait source passes orientation
    // classification cleanly (at most a ratio-mismatch warning).
    const manifest = buildManifest(child, "great-adventure", "printify-hardcover-square-8x8");
    const files = await Promise.all(
      manifest.map(async (m) => ({
        filename: m.filename,
        buffer: await makeImage(2 / 3), // strongly portrait
      })),
    );

    const result = await runPreflight({
      child,
      bookId: "great-adventure",
      profileId: "printify-hardcover-square-8x8",
      files,
      allowLowResolutionForTesting: true,
    });

    expect(result.errors.some((e) => e.includes("portrait") && e.includes("landscape"))).toBe(false);
    expect(result.issues?.some((i) => i.type === "INCOMPATIBLE_ORIENTATION")).toBe(false);
  });

  it("warns about the Printify placeholder spine width, not for the landscape profile", async () => {
    const landscapeFiles = await Promise.all(
      buildManifest(child, "dream-big").map(async (m) => ({
        filename: m.filename,
        buffer: await makeImage(m.spread ? 21 / 9 : 3 / 2),
      })),
    );
    const landscape = await runPreflight({
      child,
      bookId: "dream-big",
      files: landscapeFiles,
      allowLowResolutionForTesting: true,
    });
    expect(landscape.warnings.some((w) => w.includes("Spine width"))).toBe(false);

    const printifyFiles = await Promise.all(
      buildManifest(child, "dream-big", "printify-hardcover-square-8x8").map(async (m) => ({
        filename: m.filename,
        buffer: await makeImage(m.spread ? 2 : 1),
      })),
    );
    const printify = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "printify-hardcover-square-8x8",
      files: printifyFiles,
      allowLowResolutionForTesting: true,
    });
    expect(printify.warnings.some((w) => w.includes("Spine width"))).toBe(true);
  });

  // --- Strict Invariant Tests ---

  it("fails closed when custom spread begins on an odd physical page", async () => {
    // Dream Big now resolves through its registered standard-24
    // StoryEdition, which has no approvedSpreadPairs — ANY custom-spreads
    // request against it (odd start page or otherwise) is rejected before
    // the even-start-page rule is even reached. The rule itself is still
    // real and enforced wherever a spread CAN occur (see
    // lib/story/layoutPlan.test.ts's Invariant 4).
    const manifest = buildManifest(child, "dream-big");
    const files = await Promise.all(
      manifest.map(async (m) => ({
        filename: m.filename,
        buffer: await makeImage(3 / 2),
      })),
    );

    const result = await runPreflight({
      child,
      bookId: "dream-big",
      files,
      mode: "custom-spreads",
      customSpreads: [{ startPage: 3, endPage: 4, textSide: "left" }],
      allowLowResolutionForTesting: true,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Custom spreads require an approved fixed-24 editorial mapping."))).toBe(true);
  });

  it("fails closed when custom spread maps to physically invalid pairs 1-2 or 23-24", async () => {
    const manifest = buildManifest(child, "dream-big");
    const files = await Promise.all(
      manifest.map(async (m) => ({
        filename: m.filename,
        buffer: await makeImage(3 / 2),
      })),
    );

    const result12 = await runPreflight({
      child,
      bookId: "dream-big",
      files,
      mode: "custom-spreads",
      customSpreads: [{ startPage: 1, endPage: 2, textSide: "left" }],
      allowLowResolutionForTesting: true,
    });
    expect(result12.ok).toBe(false);

    const result2324 = await runPreflight({
      child,
      bookId: "dream-big",
      files,
      mode: "custom-spreads",
      customSpreads: [{ startPage: 23, endPage: 24, textSide: "left" }],
      allowLowResolutionForTesting: true,
    });
    expect(result2324.ok).toBe(false);
  });

  it("fails closed on low resolution (e.g. 1376x768 single or 1584x672 spread) in production mode", async () => {
    // 1376x768 on 8x8" is 96 PPI, well below the 150 PPI minimum
    const lowResBuffer = await sharp({
      create: { width: 1376, height: 768, channels: 3, background: { r: 100, g: 100, b: 100 } },
    })
      .png()
      .toBuffer();

    const result = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "printify-hardcover-square-8x8",
      files: [{ filename: "01.png", buffer: lowResBuffer }],
      allowLowResolutionForTesting: false, // production check
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("below print-safe threshold") && e.includes("150 PPI"))).toBe(true);
  });

  it("produces detailed assetReports with dimensions, PPI, destination pages, and crop status", async () => {
    const singleBuf = await sharp({
      create: { width: 2400, height: 2400, channels: 3, background: { r: 50, g: 50, b: 50 } },
    })
      .png()
      .toBuffer();

    const result = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "printify-hardcover-square-8x8",
      files: [{ filename: "page-01.png", buffer: singleBuf }],
      allowLowResolutionForTesting: false,
    });

    const report = result.assetReports?.find((r) => r.filename === "page-01.png");
    expect(report).toBeDefined();
    expect(report?.actualDimensions).toEqual({ width: 2400, height: 2400 });
    expect(report?.destinationPages).toEqual([1]);
    expect(report?.effectivePPI).toBe(300);
  });
});
