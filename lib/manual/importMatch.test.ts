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

    // Dream Big's standard-24 edition splits the old 24-slot sequence into
    // cover-front + 24 interior pages (including 2 brand-new pages with no
    // legacy equivalent: greeting at page 1, video-qr at page 24) +
    // cover-back — see importMatch.ts's dreamBig22LegacyTargets() for the
    // exact mapping this guarded recovery now uses.

    it("requires explicit confirmation for 22 legacy files; does NOT assign 01.png to the front cover or greeting", () => {
      // Input files 01.png through 22.png without confirmation
      const report = matchImportedFiles(files22, dreamBigSlots, false);

      // Must offer guarded +2 recovery
      expect(report.legacyRecoveryProposal).toBeDefined();
      expect(report.legacyRecoveryProposal).toContain("Cover and intro appear to be missing. Map these 22 assets to slots 3–24?");
      expect(report.legacyRecoveryTable).toBeDefined();
      expect(report.legacyRecoveryTable?.length).toBe(22);

      // DO NOT assign 01.png to cover-front or 01-greeting
      expect(report.bySlotId.get("cover-front")).toBeUndefined();
      expect(report.bySlotId.get("01-greeting")).toBeUndefined();

      // DO NOT assign 02.png to 02-intro
      expect(report.bySlotId.get("02-intro")).toBeUndefined();

      // All 4 slots with no image among these 22 legacy files remain visibly missing
      expect(report.missingSlots).toContain("cover-front");
      expect(report.missingSlots).toContain("01-greeting");
      expect(report.missingSlots).toContain("02-intro");
      expect(report.missingSlots).toContain("24-video-qr-background");
      expect(report.assignedCount).toBe(0);
    });

    it("after explicit confirmation (\"files are Pilot through Back Cover\"), maps 01.png..22.png to the 20 careers + closing + the back cover", () => {
      // Explicit confirmation provided
      const report = matchImportedFiles(files22, dreamBigSlots, true);

      expect(report.legacyRecoveryApplied).toBe(true);
      expect(report.assignedCount).toBe(22);

      // 01.png mapped to slot 03-scene-01 (first career scene, was "pilot")
      expect(report.bySlotId.get("03-scene-01")).toBe("01.png");

      // 02.png mapped to slot 04-scene-02 (second career scene)
      expect(report.bySlotId.get("04-scene-02")).toBe("02.png");

      // 22.png (the old "backcover" file) mapped to the separate cover-back asset
      expect(report.bySlotId.get("cover-back")).toBe("22.png");

      // cover-front, greeting, intro, and video-qr remain visibly missing —
      // none of them existed in any legacy package.
      expect(report.missingSlots).toEqual(["cover-front", "01-greeting", "02-intro", "24-video-qr-background"]);
      expect(report.bySlotId.get("cover-front")).toBeUndefined();
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
      expect(report.bySlotId.get("03-scene-01")).toBe("01.png");
      expect(report.bySlotId.get("cover-back")).toBe("22.png");
      expect(report.missingSlots).toEqual(["cover-front", "01-greeting", "02-intro", "24-video-qr-background"]);
    });

    it("accepts a valid 26-file canonical set: cover-front.png, cover-back.png, and all 24 canonical interior filenames", () => {
      // Real canonical filenames (as buildManifest/renderPromptsMarkdown
      // instruct), not bare "01.png".."24.png" — a bare "NN.png" is
      // deliberately still interpreted as the OLD legacy single-cover-image
      // convention for "01.png" (see cover-front's hardcoded legacyAliases),
      // so mixing it with an explicit cover-front.png would be a genuinely
      // ambiguous, self-conflicting input, not a realistic canonical upload.
      const files26 = dreamBigSlots.map((s) => s.expectedFilename);
      const report = matchImportedFiles(files26, dreamBigSlots);

      expect(report.required).toBe(26);
      expect(report.matched).toBe(26);
      expect(report.missingSlots).toEqual([]);
      expect(report.legacyRecoveryProposal).toBeNull();

      // cover-front.png / cover-back.png really are the separate cover assets
      expect(report.bySlotId.get("cover-front")).toBe("cover-front.png");
      expect(report.bySlotId.get("cover-back")).toBe("cover-back.png");

      // 01-greeting.png really is greeting (interior page 1), 02-intro.png really is intro
      expect(report.bySlotId.get("01-greeting")).toBe("01-greeting.png");
      expect(report.bySlotId.get("02-intro")).toBe("02-intro.png");

      // 03-scene-01.png is the first career scene
      expect(report.bySlotId.get("03-scene-01")).toBe("03-scene-01.png");

      // 24-video-qr-background.png is the video-qr background (interior page 24)
      expect(report.bySlotId.get("24-video-qr-background")).toBe("24-video-qr-background.png");
    });

    it("a bare legacy-numbered file (no hardcoded alias) resolves by interior page number, not raw array position — '02.png' is intro, never greeting", () => {
      // Regression: cover-front sits at array index 0 now (a separate,
      // non-page-numbered asset), so a naive "array index N-1" mapping for
      // a bare "NN.png" would put "02.png" on whatever asset happens to sit
      // at index 1 (greeting) instead of interior page 2 (intro).
      const report = matchImportedFiles(["02.png"], dreamBigSlots);
      expect(report.bySlotId.get("02-intro")).toBe("02.png");
      expect(report.bySlotId.get("01-greeting")).toBeUndefined();
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
      expect(shiftChoice!.resultingMissingSlots.map((s) => s.slotId)).toEqual([
        "cover-front", "01-greeting", "02-intro", "24-video-qr-background",
      ]);

      const keepChoice = report.legacyRecoveryChoices?.find((c) => c.interpretation === "KEEP_NUMERIC_SLOTS");
      expect(keepChoice).toBeDefined();
      // All 20 career scenes get a file (cover + intro + 20 careers = 22),
      // so only greeting, closing, video-qr, and the back cover are missing.
      expect(keepChoice!.resultingMissingSlots.map((s) => s.slotId)).toEqual([
        "01-greeting", "23-closing", "24-video-qr-background", "cover-back",
      ]);
    });

    it("KEEP_NUMERIC_SLOTS maps files to cover-front, intro, and all 20 careers; keeps greeting, closing, video-qr, and cover-back missing", () => {
      const report = matchImportedFiles(files22, dreamBigSlots, undefined, {
        bookId: "dream-big",
        legacyInterpretation: "KEEP_NUMERIC_SLOTS",
      });

      expect(report.assignedCount).toBe(22);

      // 01.png mapped to cover-front (the user said these ARE cover/intro)
      expect(report.bySlotId.get("cover-front")).toBe("01.png");
      expect(report.bySlotId.get("02-intro")).toBe("02.png");
      expect(report.bySlotId.get("03-scene-01")).toBe("03.png");
      expect(report.bySlotId.get("22-scene-20")).toBe("22.png");

      // Exact missing slots — greeting, closing, video-qr, and cover-back
      expect(report.missingSlots).toEqual(["01-greeting", "23-closing", "24-video-qr-background", "cover-back"]);
      expect(report.missingSlotDetails).toEqual([
        expect.objectContaining({ slotId: "01-greeting" }),
        expect.objectContaining({ slotId: "23-closing" }),
        expect.objectContaining({ slotId: "24-video-qr-background" }),
        expect.objectContaining({ slotId: "cover-back" }),
      ]);

      // Must NOT have cover-front or 02-intro missing
      expect(report.missingSlots).not.toContain("cover-front");
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
        expect.objectContaining({ slotId: "cover-front", physicalPages: [] }),
        expect.objectContaining({ slotId: "01-greeting", physicalPages: [1] }),
        expect.objectContaining({ slotId: "02-intro", physicalPages: [2] }),
        expect.objectContaining({ slotId: "24-video-qr-background", physicalPages: [24] }),
      ]);

      // Must NOT report 23-closing or cover-back — both got a file.
      const missingIds = report.missingSlots;
      expect(missingIds).not.toContain("23-closing");
      expect(missingIds).not.toContain("cover-back");
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

    it("safely handles slots where filename is undefined without throwing TypeError", () => {
      const slotsWithoutFilename = dreamBigSlots.map((s) => {
        const copy: any = { ...s };
        delete copy.filename;
        return copy;
      });

      expect(() => {
        const report = matchImportedFiles(
          ["cover-front.png", "01-greeting.png", "02-intro.png"],
          slotsWithoutFilename,
        );
        expect(report.matched).toBe(3);
        expect(report.bySlotId.get("cover-front")).toBe("cover-front.png");
      }).not.toThrow();
    });

    it("safely handles slots where expectedFilename is undefined without throwing TypeError", () => {
      const slotsWithoutExpected = dreamBigSlots.map((s) => {
        const copy: any = { ...s };
        delete copy.expectedFilename;
        return copy;
      });

      expect(() => {
        const report = matchImportedFiles(
          ["cover-front.png", "01-greeting.png", "02-intro.png"],
          slotsWithoutExpected,
        );
        expect(report.matched).toBe(3);
        expect(report.bySlotId.get("cover-front")).toBe("cover-front.png");
      }).not.toThrow();
    });
  });
});
