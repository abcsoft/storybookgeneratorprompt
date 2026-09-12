import { describe, expect, it } from "vitest";
import { buildManifest } from "./manifest";
import { buildReviewSequence } from "./reviewOrder";
import type { ChildProfile } from "../story/types";
import { DEFAULT_BOOK_ID } from "../story/registry";
import { getPrintProfile } from "../print/registry";

describe("Authoritative Page Layout Model (Dream Big default plan)", () => {
  const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };
  const manifest = buildManifest(child, DEFAULT_BOOK_ID, "printify-square-8x8");
  const reviewSeq = buildReviewSequence(manifest);

  it("never infers layout from source image aspect — resolved layout plan is authoritative", () => {
    // 02.png / page-01.png (Illustration 2, index 1) — Intro scene: single right-hand page 1
    const illo2 = manifest.find((m) => m.index === 1)!;
    expect(illo2.pageLayout).toBe("single");
    expect(illo2.spread).toBe(false);

    // 05.png / page-04.png (Illustration 5, index 4) — Astronaut: single page in default plan
    const illo5 = manifest.find((m) => m.index === 4)!;
    expect(illo5.pageLayout).toBe("single");
    expect(illo5.spread).toBe(false);

    // 11.png / page-10.png (Illustration 11, index 10) — Deep-sea Diver: single page in default plan
    const illo11 = manifest.find((m) => m.index === 10)!;
    expect(illo11.pageLayout).toBe("single");
    expect(illo11.spread).toBe(false);

    // 23.png / spread-22-23.png (Illustration 23, index 22) — Closing spread: physical pages 22-23
    const illo23 = manifest.find((m) => m.index === 22)!;
    expect(illo23.pageLayout).toBe("spread");
    expect(illo23.spread).toBe(true);

    // 24.png / page-24.png (Illustration 24, index 23) — Final Dream Big page: single page 24
    const illo24 = manifest.find((m) => m.index === 23)!;
    expect(illo24.pageLayout).toBe("single");
    expect(illo24.spread).toBe(false);
  });

  it("maps single vs spread physical pages consistently for review and PDF export", () => {
    // Illustration 2 (Intro) maps to physical page 1
    const rev2 = reviewSeq.find((r) => r.manifestIndex === 1)!;
    expect(rev2.layout).toBe("single");
    if (rev2.layout === "single") {
      expect(rev2.page).toBe(1);
    }

    // Illustration 23 (Closing spread) maps to facing pages 22-23
    const rev23 = reviewSeq.find((r) => r.manifestIndex === 22)!;
    expect(rev23.layout).toBe("spread");
    if (rev23.layout === "spread") {
      expect(rev23.startPage).toBe(22);
      expect(rev23.endPage).toBe(23);
    }
  });
});
