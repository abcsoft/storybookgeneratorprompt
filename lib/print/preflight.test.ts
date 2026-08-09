import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { runPreflight } from "./preflight";
import { buildManifest } from "../manual/manifest";
import type { ChildProfile } from "../story/types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

/** A tiny solid-color PNG at a given width:height ratio. */
async function makeImage(ratio: number): Promise<Buffer> {
  const height = 200;
  const width = Math.round(height * ratio);
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 150, b: 120 } },
  })
    .png()
    .toBuffer();
}

describe("runPreflight", () => {
  it("passes ok on a complete, correctly-shaped set of images", async () => {
    const manifest = buildManifest(child, "dream-big");
    const files = await Promise.all(
      manifest.map(async (m) => ({
        filename: m.filename,
        buffer: await makeImage(m.spread ? 21 / 9 : 3 / 2),
      })),
    );

    const result = await runPreflight({ child, bookId: "dream-big", files });

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

    const result = await runPreflight({ child, bookId: "dream-big", files });

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
        { filename: "page-1.png", buffer: img }, // also resolves to index 0
      ],
    });

    expect(result.errors.some((e) => e.includes("both resolve"))).toBe(true);
  });

  it("errors when a source's ORIENTATION is incompatible with the page, warns on a mild ratio mismatch", async () => {
    const manifest = buildManifest(child, "dream-big");
    const files = await Promise.all(
      manifest.map(async (m, i) => ({
        filename: m.filename,
        // First page: portrait instead of the expected 3:2 landscape —
        // opposite orientation, a genuine error. Everything else: correct.
        buffer: await makeImage(i === 0 ? 2 / 3 : m.spread ? 21 / 9 : 3 / 2),
      })),
    );

    const result = await runPreflight({ child, bookId: "dream-big", files });

    expect(result.errors.some((e) => e.includes("portrait") && e.includes("landscape"))).toBe(
      true,
    );
  });

  it(
    "does NOT hard-fail Printify pages whose source is a usable-but-non-ideal ratio " +
      "(the bug this validation was rewritten to fix)",
    async () => {
      const manifest = buildManifest(child, "great-adventure", "printify-hardcover-square-8x8");
      const files = await Promise.all(
        manifest.map(async (m) => ({
          filename: m.filename,
          // Every single page gets an ordinary 3:2 landscape photo (not the
          // ideal 1:1) and every spread gets a slightly-off-2:1 landscape —
          // both usable, neither exact.
          buffer: await makeImage(m.spread ? 16 / 9 : 3 / 2),
        })),
      );

      const result = await runPreflight({
        child,
        bookId: "great-adventure",
        profileId: "printify-hardcover-square-8x8",
        files,
      });

      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings.some((w) => w.includes("aspect ratio"))).toBe(true);
    },
  );

  it("still blocks a genuinely incompatible orientation on Printify (portrait source for a wide spread)", async () => {
    const manifest = buildManifest(child, "great-adventure", "printify-hardcover-square-8x8");
    const files = await Promise.all(
      manifest.map(async (m) => ({
        filename: m.filename,
        // Spreads get a portrait source — opposite orientation to the 2:1
        // wide-spread target. Single pages get an on-ratio square photo.
        buffer: await makeImage(m.spread ? 2 / 3 : 1),
      })),
    );

    const result = await runPreflight({
      child,
      bookId: "great-adventure",
      profileId: "printify-hardcover-square-8x8",
      files,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("portrait") && e.includes("landscape"))).toBe(
      true,
    );
  });

  it("warns about the Printify placeholder spine width, not for the landscape profile", async () => {
    const landscapeFiles = await Promise.all(
      buildManifest(child, "dream-big").map(async (m) => ({
        filename: m.filename,
        buffer: await makeImage(m.spread ? 21 / 9 : 3 / 2),
      })),
    );
    const landscape = await runPreflight({ child, bookId: "dream-big", files: landscapeFiles });
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
    });
    expect(printify.warnings.some((w) => w.includes("Spine width"))).toBe(true);
  });
});
