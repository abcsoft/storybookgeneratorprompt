import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { composeCover } from "./coverComposer";
import { printifyHardcoverSquare8x8Profile } from "./profiles/printifyHardcoverSquare8x8";

async function solidPng(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: color } })
    .png()
    .toBuffer();
}

describe("composeCover (integration, launches Puppeteer)", () => {
  it("renders a PNG at the profile's exact wrap-cover pixel dimensions", async () => {
    const front = await solidPng({ r: 240, g: 180, b: 120 });
    const back = await solidPng({ r: 80, g: 120, b: 200 });

    const png = await composeCover(
      printifyHardcoverSquare8x8Profile,
      {
        front: { data: front, mimeType: "image/png" },
        back: { data: back, mimeType: "image/png" },
      },
      { title: "Great Adventure", childName: "Aarav" },
    );

    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(5370);
    expect(meta.height).toBe(2850);
    expect(meta.format).toBe("png");
  });

  it("still renders correctly with no back-cover art provided", async () => {
    const front = await solidPng({ r: 10, g: 200, b: 90 });
    const png = await composeCover(
      printifyHardcoverSquare8x8Profile,
      { front: { data: front, mimeType: "image/png" } },
      { title: "Dream Big", childName: "Zara" },
    );
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(5370);
    expect(meta.height).toBe(2850);
  });

  it("rejects for a profile with no coverGeometryPx", async () => {
    const front = await solidPng({ r: 1, g: 2, b: 3 });
    await expect(
      composeCover(
        { ...printifyHardcoverSquare8x8Profile, coverGeometryPx: undefined },
        { front: { data: front, mimeType: "image/png" } },
        { title: "x", childName: "y" },
      ),
    ).rejects.toThrow();
  });
});
