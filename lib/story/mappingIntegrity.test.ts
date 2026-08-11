import { describe, expect, it } from "vitest";
import { dreamBigPrintify24Edition } from "./dreamBigTemplate";
import { resolvePhysicalPageText } from "./editions";
import type { ChildProfile } from "./types";

const mockChild: ChildProfile = { name: "Mehedi", age: 4, gender: "boy" };

describe("STORY SCENE <-> ILLUSTRATION <-> PHYSICAL PAGE MAPPING INTEGRITY", () => {
  it("1. Dream Big Printify edition contains exactly 24 physical interior pages", () => {
    expect(dreamBigPrintify24Edition.physicalPages.length).toBe(24);
    expect(dreamBigPrintify24Edition.interiorPageCount).toBe(24);
  });

  it("2. Physical page numbers are strictly unique and sequential from 1 to 24", () => {
    const pageNums = dreamBigPrintify24Edition.physicalPages.map((p) => p.physicalPageNumber);
    expect(pageNums).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
    ]);
  });

  it("3. Every physical page refers to a valid illustration index and filename", () => {
    for (const p of dreamBigPrintify24Edition.physicalPages) {
      expect(p.illustrationIndex).toBeGreaterThanOrEqual(0);
      expect(p.illustrationIndex).toBeLessThan(dreamBigPrintify24Edition.illustrations.length);
      expect(p.filename).toMatch(/^\d{2}\.png$/);
      expect(p.illustrationNumber).toBe(p.illustrationIndex + 1);
    }
  });

  it("4. Spreads preserve same illustration source across left and right leaves", () => {
    // Intro spread: physical pages 1 & 2 -> illustration index 1 (02.png)
    const p1 = dreamBigPrintify24Edition.physicalPages[0];
    const p2 = dreamBigPrintify24Edition.physicalPages[1];
    expect(p1.illustrationIndex).toBe(1);
    expect(p2.illustrationIndex).toBe(1);
    expect(p1.side).toBe("left");
    expect(p2.side).toBe("right");

    // Closing spread: physical pages 23 & 24 -> illustration index 22 (23.png)
    const p23 = dreamBigPrintify24Edition.physicalPages[22];
    const p24 = dreamBigPrintify24Edition.physicalPages[23];
    expect(p23.illustrationIndex).toBe(22);
    expect(p24.illustrationIndex).toBe(22);
    expect(p23.side).toBe("left");
    expect(p24.side).toBe("right");
  });

  it("5. Every single-page career scene has matching story text, role, and filename", () => {
    const careerMappings = [
      { page: 3, file: "03.png", roleKeyword: "pilot" },
      { page: 4, file: "04.png", roleKeyword: "racing" },
      { page: 5, file: "05.png", roleKeyword: "astronaut" },
      { page: 6, file: "06.png", roleKeyword: "Doctor" },
      { page: 7, file: "07.png", roleKeyword: "firefighter" },
      { page: 8, file: "08.png", roleKeyword: "scientist" },
      { page: 9, file: "09.png", roleKeyword: "officer" },
      { page: 10, file: "10.png", roleKeyword: "soccer" },
      { page: 11, file: "11.png", roleKeyword: "karate" },
      { page: 12, file: "12.png", roleKeyword: "Detective" },
      { page: 13, file: "13.png", roleKeyword: "magician" },
      { page: 14, file: "14.png", roleKeyword: "Chef" },
      { page: 15, file: "15.png", roleKeyword: "rockstar" },
      { page: 16, file: "16.png", roleKeyword: "artist" },
      { page: 17, file: "17.png", roleKeyword: "teacher" },
      { page: 18, file: "18.png", roleKeyword: "explorer" },
      { page: 19, file: "19.png", roleKeyword: "photographer" },
      { page: 20, file: "20.png", roleKeyword: "diver" },
      { page: 21, file: "21.png", roleKeyword: "vet" },
      { page: 22, file: "22.png", roleKeyword: "inventor" },
    ];

    for (const item of careerMappings) {
      const leaf = dreamBigPrintify24Edition.physicalPages.find(
        (p) => p.physicalPageNumber === item.page,
      );
      expect(leaf).toBeDefined();
      expect(leaf?.filename).toBe(item.file);

      const text = resolvePhysicalPageText(leaf!, mockChild);
      expect(text).not.toBeNull();
      expect(text?.toLowerCase()).toContain(item.roleKeyword.toLowerCase());
    }
  });

  it("6. Dream Big Printify edition maps all physical pages to valid filenames", () => {
    expect(dreamBigPrintify24Edition.physicalPages.length).toBe(24);
    for (const p of dreamBigPrintify24Edition.physicalPages) {
      expect(p.filename).toMatch(/^\d{2}\.png$/);
    }
  });
});
