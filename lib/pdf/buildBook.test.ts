import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildBook, chooseVerseInk, optimizePageImage } from "./buildBook";
import type { ChildProfile, GeneratedPage } from "../story/types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

describe("chooseVerseInk", () => {
  it("uses dark ink over a bright scene and white over a dark scene", () => {
    expect(chooseVerseInk(230)).toBe("dark");
    expect(chooseVerseInk(40)).toBe("light");
  });
});

/** A tiny solid-color PNG so Puppeteer has a real image to render. */
async function solidPng(color: {
  r: number;
  g: number;
  b: number;
}): Promise<Buffer> {
  return sharp({
    create: { width: 64, height: 64, channels: 3, background: color },
  })
    .png()
    .toBuffer();
}

describe("optimizePageImage", () => {
  it("downscales oversized images to print size and re-encodes as JPEG", async () => {
    const big = await sharp({
      create: { width: 4096, height: 4096, channels: 3, background: { r: 200, g: 150, b: 120 } },
    })
      .png()
      .toBuffer();

    const { data, mimeType } = await optimizePageImage(big);
    const meta = await sharp(data).metadata();

    expect(mimeType).toBe("image/jpeg");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(2625);
    expect(data.length).toBeLessThan(big.length);
  });
});

describe("buildBook (integration, launches Puppeteer)", () => {
  it("emits a valid PDF from generated pages", async () => {
    const img = await solidPng({ r: 240, g: 180, b: 120 });
    const pages: GeneratedPage[] = [
      {
        index: 0,
        kind: "cover",
        text: "Alex's Dream Big Adventure",
        image: img,
        imageMimeType: "image/png",
        failed: false,
      },
      {
        index: 1,
        kind: "scene",
        role: "PILOT",
        text: "Up and away, Alex!",
        image: img,
        imageMimeType: "image/png",
        failed: false,
      },
      {
        index: 2,
        kind: "backcover",
        text: "Dream big.",
        image: null,
        imageMimeType: "image/png",
        failed: true,
      },
    ];

    const pdf = await buildBook(pages, child);

    // Valid PDF header and non-trivial size.
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
