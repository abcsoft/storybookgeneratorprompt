/**
 * Fail-closed coverage for the video-qr page's production gate in
 * assembleFromImages (lib/manual/assemble.ts): a production export must
 * never ship a placeholder or missing QR. These tests exercise only the
 * fast, pre-render validation path (it throws before any Puppeteer/PDF work
 * starts), not the full render — see lib/story/qr.test.ts for the QR
 * generation/decode round trip, and the live-browser walkthrough for the
 * end-to-end render.
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { assembleFromImages, InvalidVideoQrError, MissingArtworkError, type ProvidedImage } from "./assemble";
import { resolveLayoutPlan } from "../story/layoutPlan";
import type { ChildProfile } from "../story/types";

const child: ChildProfile = { name: "Ihan", age: 5, gender: "boy" };
const bookId = "great-adventure";
const profileId = "classic-landscape-11x8";

/** A tiny valid 1x1 PNG for every required slot, keyed by slotId — lets
 *  production-path tests reach the video-qr gate instead of failing earlier
 *  on MissingArtworkError. */
async function fakeResolvedSlotMapping(): Promise<Map<string, ProvidedImage>> {
  const plan = resolveLayoutPlan({ child, bookId, profileId, mode: "standard-single" });
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .png()
    .toBuffer();
  const map = new Map<string, ProvidedImage>();
  for (const slot of plan.assets) {
    map.set(slot.slotId, { buffer: png, mimeType: "image/png" });
  }
  return map;
}

describe("assembleFromImages — video-qr production gate", () => {
  it("Great Adventure's standard-24 edition resolves a video-qr interior slot", () => {
    const plan = resolveLayoutPlan({ child, bookId, profileId, mode: "standard-single" });
    expect(plan.assets.some((s) => s.pageKind === "video-qr")).toBe(true);
  });

  it("production export fails closed with InvalidVideoQrError when no video target is configured", async () => {
    const resolvedSlotMapping = await fakeResolvedSlotMapping();
    await expect(
      assembleFromImages(child, new Map(), bookId, profileId, {
        draft: false,
        resolvedSlotMapping,
      }),
    ).rejects.toThrow(InvalidVideoQrError);
  });

  it("production export fails closed when the configured target is still the draft placeholder", async () => {
    const resolvedSlotMapping = await fakeResolvedSlotMapping();
    await expect(
      assembleFromImages(child, new Map(), bookId, profileId, {
        draft: false,
        resolvedSlotMapping,
        videoTarget: { token: "DRAFT-PLACEHOLDER", redirectBaseUrl: "https://draft.invalid/not-for-print" },
      }),
    ).rejects.toThrow(InvalidVideoQrError);
  });

  it("production export fails closed when the configured target is non-https", async () => {
    const resolvedSlotMapping = await fakeResolvedSlotMapping();
    await expect(
      assembleFromImages(child, new Map(), bookId, profileId, {
        draft: false,
        resolvedSlotMapping,
        videoTarget: { token: "real-book-token", redirectBaseUrl: "http://insecure.example/v" },
      }),
    ).rejects.toThrow(InvalidVideoQrError);
  });

  it("missing artwork is still reported as MissingArtworkError, not masked by the video-qr gate", async () => {
    await expect(
      assembleFromImages(child, new Map(), bookId, profileId, { draft: false }),
    ).rejects.toThrow(MissingArtworkError);
  });
});
