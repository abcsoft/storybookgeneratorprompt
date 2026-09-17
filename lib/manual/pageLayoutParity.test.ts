import { describe, expect, it } from "vitest";
import { buildManifest } from "./manifest";
import { buildReviewSequence } from "./reviewOrder";
import type { ChildProfile } from "../story/types";
import { DEFAULT_BOOK_ID } from "../story/registry";
import { getPrintProfile } from "../print/registry";

// Dream Big (DEFAULT_BOOK_ID) now resolves through its registered
// standard-24 StoryEdition, which declares no approvedSpreadPairs — its
// default plan (no explicit mode) is uniformly 24 single-page interior
// assets (no closing spread on 22-23 anymore) plus a separate front/back
// cover, never assigned an interior page number. See
// lib/story/layoutPlan.test.ts's Invariant 2/5/7/8 for the same shift.
describe("Authoritative Page Layout Model (Dream Big default plan)", () => {
  const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };
  const manifest = buildManifest(child, DEFAULT_BOOK_ID, "printify-square-8x8");
  const reviewSeq = buildReviewSequence(manifest);

  it("never infers layout from source image aspect — resolved layout plan is authoritative", () => {
    // manifest[0] — separate front cover, never an interior page.
    const cover = manifest[0];
    expect(cover.kind).toBe("cover");
    expect(cover.physicalPages).toEqual([]);
    expect(cover.pageLayout).toBe("single");
    expect(cover.spread).toBe(false);

    // manifest[1] — greeting: single interior page 1.
    const greeting = manifest.find((m) => m.index === 1)!;
    expect(greeting.pageLayout).toBe("single");
    expect(greeting.spread).toBe(false);
    expect(greeting.physicalPages).toEqual([1]);

    // manifest[2] — intro: single interior page 2.
    const intro = manifest.find((m) => m.index === 2)!;
    expect(intro.pageLayout).toBe("single");
    expect(intro.spread).toBe(false);
    expect(intro.physicalPages).toEqual([2]);

    // manifest[5] — a career scene: single page in the default plan.
    const scene = manifest.find((m) => m.index === 5)!;
    expect(scene.pageLayout).toBe("single");
    expect(scene.spread).toBe(false);

    // manifest[23] — closing: single interior page 23, never a spread —
    // Dream Big's standard-24 edition has no approvedSpreadPairs, so the
    // old default 22-23 closing spread no longer exists.
    const closing = manifest.find((m) => m.index === 23)!;
    expect(closing.kind).toBe("closing");
    expect(closing.pageLayout).toBe("single");
    expect(closing.spread).toBe(false);
    expect(closing.physicalPages).toEqual([23]);

    // manifest[24] — video-qr: single interior page 24 (app-rendered,
    // character-free — a brand-new page kind with no legacy equivalent).
    const videoQr = manifest.find((m) => m.index === 24)!;
    expect(videoQr.kind).toBe("video-qr");
    expect(videoQr.pageLayout).toBe("single");
    expect(videoQr.spread).toBe(false);
    expect(videoQr.physicalPages).toEqual([24]);

    // manifest[25] — separate back cover, never an interior page.
    const backCover = manifest[25];
    expect(backCover.kind).toBe("backcover");
    expect(backCover.physicalPages).toEqual([]);
    expect(backCover.pageLayout).toBe("single");
    expect(backCover.spread).toBe(false);
  });

  it("maps single interior physical pages consistently for review and PDF export — no spread exists in the default plan", () => {
    // Illustration index 1 (greeting) maps to physical page 1.
    const revGreeting = reviewSeq.find((r) => r.manifestIndex === 1)!;
    expect(revGreeting.layout).toBe("single");
    if (revGreeting.layout === "single") {
      expect(revGreeting.page).toBe(1);
    }

    // Illustration index 23 (closing) maps to physical page 23, a single
    // page — never a 22-23 facing-pair spread.
    const revClosing = reviewSeq.find((r) => r.manifestIndex === 23)!;
    expect(revClosing.layout).toBe("single");
    if (revClosing.layout === "single") {
      expect(revClosing.page).toBe(23);
    }

    // No entry in the review sequence is a spread.
    expect(reviewSeq.every((r) => r.layout === "single")).toBe(true);
  });
});
