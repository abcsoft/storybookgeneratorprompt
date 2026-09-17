import { describe, expect, it } from "vitest";
import sharp from "sharp";
import jsQR from "jsqr";
import {
  DRAFT_VIDEO_QR_PLACEHOLDER,
  renderVideoQrPng,
  renderVideoQrSvg,
  validateVideoQrTargetForProduction,
  videoQrRedirectUrl,
  type VideoQrTarget,
} from "./qr";

async function decodePng(buffer: Buffer): Promise<string | null> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return result?.data ?? null;
}

describe("videoQrRedirectUrl", () => {
  it("builds a stable redirect URL from a token, never embedding a raw provider URL directly", () => {
    const target: VideoQrTarget = { token: "book-abc123", redirectBaseUrl: "https://storybook.example/v" };
    expect(videoQrRedirectUrl(target)).toBe("https://storybook.example/v/book-abc123");
  });

  it("URL-encodes the token", () => {
    const target: VideoQrTarget = { token: "has space", redirectBaseUrl: "https://storybook.example/v" };
    expect(videoQrRedirectUrl(target)).toBe("https://storybook.example/v/has%20space");
  });
});

describe("validateVideoQrTargetForProduction", () => {
  it("rejects a missing target", () => {
    expect(validateVideoQrTargetForProduction(null).valid).toBe(false);
    expect(validateVideoQrTargetForProduction(undefined).valid).toBe(false);
  });

  it("rejects the draft placeholder", () => {
    expect(validateVideoQrTargetForProduction(DRAFT_VIDEO_QR_PLACEHOLDER).valid).toBe(false);
  });

  it("rejects a non-https redirect base", () => {
    const target: VideoQrTarget = { token: "abc", redirectBaseUrl: "http://insecure.example/v" };
    expect(validateVideoQrTargetForProduction(target).valid).toBe(false);
  });

  it("accepts a real https token target", () => {
    const target: VideoQrTarget = { token: "book-abc123", redirectBaseUrl: "https://storybook.example/v" };
    const result = validateVideoQrTargetForProduction(target);
    expect(result.valid).toBe(true);
  });
});

describe("QR generation — deterministic and decodable (rendered-PDF-equivalent round trip)", () => {
  const target: VideoQrTarget = { token: "yasfa-dream-big-9F2A", redirectBaseUrl: "https://storybook.example/v" };
  const url = videoQrRedirectUrl(target);

  it("renderVideoQrSvg is deterministic — same URL produces byte-identical SVG", async () => {
    const svgA = await renderVideoQrSvg(url);
    const svgB = await renderVideoQrSvg(url);
    expect(svgA).toBe(svgB);
    expect(svgA).toContain("<svg");
  });

  it("the rendered QR PNG decodes back to the exact original URL (proves the QR is genuinely scannable, not just an image)", async () => {
    const png = await renderVideoQrPng(url, 600);
    const decoded = await decodePng(png);
    expect(decoded).toBe(url);
  });

  it("decodes correctly at a range of raster sizes (simulating different print DPI outputs)", async () => {
    for (const size of [300, 600, 1200]) {
      const png = await renderVideoQrPng(url, size);
      const decoded = await decodePng(png);
      expect(decoded, `failed to decode at ${size}px`).toBe(url);
    }
  });

  it("different tokens produce different (still-decodable) QR content", async () => {
    const otherTarget: VideoQrTarget = { token: "other-child-token", redirectBaseUrl: "https://storybook.example/v" };
    const otherUrl = videoQrRedirectUrl(otherTarget);
    const png = await renderVideoQrPng(otherUrl, 600);
    const decoded = await decodePng(png);
    expect(decoded).toBe(otherUrl);
    expect(decoded).not.toBe(url);
  });
});
