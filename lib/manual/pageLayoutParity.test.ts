import { describe, expect, it } from "vitest";
import { buildManifest } from "./manifest";
import { buildReviewSequence } from "./reviewOrder";
import type { ChildProfile } from "../story/types";
import { DEFAULT_BOOK_ID } from "../story/registry";
import { getPrintProfile } from "../print/registry";

describe("Authoritative Page Layout Model (02, 05, 10, 20, 23)", () => {
  const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };
  const manifest = buildManifest(child, DEFAULT_BOOK_ID, "printify-square-8x8");
  const reviewSeq = buildReviewSequence(manifest);

  it("never infers layout from source image aspect — pageLayout is authoritative", () => {
    // 02.png (Illustration 2, index 1)
    const illo2 = manifest.find((m) => m.index === 1)!;
    expect(illo2.pageLayout).toBe("spread");
    expect(illo2.spread).toBe(true);

    // 05.png (Illustration 5, index 4)
    const illo5 = manifest.find((m) => m.index === 4)!;
    expect(illo5.pageLayout).toBe("spread");
    expect(illo5.spread).toBe(true);

    // 10.png (Illustration 10, index 9) — MUST BE SINGLE PAGE EVEN IF SOURCE IMAGE IS WIDE
    const illo10 = manifest.find((m) => m.index === 9)!;
    expect(illo10.pageLayout).toBe("single");
    expect(illo10.spread).toBe(false);

    // 20.png (Illustration 20, index 19)
    const illo20 = manifest.find((m) => m.index === 19)!;
    expect(illo20.pageLayout).toBe("spread");
    expect(illo20.spread).toBe(true);

    // 23.png (Illustration 23, index 22)
    const illo23 = manifest.find((m) => m.index === 22)!;
    expect(illo23.pageLayout).toBe("spread");
    expect(illo23.spread).toBe(true);
  });

  it("maps single vs spread physical pages consistently for review and PDF export", () => {
    // Illustration 10 (single page) maps to exactly ONE physical page
    const rev10 = reviewSeq.find((r) => r.manifestIndex === 9)!;
    expect(rev10.layout).toBe("single");
    if (rev10.layout === "single") {
      expect(rev10.page).toBeDefined();
    }

    // Illustration 02 (spread) maps to TWO facing physical pages
    const rev2 = reviewSeq.find((r) => r.manifestIndex === 1)!;
    expect(rev2.layout).toBe("spread");
    if (rev2.layout === "spread") {
      expect(rev2.startPage).toBe(2);
      expect(rev2.endPage).toBe(3);
    }
  });
});
