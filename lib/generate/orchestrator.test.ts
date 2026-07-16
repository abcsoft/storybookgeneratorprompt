import { describe, expect, it, vi } from "vitest";
import { generateBook } from "./orchestrator";
import type { ChildProfile, ReferencePhoto } from "../story/types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };
const photos: ReferencePhoto[] = [{ mimeType: "image/jpeg", base64: "AAAA" }];

const stubImage = (mimeType = "image/png") => ({
  data: Buffer.from("fake-png"),
  mimeType,
});

describe("generateBook", () => {
  it("generates one illustration per page", async () => {
    const generate = vi.fn(async () => stubImage());
    const pages = await generateBook(child, photos, { generate, anchor: false });

    expect(pages.length).toBe(24);
    expect(generate).toHaveBeenCalledTimes(24);
    expect(pages.every((p) => p.image !== null && !p.failed)).toBe(true);
  });

  it("generates a character anchor and reuses it on every page", async () => {
    const generate = vi.fn(
      async (_prompt: string, _refs: ReferencePhoto[]) => stubImage(),
    );
    await generateBook(child, photos, { generate });

    // 1 anchor portrait + 24 pages
    expect(generate).toHaveBeenCalledTimes(25);
    // first call is the master character reference, built from the raw photos
    expect(generate.mock.calls[0][0]).toContain("MASTER CHARACTER REFERENCE");
    expect(generate.mock.calls[0][1]).toHaveLength(photos.length);
    // every page call gets the anchor prepended to the references
    expect(generate.mock.calls[1][1]).toHaveLength(photos.length + 1);
  });

  it("reports progress up to the total", async () => {
    const seen: Array<[number, number]> = [];
    await generateBook(child, photos, {
      generate: async () => stubImage(),
      onProgress: (completed, total) => seen.push([completed, total]),
    });
    expect(seen.at(-1)).toEqual([24, 24]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const generate = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return stubImage();
    });

    await generateBook(child, photos, { generate, concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("survives a single page failure and continues", async () => {
    const generate = vi.fn(async (prompt: string) => {
      if (prompt.toLowerCase().includes("astronaut")) {
        throw new Error("model overloaded");
      }
      return stubImage();
    });

    const pages = await generateBook(child, photos, { generate });
    const failed = pages.filter((p) => p.failed);

    expect(failed.length).toBe(1);
    expect(failed[0].image).toBeNull();
    // The rest of the book still generated.
    expect(pages.filter((p) => !p.failed).length).toBe(23);
  });
});
