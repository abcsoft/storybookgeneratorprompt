import { describe, expect, it } from "vitest";
import { matchImportedFiles } from "./importMatch";
import { resolveLayoutPlan } from "../story/layoutPlan";
import type { ChildProfile } from "../story/types";

const required = Array.from({ length: 21 }, (_, i) => `${String(i + 1).padStart(2, "0")}.png`);

describe("matchImportedFiles", () => {
  it("reports a clean, complete import", () => {
    const report = matchImportedFiles(required, required);
    expect(report.required).toBe(21);
    expect(report.matched).toBe(21);
    expect(report.missing).toEqual([]);
    expect(report.duplicates).toEqual([]);
    expect(report.unmatched).toEqual([]);
    expect(report.byIndex.get(0)).toBe("01.png");
  });

  it("lists exact missing filenames for a partial import", () => {
    const provided = required.slice(0, 19); // 19 of 21
    const report = matchImportedFiles(provided, required);
    expect(report.matched).toBe(19);
    expect(report.missing).toEqual(["20.png", "21.png"]);
  });

  it("flags a second file resolving to an already-claimed page as a duplicate", () => {
    const provided = [...required, "page-1.png"]; // also resolves to index 0
    const report = matchImportedFiles(provided, required);
    expect(report.duplicates).toEqual([
      { filename: "page-1.png", index: 0, claimedBy: "01.png" },
    ]);
    expect(report.matched).toBe(21); // duplicate doesn't inflate the match count
  });

  it("flags the exact same filename selected twice as a duplicate", () => {
    const report = matchImportedFiles(["01.png", "01.png"], required);
    expect(report.duplicates).toEqual([
      { filename: "01.png", index: 0, claimedBy: "01.png" },
    ]);
  });

  it("reports filenames that don't match any page as unmatched, not silently dropped", () => {
    const report = matchImportedFiles(["cover-final.png", "00.png"], required);
    expect(report.unmatched).toEqual(["cover-final.png", "00.png"]);
    expect(report.missing.length).toBe(21);
  });

  it("does not let an out-of-range page number silently overwrite an in-range one", () => {
    const report = matchImportedFiles(["99.png"], required);
    expect(report.unmatched).toEqual(["99.png"]);
    expect(report.byIndex.size).toBe(0);
  });

  it("matches the exact 'Required/Matched/Missing/Duplicates/Unmatched' shape from the spec", () => {
    const provided = [
      ...required.slice(0, 19), // 19 matched
      "page-1.png", // duplicate of 01.png
      "notes.png", // unmatched
    ];
    const report = matchImportedFiles(provided, required);
    expect(report.required).toBe(21);
    expect(report.matched).toBe(19);
    expect(report.missing).toEqual(["20.png", "21.png"]);
    expect(report.duplicates.length).toBe(1);
    expect(report.unmatched).toEqual(["notes.png"]);
  });

  describe("Safe Legacy Import Order & Guarded +2 Recovery", () => {
    const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };
    const dreamBigSlots = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    }).assets;

    const files22 = Array.from({ length: 22 }, (_, i) => `${String(i + 1).padStart(2, "0")}.png`);
    const semanticRoles = [
      "pilot", "racer", "astronaut", "doctor", "firefighter", "scientist", "army officer",
      "soccer player", "karate master", "detective", "magician", "chef", "rockstar", "artist",
      "teacher", "explorer", "photographer", "diver", "veterinarian", "inventor", "closing",
      "back cover",
    ];

    it("requires explicit confirmation for 22 legacy files; does NOT assign 01.png to cover or 02.png to intro", () => {
      // Input files 01.png through 22.png without confirmation
      const report = matchImportedFiles(files22, dreamBigSlots, false);

      // Must offer guarded +2 recovery
      expect(report.legacyRecoveryProposal).toBeDefined();
      expect(report.legacyRecoveryProposal).toContain("Cover and intro appear to be missing. Map these 22 assets to slots 3–24?");
      expect(report.legacyRecoveryTable).toBeDefined();
      expect(report.legacyRecoveryTable?.length).toBe(22);

      // DO NOT assign 01.png to 01-cover
      expect(report.bySlotId.get("01-cover")).toBeUndefined();
      expect(report.byIndex.get(0)).toBeUndefined();

      // DO NOT assign 02.png to 02-intro
      expect(report.bySlotId.get("02-intro")).toBeUndefined();
      expect(report.byIndex.get(1)).toBeUndefined();

      // Slots 01-cover and 02-intro remain visibly missing
      expect(report.missingSlots).toContain("01-cover");
      expect(report.missingSlots).toContain("02-intro");
      expect(report.assignedCount).toBe(0);
    });

    it("after explicit confirmation, maps 01.png..22.png to slots 03–24 and keeps 01-cover & 02-intro visibly missing", () => {
      // Explicit confirmation provided
      const report = matchImportedFiles(files22, dreamBigSlots, true);

      expect(report.legacyRecoveryApplied).toBe(true);
      expect(report.assignedCount).toBe(22);

      // 01.png mapped to slot 03-pilot
      expect(report.bySlotId.get("03-pilot")).toBe("01.png");
      expect(report.byIndex.get(2)).toBe("01.png");

      // 02.png mapped to slot 04-race-car-driver
      expect(report.bySlotId.get("04-race-car-driver")).toBe("02.png");

      // 22.png mapped to slot 24-backcover
      expect(report.bySlotId.get("24-backcover")).toBe("22.png");
      expect(report.byIndex.get(23)).toBe("22.png");

      // 01-cover and 02-intro remain visibly missing
      expect(report.missingSlots).toEqual(["01-cover", "02-intro"]);
      expect(report.bySlotId.get("01-cover")).toBeUndefined();
      expect(report.bySlotId.get("02-intro")).toBeUndefined();
    });

    it("uses manifest when available instead of inferring roles from filenames alone", () => {
      const manifest = files22.map((filename, i) => ({
        filename,
        role: semanticRoles[i],
      }));

      // With manifest provided and explicit confirmation
      const report = matchImportedFiles(files22, dreamBigSlots, {
        confirmLegacyOffsetRecovery: true,
        manifest,
      });

      expect(report.assignedCount).toBe(22);
      expect(report.bySlotId.get("03-pilot")).toBe("01.png");
      expect(report.bySlotId.get("24-backcover")).toBe("22.png");
      expect(report.missingSlots).toEqual(["01-cover", "02-intro"]);
    });

    it("accepts a valid 24-file legacy set where 01.png really is cover and 02.png really is intro", () => {
      const files24 = Array.from({ length: 24 }, (_, i) => `${String(i + 1).padStart(2, "0")}.png`);
      const report = matchImportedFiles(files24, dreamBigSlots);

      expect(report.required).toBe(24);
      expect(report.matched).toBe(24);
      expect(report.missingSlots).toEqual([]);
      expect(report.legacyRecoveryProposal).toBeNull();

      // 01.png really is cover
      expect(report.bySlotId.get("01-cover")).toBe("01.png");
      expect(report.byIndex.get(0)).toBe("01.png");

      // 02.png really is intro
      expect(report.bySlotId.get("02-intro")).toBe("02.png");
      expect(report.byIndex.get(1)).toBe("02.png");

      // 03.png is pilot
      expect(report.bySlotId.get("03-pilot")).toBe("03.png");

      // 24.png is back cover
      expect(report.bySlotId.get("24-backcover")).toBe("24.png");
    });

    it("22-file unconfirmed report includes legacyRecoveryChoices with both SHIFT_PLUS_TWO and KEEP_NUMERIC_SLOTS", () => {
      const report = matchImportedFiles(files22, dreamBigSlots, undefined, {
        bookId: "dream-big",
        confirmLegacyOffsetRecovery: false,
      });

      expect(report.legacyRecoveryProposal).toBeDefined();
      expect(report.legacyRecoveryChoices).toBeDefined();
      expect(report.legacyRecoveryChoices?.length).toBe(2);

      const shiftChoice = report.legacyRecoveryChoices?.find((c) => c.interpretation === "SHIFT_PLUS_TWO");
      expect(shiftChoice).toBeDefined();
      expect(shiftChoice!.resultingMissingSlots.map((s) => s.slotId)).toEqual(["01-cover", "02-intro"]);

      const keepChoice = report.legacyRecoveryChoices?.find((c) => c.interpretation === "KEEP_NUMERIC_SLOTS");
      expect(keepChoice).toBeDefined();
      expect(keepChoice!.resultingMissingSlots.map((s) => s.slotId)).toEqual(["23-closing", "24-backcover"]);
    });

    it("KEEP_NUMERIC_SLOTS maps files to slots 01-22, keeps 23-closing and 24-backcover missing", () => {
      const report = matchImportedFiles(files22, dreamBigSlots, undefined, {
        bookId: "dream-big",
        legacyInterpretation: "KEEP_NUMERIC_SLOTS",
      });

      expect(report.assignedCount).toBe(22);

      // 01.png mapped to 01-cover (the user said these ARE cover/intro)
      expect(report.bySlotId.get("01-cover")).toBe("01.png");
      expect(report.bySlotId.get("02-intro")).toBe("02.png");
      expect(report.bySlotId.get("03-pilot")).toBe("03.png");
      expect(report.bySlotId.get("22-inventor")).toBe("22.png");

      // Exact missing slots — only 23-closing and 24-backcover
      expect(report.missingSlots).toEqual(["23-closing", "24-backcover"]);
      expect(report.missingSlotDetails).toEqual([
        expect.objectContaining({ slotId: "23-closing" }),
        expect.objectContaining({ slotId: "24-backcover" }),
      ]);

      // Must NOT have 01-cover or 02-intro missing
      expect(report.missingSlots).not.toContain("01-cover");
      expect(report.missingSlots).not.toContain("02-intro");
    });

    it("SHIFT_PLUS_TWO via legacyInterpretation produces exact missingSlotDetails", () => {
      const report = matchImportedFiles(files22, dreamBigSlots, undefined, {
        bookId: "dream-big",
        legacyInterpretation: "SHIFT_PLUS_TWO",
        confirmLegacyOffsetRecovery: true,
      });

      expect(report.legacyRecoveryApplied).toBe(true);
      expect(report.missingSlotDetails).toEqual([
        expect.objectContaining({ slotId: "01-cover", physicalPages: [1] }),
        expect.objectContaining({ slotId: "02-intro", physicalPages: [2] }),
      ]);

      // Must NOT report 23-closing or 24-backcover
      const missingIds = report.missingSlots;
      expect(missingIds).not.toContain("23-closing");
      expect(missingIds).not.toContain("24-backcover");
    });

    it("does not use totalSlots === 24 as proof of Dream Big (scoped to exact bookId)", () => {
      // If bookId is not "dream-big", 22 legacy files should NOT trigger recovery
      const report = matchImportedFiles(files22, dreamBigSlots, undefined, {
        bookId: "some-other-book",
        confirmLegacyOffsetRecovery: false,
      });

      expect(report.legacyRecoveryProposal).toBeNull();
      expect(report.legacyRecoveryChoices).toBeUndefined();
    });
  });
});
