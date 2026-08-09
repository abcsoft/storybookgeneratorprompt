import { describe, expect, it } from "vitest";
import { buildManifest, imageFilename, renderPromptsMarkdown } from "./manifest";
import { indexFromFilename } from "./assemble";
import type { ChildProfile } from "../story/types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

describe("buildManifest", () => {
  const manifest = buildManifest(child);

  it("has one entry per page with sequential numbering", () => {
    expect(manifest.length).toBe(24);
    expect(manifest[0].page).toBe(1);
    expect(manifest[0].index).toBe(0);
    expect(manifest.at(-1)?.page).toBe(24);
    expect(manifest.at(-1)?.index).toBe(23);
  });

  it("uses zero-padded 1-based filenames", () => {
    expect(manifest[0].filename).toBe("01.png");
    expect(manifest[2].filename).toBe("03.png");
    expect(manifest.at(-1)?.filename).toBe("24.png");
  });

  it("personalizes every prompt and text", () => {
    for (const m of manifest) {
      expect(m.prompt.length).toBeGreaterThan(0);
      expect(m.text.length).toBeGreaterThan(0);
    }
    expect(manifest.filter((m) => m.prompt.includes("4-year-old boy")).length).toBe(24);
  });

  it("defaults to the classic landscape aspect ratios (no profileId passed)", () => {
    expect(manifest.filter((m) => !m.spread).every((m) => m.aspect === "3:2")).toBe(true);
    expect(manifest.filter((m) => m.spread).every((m) => m.aspect === "21:9")).toBe(true);
  });

  it("switches aspect ratios when a different print profile is given", () => {
    const printifyManifest = buildManifest(
      child,
      undefined,
      "printify-hardcover-square-8x8",
    );
    expect(printifyManifest.filter((m) => !m.spread).every((m) => m.aspect === "1:1")).toBe(
      true,
    );
    expect(printifyManifest.filter((m) => m.spread).every((m) => m.aspect === "2:1")).toBe(
      true,
    );
    // Profile geometry updates prompt text — Square profile gets square 1:1 guidance.
    expect(printifyManifest.map((m) => m.prompt)).not.toEqual(manifest.map((m) => m.prompt));
    expect(printifyManifest[0].prompt).toContain("Square 1:1 composition");
    expect(manifest[0].prompt).toContain("Landscape composition");
  });
});

describe("renderPromptsMarkdown", () => {
  const md = renderPromptsMarkdown(child);

  it("includes the child name, the character-anchor step, and every page", () => {
    expect(md).toContain("Alex's Dream Big");
    expect(md).toContain("close-ups of just"); // photo-prep guidance
    expect(md).toContain("00-character.png"); // character-anchor step
    expect(md).toContain("save as `01.png`");
    expect(md).toContain("save as `24.png`");
  });

  it("reflects the chosen print profile's aspect ratios", () => {
    const printifyMd = renderPromptsMarkdown(
      child,
      undefined,
      "printify-hardcover-square-8x8",
    );
    expect(printifyMd).toContain("**1:1**");
    expect(printifyMd).toContain("**2:1**");
  });
});

describe("imageFilename", () => {
  it("zero-pads the 1-based page number", () => {
    expect(imageFilename(0)).toBe("01.png");
    expect(imageFilename(9)).toBe("10.png");
  });
});

describe("indexFromFilename", () => {
  it("extracts the 0-based index from a filename", () => {
    expect(indexFromFilename("01.png")).toBe(0);
    expect(indexFromFilename("12.jpg")).toBe(11);
    expect(indexFromFilename("page-3.png")).toBe(2);
  });

  it("returns null when there is no usable number", () => {
    expect(indexFromFilename("cover.png")).toBeNull();
    expect(indexFromFilename("00.png")).toBeNull();
  });
});
