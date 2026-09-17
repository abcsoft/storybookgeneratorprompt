/**
 * Regression coverage for a confirmed production defect: the cover-front
 * and greeting slots in the rendered Great Adventure draft PDF showed
 * visually identical artwork — the same uploaded file's bytes had been
 * silently assigned to two different required slots. Detected here by
 * comparing SHA-256 content hashes across ALL resolved slots (never by
 * filename, which can legitimately differ while the bytes are identical, or
 * be identical while the bytes differ).
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { runPreflight, type PreflightFile } from "./preflight";
import { resolveLayoutPlan } from "../story/layoutPlan";
import type { ChildProfile } from "../story/types";

const TEST_CHILD: ChildProfile = { name: "Ihan", age: 5, gender: "boy" };

async function fullPlanFiles(distinctPerSlot: boolean): Promise<{ files: PreflightFile[]; mapping: Map<string, PreflightFile> }> {
  const plan = resolveLayoutPlan({
    child: TEST_CHILD,
    bookId: "great-adventure",
    profileId: "classic-landscape-11x8",
    mode: "standard-single",
  });

  // A single shared buffer, reused for cover-front + 01-greeting when
  // `distinctPerSlot` is false — simulates the exact confirmed bug.
  const sharedBuf = await sharp({ create: { width: 3375, height: 2475, channels: 3, background: { r: 90, g: 130, b: 190 } } }).png().toBuffer();

  const files: PreflightFile[] = [];
  const mapping = new Map<string, PreflightFile>();
  let colorSeed = 0;
  for (const slot of plan.assets) {
    const isCoverOrGreeting = slot.slotId === "cover-front" || slot.slotId === "01-greeting";
    let buf: Buffer;
    if (!distinctPerSlot && isCoverOrGreeting) {
      buf = sharedBuf;
    } else {
      colorSeed += 7;
      buf = await sharp({
        create: { width: 3375, height: 2475, channels: 3, background: { r: (colorSeed * 3) % 255, g: (colorSeed * 5) % 255, b: (colorSeed * 7) % 255 } },
      }).png().toBuffer();
    }
    const pfFile: PreflightFile = { filename: slot.expectedFilename, buffer: buf };
    files.push(pfFile);
    mapping.set(slot.slotId, pfFile);
  }
  return { files, mapping };
}

describe("Duplicate artwork across slots — cover/greeting confirmed defect", () => {
  it("detects the same SHA-256 content assigned to cover-front and 01-greeting and blocks production", async () => {
    const { files, mapping } = await fullPlanFiles(false);
    const preflight = await runPreflight({
      child: TEST_CHILD,
      bookId: "great-adventure",
      profileId: "classic-landscape-11x8",
      files,
      mode: "standard-single",
      resolvedSlotMapping: mapping,
    });

    const dupIssue = preflight.issues?.find((i) => i.type === "DUPLICATE_ARTWORK_ACROSS_SLOTS");
    expect(dupIssue, "expected a DUPLICATE_ARTWORK_ACROSS_SLOTS issue").toBeDefined();
    expect(dupIssue!.actual).toContain("cover-front");
    expect(dupIssue!.actual).toContain("01-greeting");
    expect(preflight.ok).toBe(false);
  });

  it("26 separately-generated distinct files produce zero duplicate-artwork issues", async () => {
    const { files, mapping } = await fullPlanFiles(true);
    const preflight = await runPreflight({
      child: TEST_CHILD,
      bookId: "great-adventure",
      profileId: "classic-landscape-11x8",
      files,
      mode: "standard-single",
      resolvedSlotMapping: mapping,
    });

    const dupIssues = preflight.issues?.filter((i) => i.type === "DUPLICATE_ARTWORK_ACROSS_SLOTS") ?? [];
    expect(dupIssues.length).toBe(0);
  });

  it("replacing one slot's artwork does not mutate or falsely flag an unrelated slot", async () => {
    const { files, mapping } = await fullPlanFiles(true);
    // Replace only the greeting slot with a brand-new distinct image.
    const replacement = await sharp({ create: { width: 3375, height: 2475, channels: 3, background: { r: 5, g: 6, b: 7 } } }).png().toBuffer();
    const greetingFile = mapping.get("01-greeting")!;
    const newGreetingFile: PreflightFile = { filename: greetingFile.filename, buffer: replacement };
    mapping.set("01-greeting", newGreetingFile);
    const newFiles = files.map((f) => (f === greetingFile ? newGreetingFile : f));

    const preflight = await runPreflight({
      child: TEST_CHILD,
      bookId: "great-adventure",
      profileId: "classic-landscape-11x8",
      files: newFiles,
      mode: "standard-single",
      resolvedSlotMapping: mapping,
    });

    const dupIssues = preflight.issues?.filter((i) => i.type === "DUPLICATE_ARTWORK_ACROSS_SLOTS") ?? [];
    expect(dupIssues.length).toBe(0);
    // cover-front's own content is untouched by the greeting replacement.
    expect(mapping.get("cover-front")!.buffer).not.toBe(replacement);
  });
});
