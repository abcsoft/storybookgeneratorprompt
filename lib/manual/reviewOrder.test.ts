import { describe, expect, it } from "vitest";
import { buildReviewSequence } from "./reviewOrder";
import { buildManifest } from "./manifest";
import { spreadStartPages } from "../pdf/imposition";
import { buildPages } from "../story/registry";
import type { ChildProfile } from "../story/types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

describe("buildReviewSequence", () => {
  it("orders entries and numbers a simple 3-page book", () => {
    const entries = buildReviewSequence([
      { index: 0, kind: "cover", filename: "01.png", spread: false, aspect: "3:2" },
      { index: 1, kind: "scene", filename: "02.png", spread: false, aspect: "3:2" },
      { index: 2, kind: "backcover", filename: "03.png", spread: false, aspect: "3:2" },
    ]);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ layout: "single", page: 1 });
    expect(entries[1]).toMatchObject({ layout: "single", page: 2 });
    expect(entries[2]).toMatchObject({ layout: "single", page: 3 });
  });

  it("gives a spread a two-page range and advances the count by two", () => {
    const entries = buildReviewSequence([
      { index: 0, kind: "cover", filename: "01.png", spread: false, aspect: "3:2" },
      { index: 1, kind: "intro", filename: "02.png", spread: true, aspect: "21:9" },
      { index: 2, kind: "scene", filename: "03.png", spread: false, aspect: "3:2" },
    ]);
    expect(entries[1]).toMatchObject({ layout: "spread", startPage: 2, endPage: 3 });
    expect(entries[2]).toMatchObject({ layout: "single", page: 4 });
  });

  it("agrees exactly with lib/pdf/imposition.ts's spreadStartPages for a real book", () => {
    const manifest = buildManifest(child, "great-adventure");
    const entries = buildReviewSequence(manifest);

    const spreadStarts = entries
      .filter((e) => e.layout === "spread")
      .map((e) => (e as Extract<typeof e, { layout: "spread" }>).startPage);

    expect(spreadStarts).toEqual(spreadStartPages(buildPages(child, "great-adventure")));
  });

  it("keeps manifest order and carries filename/role/aspect through untouched", () => {
    const manifest = buildManifest(child, "dream-big");
    const entries = buildReviewSequence(manifest);
    expect(entries.map((e) => e.manifestIndex)).toEqual(manifest.map((m) => m.index));
    expect(entries[2].filename).toBe(manifest[2].filename);
    expect(entries[2].aspect).toBe(manifest[2].aspect);
  });
});
