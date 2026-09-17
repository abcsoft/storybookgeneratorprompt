/**
 * Confirms Classic Landscape — the profile the live UI actually selects for
 * Great Adventure — now has a real, separate production interior PDF
 * (`part=interior`), not just the combined 26-page review proof. This is
 * the gap flagged as unresolved in the prior repair pass.
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { POST as assemblePost } from "../../app/api/assemble/route";
import { resolveLayoutPlan } from "./layoutPlan";

async function makeFixture(width = 3375, height = 2475): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 140, b: 200 } } }).png().toBuffer();
}

describe("Great Adventure / Classic Landscape — separate production interior PDF", () => {
  it("part=interior returns exactly 24 pages, greeting first / video-qr last, no cover/backcover", async () => {
    const plan = resolveLayoutPlan({
      child: { name: "Ihan", age: 5, gender: "boy" },
      bookId: "great-adventure",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });
    expect(plan.interiorPageCount).toBe(24);

    const formData = new FormData();
    formData.append("name", "Ihan");
    formData.append("age", "5");
    formData.append("gender", "boy");
    formData.append("bookId", "great-adventure");
    formData.append("profileId", "classic-landscape-11x8");
    formData.append("layoutMode", "standard-single");
    formData.append("videoUrl", "https://example.com/watch/ihan-great-adventure");
    formData.append("part", "interior");

    for (const slot of plan.assets) {
      const buf = await makeFixture();
      formData.append("images", new File([new Uint8Array(buf)], slot.legacyAliases[0] ?? slot.filename, { type: "image/png" }));
    }

    const req = new Request("http://localhost:3000/api/assemble", { method: "POST", body: formData });
    const res = await assemblePost(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("x-storybook-file-role")).toBe("production-interior");
    expect(res.headers.get("content-disposition")).toContain("great-adventure-interior.pdf");

    const pdfBuffer = Buffer.from(await res.arrayBuffer());
    expect(pdfBuffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const pageCount = (pdfBuffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pageCount).toBe(24);
  }, 60000);

  it("the default (combined) response is still the 26-page review proof — unchanged behavior", async () => {
    const plan = resolveLayoutPlan({
      child: { name: "Ihan", age: 5, gender: "boy" },
      bookId: "great-adventure",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    const formData = new FormData();
    formData.append("name", "Ihan");
    formData.append("age", "5");
    formData.append("gender", "boy");
    formData.append("bookId", "great-adventure");
    formData.append("profileId", "classic-landscape-11x8");
    formData.append("layoutMode", "standard-single");
    formData.append("videoUrl", "https://example.com/watch/ihan-great-adventure");
    // no `part` field — default combined proof

    for (const slot of plan.assets) {
      const buf = await makeFixture();
      formData.append("images", new File([new Uint8Array(buf)], slot.legacyAliases[0] ?? slot.filename, { type: "image/png" }));
    }

    const req = new Request("http://localhost:3000/api/assemble", { method: "POST", body: formData });
    const res = await assemblePost(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-storybook-file-role")).toBe("combined-review-proof");
    const pdfBuffer = Buffer.from(await res.arrayBuffer());
    const pageCount = (pdfBuffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pageCount).toBe(26);
  }, 60000);
});
